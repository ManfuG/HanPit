#!/usr/bin/env python3
"""Check the official grammar spine and the independently authored lessons."""
import argparse
import csv
import hashlib
import io
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public' / 'data'
COUNTS = (48, 81, 81, 76, 71, 67, 148)
SOURCE_HASH = '9a546944af00976a3afb160fe70dd564a035d36eff82eb275b6aed7ed8a9ccf4'
# Primary appendix corrections: 二19 (p.181 / PDF187) also lists 一定;
# A.5.1.4.2 (p.217 / PDF223) classifies 将 by agent/patient, not purpose/cause.
CORRECTIONS = {
    67: {'content': '必须、差不多、好像、一定、也许'},
    297: {'details': '引出施事、受事'},
}
RULE_FIELDS = {'id', 'level', 'sourceNo', 'title', 'pattern', 'explanation', 'examples'}
EXAMPLE_FIELDS = {'id', 'hanzi', 'pinyin', 'translation'}
HANZI = re.compile(r'[\u3400-\u9fff\U00020000-\U0002fa1f〇，。？！；：、]+')
PINYIN = re.compile(r"[A-Za-züÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ êÊ\s'’.,?!;:，。？！；：、-]+")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def inventory():
    source = (ROOT / 'scripts' / 'sources' / 'grammar.csv').read_bytes()
    require(hashlib.sha256(source).hexdigest() == SOURCE_HASH, 'Pinned grammar CSV SHA-256 changed')
    rows = list(csv.DictReader(io.StringIO(source.decode('utf-8'))))
    require(len(rows) == 573, 'Transcription must contain 573 rows before excluding the cross-reference')
    require([int(row['No']) for row in rows] == list(range(1, 574)), 'Source row numbering changed')
    counts = Counter()
    result = []
    for row in rows:
        number = int(row['No'])
        level = 7 if row['Level'] == '7-9' else int(row['Level'])
        if number == 123:
            require(level == 2 and row['Category'].startswith('※') and not row['Content'].strip(),
                    'No123 must remain a non-counted 是……的 cross-reference')
            continue
        counts[level] += 1
        result.append({
            'id': f'G{level}-{counts[level]:03d}', 'level': level, 'sourceNo': number,
            'group': row['Group'], 'category': row['Category'],
            'details': row['Details'], 'content': row['Content'], **CORRECTIONS.get(number, {}),
        })
    require(tuple(counts[level] for level in range(1, 8)) == COUNTS,
            f'Official new-point counts disagree: {dict(counts)}')
    return result


def check_text(value, label):
    require(isinstance(value, str) and value.strip() == value and bool(value), f'{label}: empty/invalid text')
    require(unicodedata.normalize('NFC', value) == value, f'{label}: text must be NFC Unicode')
    require(not re.search(r'\b(?:TODO|TBD|placeholder)\b', value, flags=re.I), f'{label}: unfinished content')


def check_lessons(index):
    all_examples = set()
    totals = []
    for level, count in enumerate(COUNTS, 1):
        path = DATA / f'grammar-level-{level}.json'
        rules = json.loads(path.read_text())
        expected = [row for row in index if row['level'] == level]
        require(isinstance(rules, list) and len(rules) == count, f'{path.name}: expected {count} rules')
        example_count = 0
        for rule, official in zip(rules, expected):
            label = official['id']
            require(isinstance(rule, dict) and set(rule) == RULE_FIELDS, f'{label}: invalid rule fields')
            require(all(rule[key] == official[key] for key in ('id', 'level', 'sourceNo')),
                    f'{label}: identity/order does not match official inventory')
            for field in ('title', 'pattern', 'explanation'):
                check_text(rule[field], f'{label}.{field}')
            examples = rule['examples']
            require(isinstance(examples, list) and len(examples) >= 2, f'{label}: at least two examples required')
            for number, example in enumerate(examples, 1):
                identifier = f'{label}-{number}'
                require(isinstance(example, dict) and set(example) == EXAMPLE_FIELDS,
                        f'{identifier}: invalid example fields')
                require(example['id'] == identifier and identifier not in all_examples,
                        f'{identifier}: invalid/duplicate example identity')
                all_examples.add(identifier)
                for field in ('hanzi', 'pinyin', 'translation'):
                    check_text(example[field], f'{identifier}.{field}')
                require(HANZI.fullmatch(example['hanzi']), f'{identifier}: unsupported Chinese character/punctuation')
                require(PINYIN.fullmatch(example['pinyin'].lower()), f'{identifier}: unsupported pinyin character')
                require(re.search(r'[\u3400-\u9fff]', example['hanzi']), f'{identifier}: no Chinese sentence')
                example_count += 1
        totals.append({'level': level, 'rules': len(rules), 'examples': example_count})
    return totals


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write-index', action='store_true', help='Reproduce the canonical inventory only')
    args = parser.parse_args()
    index = inventory()
    path = DATA / 'grammar-index.json'
    if args.write_index:
        path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
        print('Wrote 572 official points; excluded No123 cross-reference; applied two primary-appendix corrections.')
    else:
        require(json.loads(path.read_text()) == index, 'grammar-index.json differs from canonical source/corrections')
        totals = check_lessons(index)
        print(json.dumps({'rules': sum(item['rules'] for item in totals),
                          'examples': sum(item['examples'] for item in totals), 'levels': totals}, ensure_ascii=False))


if __name__ == '__main__':
    main()
