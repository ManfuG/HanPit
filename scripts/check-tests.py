#!/usr/bin/env python3
"""Check English vocabulary meanings and the official polyphonic-form index."""
import argparse
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'public/data'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write-pinyin', action='store_true')
    args = parser.parse_args()
    readings, counts, levels = {}, {}, []
    for level in range(1, 8):
        words = json.loads((DATA / f'level-{level}.json').read_text())
        for word in words:
            gloss = word['meaning']
            if not isinstance(gloss, str) or not gloss.strip():
                raise ValueError(f'{word["id"]}: missing English meaning')
            counts[word['hanzi']] = counts.get(word['hanzi'], 0) + 1
            variants = readings.setdefault(word['hanzi'], [])
            if word['pinyin'] not in variants:
                variants.append(word['pinyin'])
        levels.append({'level': level, 'words': len(words)})
    expected_index = {hanzi: variants for hanzi, variants in readings.items() if counts[hanzi] > 1}
    path = DATA / 'test-pinyin.json'
    if args.write_pinyin:
        path.write_text(json.dumps(expected_index, ensure_ascii=False, indent=2) + '\n')
    if json.loads(path.read_text()) != expected_index:
        raise ValueError('Pinyin ambiguity index differs from the official vocabulary')
    print(json.dumps({'ok': True, 'levels': levels, 'duplicateForms': len(expected_index)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
