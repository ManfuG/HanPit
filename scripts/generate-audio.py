#!/usr/bin/env python3
"""Offline Kokoro Mandarin assets. Install audio-requirements.txt in .venv-audio.

This adapter uses Misaki's Apache-2.0 ZH_MAP and ToneSandhi (adapted by
hexgrad from PaddleSpeech, Copyright (c) 2021 PaddlePaddle Authors).
Original implementation below: Copyright 2026 HanPit contributors.
Licensed under the Apache License, Version 2.0; see public/audio/LICENSE.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import shutil
import subprocess
import time
from functools import lru_cache
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import soundfile as sf
from pypinyin import Style, pinyin, pinyin_dict
from pypinyin.contrib.tone_convert import (
    to_normal, to_tone, to_tone3, to_initials, to_finals_tone3,
)
import jieba.posseg as psg
from misaki.zh_frontend import ZH_MAP
from misaki.tone_sandhi import ToneSandhi

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/audio'
REPO = 'hexgrad/Kokoro-82M-v1.1-zh'
REVISION = '01e7505bd6a7a2ac4975463114c3a7650a9f7218'
VOICE = 'zf_001'
RATE = 24000
SPEED = 1.0
FILES = ('config.json', 'kokoro-v1_1-zh.pth', 'voices/zf_001.pt')
EXPECTED_HASHES = {
    'config.json': 'bc333efa5ce4ceff433c8c8e5d027a1eca0166001e4e4a62bea2d26ff7a46890',
    'kokoro-v1_1-zh.pth': 'b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b',
    'voices/zf_001.pt': '9bdc9a87e13e9bb1ea3e7803259c2ecbfebaeeb2ff80b5d0c76df1a464c1c962',
}
SEPARATOR = re.compile(r"[\s'\-]+")
POLICY = {
    'reading': 'First slash-separated dataset reading; never infer polyphones from hanzi.',
    'segmentation': 'Tone-marked pinyin lexicon, explicit apostrophe/space/hyphen boundaries, one syllable per hanzi (explicit suffix r consumes 儿). Hanzi heteronyms only disambiguate syllable boundaries, never replace pinyin.',
    'neutral': 'Unmarked source syllables are tone 5. No dictionary-driven neutralization of explicitly marked lexical tones.',
    'erhua': 'Only explicit source suffix r becomes model R before tone; separately written ér stays a full syllable.',
    'sandhi': 'Misaki/PaddleSpeech contextual third-tone word rule and two-pass boundary merging (at most three characters, no reduplication merge), fed authoritative source tones. 不 before citation tone 4 becomes tone 2; A不A and A一A middle is neutral. 一 before tone 4 becomes 2, before tones 1/2/3 becomes 4; ordinal 第一 and numeric sequences retain citation tone.',
    'limits': 'Isolated vocabulary, not sentence prosody. Source neutral tones preserved, no automatic lexical neutral-tone dictionary. Third-tone phrasing uses deterministic jieba segmentation; not human auditory validated.',
}


def digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def dump(path: Path, value) -> None:
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)


def load_words():
    paths = sorted((ROOT / 'public/data').glob('level-*.json'))
    words = [w for path in paths for w in json.loads(path.read_text())]
    ids = [w['id'] for w in words]
    if len(words) != 11092 or len(set(ids)) != len(ids):
        raise ValueError('Expected exactly 11092 distinct official IDs')
    if any(not re.fullmatch(r'L[1-7]-\d{4}', x) for x in ids):
        raise ValueError('Unsafe or unexpected word ID')
    return paths, words


# Match complete marked syllables, not letters after stripping tone marks.
BASES = {to_normal(s).replace('v', 'ü') for readings in pinyin_dict.pinyin_dict.values()
         for s in readings.split(',')}
SPELLINGS = {}
for base in BASES:
    for tone in range(1, 6):
        spelling = to_tone(base + str(tone))
        if spelling and spelling.isalpha():
            SPELLINGS[spelling] = to_tone3(spelling, neutral_tone_with_five=True)
# Longest candidates first; final choice still requires exact hanzi alignment.
PREFIXES = collections.defaultdict(list)
for spelling, numeric in SPELLINGS.items():
    PREFIXES[spelling[0]].append((spelling, numeric))
for candidates in PREFIXES.values():
    candidates.sort(key=lambda x: (-len(x[0]), x[0]))


@lru_cache(maxsize=None)
def char_readings(char):
    return {to_normal(s).replace('v', 'ü') for row in pinyin(char, style=Style.TONE,
            heteronym=True, errors='default') for s in row}


def syllables(word):
    source = word['pinyin'].split('/')[0].strip().lower()
    if not source:
        raise ValueError(f"{word['id']}: missing Pinyin")
    hanzi = word['hanzi'].replace('-', '').replace(' ', '')
    # Separators are mandatory boundaries; retain their offsets while parsing.
    parts = [x for x in SEPARATOR.split(source) if x]
    text = '|'.join(parts)

    @lru_cache(maxsize=None)
    def parse(offset, index):
        if offset == len(text):
            return [(0, ())] if index == len(hanzi) else []
        if text[offset] == '|':
            return parse(offset + 1, index)
        if index >= len(hanzi):
            return []
        results = []
        for spelling, numeric in PREFIXES.get(text[offset], []):
            if not text.startswith(spelling, offset):
                continue
            end = offset + len(spelling)
            # a/e/o syllables require apostrophe in joined Pinyin.
            if offset and text[offset - 1] != '|' and spelling[0] in 'aeo':
                continue
            alternatives = [(end, index + 1, False)]
            if end < len(text) and text[end] == 'r' and spelling != 'er' and index + 1 < len(hanzi) and hanzi[index + 1] == '儿':
                alternatives.insert(0, (end + 1, index + 2, True))
            for next_offset, next_index, erhua in alternatives:
                if next_offset < len(text) and text[next_offset] != '|' and next_index == len(hanzi):
                    continue
                match = to_normal(spelling).replace('v', 'ü') in char_readings(hanzi[index])
                for score, tail in parse(next_offset, next_index):
                    results.append((score + int(match), ((numeric, erhua, index),) + tail))
        if not results:
            return []
        best = max(score for score, _ in results)
        return list(dict.fromkeys((score, seq) for score, seq in results if score == best))

    choices = parse(0, 0)
    if len(choices) != 1:
        raise ValueError(f"{word['id']} {hanzi} {source}: expected unique segmentation, got {choices[:5]}")
    return hanzi, list(choices[0][1])


SANDHI = ToneSandhi()


def pronunciation(word):
    hanzi, entries = syllables(word)
    # Include the explicit erhua 儿 in character alignment, then remove it later.
    numeric = [''] * len(hanzi)
    for syllable, erhua, index in entries:
        numeric[index] = syllable
        if erhua:
            numeric[index + 1] = 'er5'
    original = numeric[:]
    for i, char in enumerate(hanzi):
        if char == '不' and original[i] == 'bu4' and i + 1 < len(hanzi) and original[i + 1].endswith('4'):
            numeric[i] = 'bu2'
        if i and i + 1 < len(hanzi) and hanzi[i - 1] == hanzi[i + 1] and char in '不一':
            numeric[i] = numeric[i][:-1] + '5'
        elif char == '一' and original[i] == 'yi1' and i + 1 < len(hanzi):
            if (i and hanzi[i - 1] == '第') or all(c.isnumeric() for c in hanzi):
                continue
            following = original[i + 1][-1]
            if following in '1234':
                numeric[i] = 'yi' + ('2' if following == '4' else '4')
    # Use the model frontend's contextual word rule, but feed source readings.
    segments = list(psg.cut(hanzi))
    position = 0
    spans = []
    for segment in segments:
        end = position + len(segment.word)
        spans.append((position, end))
        position = end
    # PaddleSpeech's two contextual merge passes, using authoritative tones
    # instead of upstream lazy_pinyin (which would lose explicit polyphones).
    for require_all in (True, False):
        merged = []
        joined_previous = False
        for span_index, (start, end) in enumerate(spans):
            can_merge = False
            if span_index and not joined_previous:
                previous_start, previous_end = spans[span_index - 1]
                previous_word = hanzi[previous_start:previous_end]
                boundary_three = numeric[previous_end - 1].endswith('3') and numeric[start].endswith('3')
                all_three = all(s.endswith('3') for s in numeric[previous_start:end])
                can_merge = (boundary_three and (not require_all or all_three)
                             and end - previous_start <= 3
                             and not SANDHI._is_reduplication(previous_word))
            if can_merge:
                merged[-1] = (merged[-1][0], end)
            else:
                merged.append((start, end))
            joined_previous = can_merge
        spans = merged
    for start, end in spans:
        numeric[start:end] = SANDHI._three_sandhi(hanzi[start:end], numeric[start:end])
    phones = []
    for citation, erhua, index in entries:
        syllable = numeric[index]
        initial = to_initials(syllable, strict=True)
        final = to_finals_tone3(syllable, strict=True, neutral_tone_with_five=True)
        if final[:-1] == 'i':
            if initial in ('z', 'c', 's'):
                final = 'ii' + final[-1]
            elif initial in ('zh', 'ch', 'sh', 'r'):
                final = 'iii' + final[-1]
        tokens = ([initial] if initial else []) + [final[:-1]] + (['R'] if erhua else []) + [final[-1]]
        try:
            phones.append(''.join(ZH_MAP[token] for token in tokens))
        except KeyError as error:
            raise ValueError(f"{word['id']} unsupported syllable {syllable}: {tokens}") from error
    return {
        'id': word['id'], 'hanzi': word['hanzi'], 'source_pinyin': word['pinyin'],
        'citation': [s + ('+r' if r else '') for s, r, _ in entries],
        'surface': [numeric[i] + ('+r' if r else '') for _, r, i in entries],
        'phonemes': ''.join(phones),
    }


def check_audio(path):
    # libsndfile actually decodes the entire MP3; not just its header.
    audio, rate = sf.read(path, dtype='float32')
    if rate != RATE or audio.ndim != 1 or not np.isfinite(audio).all():
        raise ValueError(f'Invalid sample format: {path}')
    duration = len(audio) / rate
    rms = float(np.sqrt(np.mean(audio * audio)))
    if duration < 0.15 or duration > 30 or rms < 0.001:
        raise ValueError(f'Invalid/silent audio: {path}, {duration=}, {rms=}')
    return {'duration': round(duration, 4), 'rms': round(rms, 6), 'bytes': path.stat().st_size, 'sha256': digest(path)}


def initialize_engine(source, threads):
    """One CPU model load per worker; never ship weights in the web app."""
    import torch
    from kokoro import KModel, KPipeline
    global PIPELINE, PACK
    torch.set_num_threads(threads)
    torch.set_num_interop_threads(1)
    model = KModel(repo_id=REPO, config=str(source['config.json']),
                   model=str(source['kokoro-v1_1-zh.pth'])).to('cpu').eval()
    PIPELINE = KPipeline(lang_code='z', repo_id=REPO, model=model)
    PACK = torch.load(source['voices/zf_001.pt'], map_location='cpu', weights_only=True)


def synthesize(job):
    import torch
    phonemes, target = job
    torch.manual_seed(int(hashlib.sha256(phonemes.encode()).hexdigest()[:8], 16))
    with torch.inference_mode():
        audio = next(PIPELINE.generate_from_tokens(phonemes, voice=PACK, speed=SPEED)).audio.numpy()
    if not np.isfinite(audio).all() or np.sqrt(np.mean(audio * audio)) < 0.001:
        raise ValueError(f'Invalid generated waveform: {phonemes}')
    temp = target.with_suffix('.tmp.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(RATE),
                    '-ac', '1', '-i', 'pipe:0', '-codec:a', 'libmp3lame',
                    '-b:a', '64k', '-ar', str(RATE), '-ac', '1', '-threads',
                    '1', '-y', str(temp)],
                   input=audio.astype('<f4', copy=False).tobytes(), check=True)
    temp.replace(target)
    return check_audio(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', action='store_true', help='Validate every pronunciation without loading model')
    parser.add_argument('--smoke', action='store_true', help='Generate representative cards before the full run')
    parser.add_argument('--validate', action='store_true', help='Decode all files and verify manifest/coverage without model')
    parser.add_argument('--threads', type=int, default=2)
    parser.add_argument('--workers', type=int, default=2)
    args = parser.parse_args()
    if args.workers < 1 or args.threads < 1:
        parser.error('workers and threads must be positive')
    paths, words = load_words()
    OUT.mkdir(exist_ok=True)
    planned = []
    errors = []
    for word in words:
        try:
            planned.append(pronunciation(word))
        except ValueError as error:
            errors.append(str(error))
    if errors:
        raise ValueError('\n'.join(errors))
    print(f'Planned {len(planned)} IDs; {len(set(p["phonemes"] for p in planned))} unique pronunciations', flush=True)
    if args.plan:
        return
    manifest_path = OUT / 'manifest.json'
    if args.validate:
        manifest = json.loads(manifest_path.read_text())
        if manifest['settings']['generator_sha256'] != digest(Path(__file__)):
            raise ValueError('Generator differs from manifest; regenerate before validation')
        if manifest['inputs'] != {p.name: digest(p) for p in paths}:
            raise ValueError('Vocabulary differs from manifest')
        actual = {p.stem for p in OUT.glob('*.mp3')}
        expected = {w['id'] for w in words}
        if actual != expected or set(manifest['clips']) != expected:
            raise ValueError(f'Coverage mismatch: missing={expected - actual}, extra={actual - expected}')
        for item in planned:
            old = manifest['clips'][item['id']]
            if any(old[k] != v for k, v in item.items()):
                raise ValueError(f'Pronunciation mismatch: {item["id"]}')
            checked = check_audio(OUT / (item['id'] + '.mp3'))
            if checked != old['audio']:
                raise ValueError(f'Audio differs: {item["id"]}')
        print(json.dumps({'validated': len(actual), 'total_bytes': sum(c['audio']['bytes'] for c in manifest['clips'].values()), 'min_duration': min(c['audio']['duration'] for c in manifest['clips'].values()), 'min_rms': min(c['audio']['rms'] for c in manifest['clips'].values())}), flush=True)
        return
    from huggingface_hub import hf_hub_download
    source = {name: Path(hf_hub_download(REPO, name, revision=REVISION, local_dir=ROOT / '.venv-audio/model')) for name in FILES}
    sources = {name: digest(path) for name, path in source.items()}
    if sources != EXPECTED_HASHES:
        raise ValueError(f'Model source hash mismatch: {sources}')
    packages = {d.metadata['Name']: d.version for d in importlib.metadata.distributions()}
    settings = {'repo': REPO, 'revision': REVISION, 'source_sha256': sources, 'voice': VOICE,
                'sample_rate': RATE, 'speed': SPEED, 'encoder': 'libmp3lame 64kbps mono', 'policy': POLICY,
                'generator_sha256': digest(Path(__file__)), 'packages': packages,
                'seed': 'Per-pronunciation SHA256 first 8 hex digits',
                'workers': args.workers, 'threads_per_worker': args.threads,
                'ffmpeg': subprocess.check_output(['ffmpeg', '-version'], text=True).splitlines()[0]}
    fingerprint = hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).hexdigest()
    manifest = {'fingerprint': fingerprint, 'settings': settings, 'inputs': {p.name: digest(p) for p in paths}, 'clips': {}}
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text())
        if previous.get('fingerprint') == fingerprint and previous.get('inputs') == manifest['inputs']:
            manifest['clips'] = previous['clips']
    vocab = json.loads(source['config.json'].read_text())['vocab']
    unknown = set(''.join(item['phonemes'] for item in planned)) - set(vocab)
    if unknown:
        raise ValueError(f'Unknown model phonemes {unknown}')
    if args.smoke:
        wanted = {'爱', '爸爸', '谁', '熟', '银行', '行', '长', '长城', '音乐', '快乐', '女儿', '女孩儿', '你好', '一个', '不要', '西安'}
        selected = [p for p in planned if p['hanzi'] in wanted]
    else:
        selected = planned
    cache = {}
    for key, clip in manifest['clips'].items():
        path = OUT / (key + '.mp3')
        if path.exists() and digest(path) == clip['audio']['sha256']:
            cache[clip['phonemes']] = path
    started = time.monotonic()
    synthesized = 0
    copied = 0
    groups = collections.defaultdict(list)
    for item in selected:
        target = OUT / (item['id'] + '.mp3')
        old = manifest['clips'].get(item['id'])
        if old and all(old.get(k) == v for k, v in item.items()) and target.exists() and digest(target) == old['audio']['sha256']:
            continue
        groups[item['phonemes']].append(item)

    def record(items, original, info):
        nonlocal copied
        for item in items:
            target = OUT / (item['id'] + '.mp3')
            if target != original:
                shutil.copyfile(original, target)
                copied += 1
            manifest['clips'][item['id']] = {**item, 'audio': info}
            if args.smoke:
                print(json.dumps({**item, **info}, ensure_ascii=False), flush=True)

    jobs = []
    for phonemes, items in groups.items():
        if phonemes in cache:
            record(items, cache[phonemes], check_audio(cache[phonemes]))
        else:
            jobs.append((phonemes, OUT / (items[0]['id'] + '.mp3')))
    with ProcessPoolExecutor(max_workers=args.workers, initializer=initialize_engine,
                             initargs=(source, args.threads)) as pool:
        for job, info in zip(jobs, pool.map(synthesize, jobs, chunksize=1)):
            record(groups[job[0]], job[1], info)
            synthesized += 1
            if synthesized % 50 == 0 or args.smoke:
                dump(manifest_path, manifest)
            if synthesized % 100 == 0:
                elapsed = time.monotonic() - started
                print(f'{len(manifest["clips"])}/{len(selected)} IDs; synthesized={synthesized}; reused={copied}; {elapsed:.1f}s; {synthesized / elapsed:.2f} synth/s', flush=True)
    dump(manifest_path, manifest)
    elapsed = time.monotonic() - started
    print(json.dumps({'selected': len(selected), 'synthesized': synthesized, 'reused': copied, 'seconds': round(elapsed, 2), 'synth_per_second': round(synthesized / elapsed, 3), 'total_bytes': sum(c['audio']['bytes'] for c in manifest['clips'].values()), 'source_sha256': sources}), flush=True)


if __name__ == '__main__':
    main()
