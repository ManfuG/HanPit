#!/usr/bin/env python3
"""Generate offline grammar sentences using .venv-audio and the frozen vocabulary engine.

Default input is all seven grammar-level-N.json files. --plan checks complete
coverage and phonetics without loading weights; --validate decodes every asset.
For isolated authored smoke data use --input FILE --allow-partial --output DIR;
partial corpora cannot write the production audio directory.

Copyright 2026 HanPit contributors. Apache-2.0; see public/audio/LICENSE.
"""
from __future__ import annotations

import argparse
import collections
from concurrent.futures import ProcessPoolExecutor
import hashlib
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import unicodedata

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/audio/grammar'
VOCAB_PATH = ROOT / 'scripts/generate-audio.py'
INDEX = ROOT / 'public/data/grammar-index.json'
_spec = importlib.util.spec_from_file_location('hanpit_vocabulary_audio', VOCAB_PATH)
VOCAB = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = VOCAB
_spec.loader.exec_module(VOCAB)

PUNCTUATION = dict(zip('，。？！；：、,.?!;:', ',.?!;:,,.?!;:'))
HANZI = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\U00020000-\U0002fa1f]+')
LEVEL_COUNTS = {1: 48, 2: 81, 3: 81, 4: 76, 5: 71, 6: 67, 7: 148}
POLICY = {
    'reading': 'Authored, reviewed example Pinyin is authoritative; no alternative readings or hanzi-inferred tones.',
    'clauses': 'Hanzi and Pinyin punctuation must align exactly after Chinese/ASCII punctuation normalization; enumeration comma becomes comma. Apply the frozen pronunciation adapter independently to every clause. Preserve model punctuation and spaces between clauses; never apply sandhi across punctuation.',
    'pinyin': 'NFC, case-insensitive, whitespace word boundaries and apostrophes; explicit ü, attached erhua r and unmarked neutral tones retained. Citation tones receive the frozen adapter contextual sandhi within clauses only.',
    'yi': 'Preserve 一 in compound-word final position, ordinals, digit strings, numeral-final positions and decimal digits. Before authored neutral syllables, use the matching dictionary base reading only to determine underlying sandhi tone; never replace its authored neutral tone or polyphone.',
    'limits': 'Reject unknown model phonemes and strings longer than 510 tokens before synthesis; raw-token inference speaks the complete sentence without automatic splitting or truncation. Every MP3 must decode as finite 24kHz mono, 0.15–30 seconds, RMS >= 0.001. No human auditory validation is claimed.',
    'adapter': VOCAB.POLICY,
}


def split_clauses(text, *, hanzi, example_id):
    """Return (text, normalized following punctuation) pairs, never discard pauses."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f'{example_id}: missing {"Hanzi" if hanzi else "Pinyin"}')
    text = unicodedata.normalize('NFC', text.strip())
    if not hanzi:
        text = text.lower().replace('’', "'")
    clauses = []
    start = 0
    for offset, char in enumerate(text):
        if char in PUNCTUATION:
            clause = text[start:offset].strip()
            if not clause:
                raise ValueError(f'{example_id}: empty clause or consecutive punctuation in {text!r}')
            clauses.append((clause, PUNCTUATION[char]))
            start = offset + 1
    tail = text[start:].strip()
    if tail:
        clauses.append((tail, ''))
    for clause, _ in clauses:
        if hanzi:
            if not HANZI.fullmatch(clause):
                raise ValueError(f'{example_id}: unsupported Hanzi characters in {clause!r}; spell numbers in Chinese')
        else:
            allowed = set(''.join(VOCAB.SPELLINGS)) | {"'"}
            if any(char not in allowed and not char.isspace() for char in clause):
                raise ValueError(f'{example_id}: unsupported Pinyin characters in {clause!r}')
    return clauses


def clause_pronunciation(word):
    result = VOCAB.pronunciation(word)
    if '一' not in word['hanzi']:
        return result
    hanzi, entries = VOCAB.syllables(word)
    protected = set()
    compound_ends = set()
    offset = 0
    for part in word['pinyin'].split():
        spelling = part.replace("'", '')
        offset += len(spelling)
        if len(spelling) > 2:
            compound_ends.add(offset)
    offset = 0
    for numeric, erhua, index in entries:
        offset += len(VOCAB.to_tone(numeric)) + int(erhua)
        if numeric == 'yi1' and offset in compound_ends:
            protected.add(index)
    for match in re.finditer(r'第?[零一二两三四五六七八九十百千万亿]+(?:点[零一二三四五六七八九]+)?', hanzi):
        integer, dot, fraction = match.group().partition('点')
        if integer.startswith('第') or (len(integer) > 1 and all(c in '零一二三四五六七八九' for c in integer)):
            protected.update(range(match.start(), match.start() + len(integer)))
        if integer.endswith('一') and (len(integer) > 1 or dot):
            protected.add(match.start() + len(integer) - 1)
        if dot:
            protected.update(range(match.end() - len(fraction), match.end()))
    for position, (numeric, _, index) in enumerate(entries):
        if numeric != 'yi1' or hanzi[index] != '一':
            continue
        if index in protected:
            result['surface'][position] = 'yi1'
        elif position + 1 < len(entries) and entries[position + 1][0].endswith('5'):
            following, _, next_index = entries[position + 1]
            readings = VOCAB.pinyin(hanzi[next_index], style=VOCAB.Style.TONE3,
                                    heteronym=True, neutral_tone_with_five=True)[0]
            underlying = next((reading[-1] for reading in readings
                               if reading[:-1] == following[:-1] and reading[-1] in '1234'), None)
            if underlying:
                result['surface'][position] = 'yi2' if underlying == '4' else 'yi4'
    # The pinned v1.1 ZH_MAP encodes exactly one trailing digit per syllable.
    tones = iter(syllable.replace('+r', '')[-1] for syllable in result['surface'])
    result['phonemes'] = ''.join(next(tones) if char in '12345' else char for char in result['phonemes'])
    return result


def sentence_pronunciation(example):
    example_id = example['id']
    hanzi_clauses = split_clauses(example['hanzi'], hanzi=True, example_id=example_id)
    pinyin_clauses = split_clauses(example['pinyin'], hanzi=False, example_id=example_id)
    if [p for _, p in hanzi_clauses] != [p for _, p in pinyin_clauses]:
        raise ValueError(f'{example_id}: Hanzi/Pinyin clause count or punctuation mismatch')
    clauses = []
    for index, ((hanzi, punctuation), (pinyin, _)) in enumerate(zip(hanzi_clauses, pinyin_clauses), 1):
        clause = clause_pronunciation({'id': f'{example_id}:clause{index}', 'hanzi': hanzi, 'pinyin': pinyin})
        clauses.append({key: value for key, value in clause.items() if key != 'id'} | {'punctuation': punctuation})
    phonemes = ' '.join(clause['phonemes'] + clause['punctuation'] for clause in clauses)
    if not phonemes or len(phonemes) > 510:
        raise ValueError(f'{example_id}: phoneme token count {len(phonemes)} outside 1–510; shorten the example')
    return {'id': example_id, 'hanzi': example['hanzi'], 'source_pinyin': example['pinyin'],
            'clauses': clauses, 'phonemes': phonemes}


def load_examples(paths, allow_partial=False):
    inventory = json.loads(INDEX.read_text())
    indexed = {rule['id']: rule for rule in inventory}
    if len(indexed) != 572 or collections.Counter(rule['level'] for rule in inventory) != LEVEL_COUNTS:
        raise ValueError('Canonical grammar index must contain 572 distinct rules with the frozen level counts')
    rules = []
    for path in paths:
        data = json.loads(path.read_text())
        if not isinstance(data, list):
            raise ValueError(f'{path}: expected an array of grammar rules')
        rules.extend(data)
    ids = [rule['id'] for rule in rules]
    if not rules or len(set(ids)) != len(ids):
        raise ValueError('Grammar inputs must contain distinct, nonempty rule IDs')
    if not allow_partial and set(ids) != set(indexed):
        raise ValueError(f'Expected all 572 rules: missing={sorted(set(indexed) - set(ids))}, extra={sorted(set(ids) - set(indexed))}')
    examples = []
    for rule in rules:
        expected = indexed.get(rule['id'])
        if expected is None or any(rule.get(key) != expected[key] for key in ('level', 'sourceNo')):
            raise ValueError(f'{rule["id"]}: rule ID/level/sourceNo differs from the canonical index')
        if not all(isinstance(rule.get(key), str) and rule[key].strip() for key in ('title', 'pattern', 'explanation')):
            raise ValueError(f'{rule["id"]}: missing authored teaching content')
        if not isinstance(rule.get('examples'), list) or len(rule['examples']) < 2:
            raise ValueError(f'{rule["id"]}: at least two examples required')
        for index, example in enumerate(rule['examples'], 1):
            if example.get('id') != f'{rule["id"]}-{index}':
                raise ValueError(f'{rule["id"]}: invalid example ID at position {index}')
            if not isinstance(example.get('translation'), str) or not example['translation'].strip():
                raise ValueError(f'{example["id"]}: missing Italian translation')
            examples.append(example)
    if len({example['id'] for example in examples}) != len(examples):
        raise ValueError('Duplicate example IDs')
    return examples, len(rules)


def model_sources(download=False):
    if download:
        from huggingface_hub import hf_hub_download
        source = {name: Path(hf_hub_download(VOCAB.REPO, name, revision=VOCAB.REVISION,
                                           local_dir=ROOT / '.venv-audio/model')) for name in VOCAB.FILES}
    else:
        source = {name: ROOT / '.venv-audio/model' / name for name in VOCAB.FILES}
    hashes = {name: VOCAB.digest(path) for name, path in source.items()}
    if hashes != VOCAB.EXPECTED_HASHES:
        raise ValueError(f'Pinned model source hash mismatch: {hashes}')
    return source


def check_phonemes(planned, config_path):
    if VOCAB.digest(config_path) != VOCAB.EXPECTED_HASHES['config.json']:
        raise ValueError('Pinned model config hash mismatch')
    alphabet = set(json.loads(config_path.read_text())['vocab'])
    for item in planned:
        unknown = set(item['phonemes']) - alphabet
        if unknown:
            raise ValueError(f'{item["id"]}: unknown model phonemes {sorted(unknown)}')
        if not 1 <= len(item['phonemes']) <= 510:
            raise ValueError(f'{item["id"]}: phoneme token limit exceeded')


def make_manifest(paths, args):
    settings = {
        'repo': VOCAB.REPO, 'revision': VOCAB.REVISION, 'source_sha256': VOCAB.EXPECTED_HASHES,
        'voice': VOCAB.VOICE, 'sample_rate': VOCAB.RATE, 'speed': VOCAB.SPEED,
        'encoder': 'libmp3lame 64kbps mono', 'policy': POLICY,
        'generator_sha256': VOCAB.digest(Path(__file__)), 'vocabulary_generator_sha256': VOCAB.digest(VOCAB_PATH),
        'packages': {d.metadata['Name']: d.version for d in importlib.metadata.distributions()},
        'seed': 'Per-pronunciation SHA256 first 8 hex digits',
        'workers': args.workers, 'threads_per_worker': args.threads,
        'ffmpeg': subprocess.check_output(['ffmpeg', '-version'], text=True).splitlines()[0],
        'partial_corpus': args.allow_partial,
    }
    inputs = {'grammar-index.json': VOCAB.digest(INDEX)}
    for path in paths:
        if path.name in inputs:
            raise ValueError(f'Duplicate input filename: {path.name}')
        inputs[path.name] = VOCAB.digest(path)
    fingerprint = hashlib.sha256(json.dumps({'settings': settings, 'inputs': inputs}, sort_keys=True).encode()).hexdigest()
    return {'fingerprint': fingerprint, 'settings': settings, 'inputs': inputs, 'clips': {}}


def initialize_worker(source, threads):
    VOCAB.initialize_engine(source, threads)


def synthesize_job(job):
    return VOCAB.synthesize(job)


def validate_assets(output, manifest, expected_manifest, planned):
    if manifest.get('fingerprint') != expected_manifest['fingerprint'] or any(
            manifest.get(key) != expected_manifest[key] for key in ('settings', 'inputs')):
        raise ValueError('Generator, reused adapter, input, model or runtime settings changed; regenerate first')
    expected = {item['id'] for item in planned}
    actual = {path.stem for path in output.glob('*.mp3')}
    if actual != expected or set(manifest.get('clips', {})) != expected:
        raise ValueError(f'Coverage mismatch: missing={sorted(expected - actual)}, extra={sorted(actual - expected)}')
    for item in planned:
        old = manifest['clips'][item['id']]
        if any(old.get(key) != value for key, value in item.items()):
            raise ValueError(f'{item["id"]}: full sentence pronunciation differs from manifest')
        if VOCAB.check_audio(output / (item['id'] + '.mp3')) != old['audio']:
            raise ValueError(f'{item["id"]}: decoded audio differs from manifest')
    return {'validated': len(planned),
            'total_bytes': sum(clip['audio']['bytes'] for clip in manifest['clips'].values()),
            'min_duration': min(clip['audio']['duration'] for clip in manifest['clips'].values()),
            'max_duration': max(clip['audio']['duration'] for clip in manifest['clips'].values()),
            'min_rms': min(clip['audio']['rms'] for clip in manifest['clips'].values())}


def generate_assets(output, manifest, planned, source, args):
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / 'manifest.json'
    expected = {item['id'] for item in planned}
    extra = {path.stem for path in output.glob('*.mp3')} - expected
    if extra:
        raise ValueError(f'Unexpected MP3 assets in output directory: {sorted(extra)}; choose a clean output directory')
    if manifest_path.exists():
        old = json.loads(manifest_path.read_text())
        if old.get('fingerprint') == manifest['fingerprint'] and all(old.get(key) == manifest[key] for key in ('inputs', 'settings')):
            manifest['clips'] = {key: value for key, value in old['clips'].items() if key in expected}
    cache = {}
    for example_id, clip in manifest['clips'].items():
        path = output / (example_id + '.mp3')
        if path.exists() and VOCAB.digest(path) == clip['audio']['sha256']:
            cache[clip['phonemes']] = path
    groups = collections.defaultdict(list)
    skipped = 0
    for item in planned:
        target = output / (item['id'] + '.mp3')
        old = manifest['clips'].get(item['id'])
        if old and all(old.get(key) == value for key, value in item.items()) and target.exists() and VOCAB.digest(target) == old['audio']['sha256']:
            skipped += 1
        else:
            groups[item['phonemes']].append(item)
    copied = 0

    def record(items, original, audio):
        nonlocal copied
        for item in items:
            target = output / (item['id'] + '.mp3')
            if target != original:
                temp = target.with_suffix('.tmp.mp3')
                shutil.copyfile(original, temp)
                temp.replace(target)
                copied += 1
            manifest['clips'][item['id']] = {**item, 'audio': audio}

    jobs = []
    for phonemes, items in groups.items():
        cached = cache.get(phonemes)
        if cached is not None:
            record(items, cached, VOCAB.check_audio(cached))
        else:
            jobs.append((phonemes, output / (items[0]['id'] + '.mp3')))
    started = time.monotonic()
    synthesized = 0
    VOCAB.dump(manifest_path, manifest)
    if jobs:
        with ProcessPoolExecutor(max_workers=args.workers, initializer=initialize_worker,
                                 initargs=(source, args.threads)) as pool:
            for job, audio in zip(jobs, pool.map(synthesize_job, jobs, chunksize=1)):
                record(groups[job[0]], job[1], audio)
                synthesized += 1
                if synthesized % 10 == 0:
                    VOCAB.dump(manifest_path, manifest)
                if synthesized % 50 == 0:
                    print(f'{len(manifest["clips"])}/{len(planned)} IDs; synthesized={synthesized}; copied={copied}; {time.monotonic() - started:.1f}s', flush=True)
    VOCAB.dump(manifest_path, manifest)
    elapsed = time.monotonic() - started
    return {'selected': len(planned), 'synthesized': synthesized, 'copied': copied, 'resumed': skipped,
            'seconds': round(elapsed, 2), 'total_bytes': sum(clip['audio']['bytes'] for clip in manifest['clips'].values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--plan', action='store_true', help='Check coverage, clause alignment and model phonemes without loading weights')
    mode.add_argument('--validate', action='store_true', help='Check fingerprint, exact coverage and fully decode every MP3 without loading weights')
    parser.add_argument('--input', type=Path, action='append', help='Grammar JSON input; repeat for multiple files')
    parser.add_argument('--allow-partial', action='store_true', help='Allow canonical rule subsets in an isolated output directory only')
    parser.add_argument('--output', type=Path, default=OUT)
    parser.add_argument('--workers', type=int, default=2)
    parser.add_argument('--threads', type=int, default=2)
    args = parser.parse_args()
    if args.workers < 1 or args.threads < 1:
        parser.error('workers and threads must be positive')
    output = args.output.resolve()
    if args.allow_partial and output == OUT.resolve():
        parser.error('--allow-partial requires --output outside public/audio/grammar')
    paths = [path.resolve() for path in args.input] if args.input else [ROOT / f'public/data/grammar-level-{level}.json' for level in range(1, 8)]
    examples, rule_count = load_examples(paths, args.allow_partial)
    planned = []
    errors = []
    for example in examples:
        try:
            planned.append(sentence_pronunciation(example))
        except (ValueError, KeyError) as error:
            errors.append(f'{example.get("id", "unknown")}: {error}')
    if errors:
        raise ValueError('\n'.join(errors))
    check_phonemes(planned, ROOT / '.venv-audio/model/config.json')
    print(json.dumps({'rules': rule_count, 'examples': len(planned),
                      'unique_pronunciations': len({item['phonemes'] for item in planned}),
                      'max_phoneme_tokens': max(len(item['phonemes']) for item in planned)}, ensure_ascii=False), flush=True)
    if args.plan:
        return
    source = model_sources(download=not args.validate)
    manifest = make_manifest(paths, args)
    if args.validate:
        result = validate_assets(output, json.loads((output / 'manifest.json').read_text()), manifest, planned)
    else:
        result = generate_assets(output, manifest, planned, source, args)
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
