#!/usr/bin/env python3
"""Offline exact-lexeme curriculum planning; no network or third-party packages.

Public API: load(), segment(), analyze_rule(), build_plan(), validate_plan(),
validate_readings(). CLI reports retain provisional permutations for authors, but
--build writes only plans whose complete lesson content passes prefix validation.
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public' / 'data'
HAN = re.compile(r'[\u3400-\u9fff\U00020000-\U0002fa1f〇]+')
FOUNDATION = ('G1-036', 'G1-005', 'G1-029', 'G1-020')
# These are bound forms, not arbitrary independently usable Chinese characters.
SUFFIX_ROOTS = {'边': frozenset('上下里外前后左右东西南北')}
FORM_PINYIN = {'边': ('bian', 'biān'), '有时': ('yǒushí',), '点儿': ('diǎnr',),
               '何': ('hé',), '忽': ('hū',), '矣': ('yǐ',), '儿': ('r', 'ér'),
               '澡': ('zǎo',), '亚': ('yà',), '也罢': ('yěbà',)}


def _json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def _pinyin(value: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFC', value.lower()) if c.isalpha())

def _toneless(value: str) -> str:
    return value.translate(str.maketrans('āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ', 'aaaaeeeeiiiioooouuuuüüüü'))



@dataclass
class Corpus:
    data_dir: Path
    words: dict[int, list[dict]]
    lessons: dict[int, list[dict]]
    forms: dict[str, list[str]]
    index: dict[str, dict]

    def lexicon(self, level: int, ids: Iterable[str] | None = None) -> 'Lexicon':
        allowed = None if ids is None else set(ids)
        return Lexicon((w for n in range(1, level + 1) for w in self.words[n]
                        if allowed is None or w['id'] in allowed),
                       (w for words in self.words.values() for w in words))

    def forms_for(self, grammar_ids: Iterable[str]) -> dict[str, tuple[str, ...]]:
        result: dict[str, tuple[str, ...]] = {}
        for identifier in sorted(grammar_ids):
            for surface in self.forms.get(identifier, []):
                result[surface] = result.get(surface, ()) + (identifier,)
            if identifier == 'G2-008':
                result['AABB'] = (identifier,)
            if identifier in ('G2-004', 'G2-008'):
                result['AA'] = result.get('AA', ()) + (identifier,)
            if identifier == 'G2-004':
                result['A一A'] = (identifier,)
            if identifier == 'G4-022':
                result['啊2'] = (identifier,)
        return result


def load(data_dir: Path | str = DATA, forms_path: Path | str | None = None) -> Corpus:
    """Load immutable official vocabulary, editorial lessons and explicit forms."""
    directory = Path(data_dir)
    path = Path(forms_path) if forms_path else ROOT / 'scripts/sources/grammar-forms.json'
    forms = _json(path) if path.exists() else {}
    corpus = Corpus(directory, {n: _json(directory / f'level-{n}.json') for n in range(1, 8)},
                    {n: _json(directory / f'grammar-level-{n}.json') for n in range(1, 8)},
                    forms, {r['id']: r for r in _json(directory / 'grammar-index.json')})
    if not isinstance(forms, dict):
        raise ValueError('grammar-forms.json must map rule IDs to explicit surface lists')
    for owner, surfaces in forms.items():
        if owner not in corpus.index or not isinstance(surfaces, list) or not surfaces:
            raise ValueError(f'Invalid form owner/list: {owner}')
        if len(set(surfaces)) != len(surfaces):
            raise ValueError(f'Duplicate forms: {owner}')
        evidence = ''.join(corpus.index[owner][field] for field in ('content', 'details', 'category'))
        for surface in surfaces:
            if not isinstance(surface, str) or not HAN.fullmatch(surface):
                raise ValueError(f'Invalid grammatical form: {owner}: {surface!r}')
            if surface not in evidence:
                raise ValueError(f'Form lacks official evidence: {owner}: {surface}')
    return corpus


class Lexicon:
    """A surface index retaining every official identity, including homographs."""
    def __init__(self, words: Iterable[dict], identity_words: Iterable[dict] | None = None):
        self.by_surface: dict[str, list[dict]] = {}
        self.by_id: dict[str, dict] = {}
        for word in words:
            self.by_id[word['id']] = word
            self.by_surface.setdefault(word['hanzi'], []).append(word)
        for entries in self.by_surface.values():
            entries.sort(key=lambda w: (w['level'], w['id']))
        self.max_length = max(map(len, self.by_surface), default=0)
        self.readings: dict[str, set[str]] = {}
        for word in identity_words if identity_words is not None else self.by_id.values():
            self.readings.setdefault(word['hanzi'], set()).update(_pinyin(p) for p in word['pinyin'].split('/'))

    def matches_pinyin(self, surface: str, candidate: str, actual: str) -> bool:
        if candidate == actual:
            return True
        if _toneless(candidate) != _toneless(actual):
            return False
        # Citation vs contextual neutral/sandhi tones may vary, but never merge
        # official homophones differentiated solely by tone (e.g. 得 dé/de).
        alternatives = {p for p in self.readings.get(surface, ()) if _toneless(p) == _toneless(candidate)}
        return len(alternatives) <= 1


def _form_context(surface: str, text: str, start: int, end: int, mention: bool,
                  lexicon: Lexicon, tokens: list[dict]) -> bool:
    if mention and text == surface:
        return True
    if surface in SUFFIX_ROOTS:
        return start > 0 and text[start - 1] in SUFFIX_ROOTS[surface]
    if surface == '忽':
        # Official 忽A忽B: at least one Chinese character in each predicate.
        return bool(re.search(r'忽[^忽]+忽[^忽]+', text))
    if surface == '儿':
        return bool(tokens and tokens[-1]['id'] and tokens[-1]['end'] == start)
    if surface == '澡':
        return '洗澡' in lexicon.by_surface and any(t['surface'] == '洗' for t in tokens)
    if surface == '亚':
        return any(text[end:stop] in lexicon.by_surface for stop in range(end + 1, len(text) + 1))
    return True


def _aabb_pinyin(reading: str) -> list[str]:
    normalized = _pinyin(reading)
    syllable = re.compile(r'(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?[aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+(?:ng|n|r)?')
    for split in range(1, len(normalized)):
        first, second = normalized[:split], normalized[split:]
        if syllable.fullmatch(first) and syllable.fullmatch(second):
            return [first + first + second + second]
    return []


def _span_segment(text: str, lexicon: Lexicon, forms: dict[str, tuple[str, ...]],
                  known: set[str], pinyin: str | None = None,
                  mention: bool = False, boundaries: frozenset[int] = frozenset()) -> dict:
    # A state includes the consumed pinyin offset: polyphonic IDs are never
    # collapsed by surface. Cost first prefers full lexemes, then known IDs.
    target = _pinyin(pinyin) if pinyin is not None else None
    states: dict[tuple[int, int], tuple[tuple, list[dict]]] = {(0, 0): ((0, 0, ()), [])}
    max_length = max(lexicon.max_length, max(map(len, forms), default=0))
    for start in range(len(text)):
        for (position, pronunciation), (cost, tokens) in list(states.items()):
            if position != start:
                continue
            for end in range(start + 1, min(len(text), start + max_length) + 1):
                if any(start < boundary < end for boundary in boundaries):
                    continue
                surface = text[start:end]
                choices = [(w['id'], w['pinyin'].split('/'), None)
                           for w in lexicon.by_surface.get(surface, [])]
                if 'AABB' in forms and len(surface) == 4 and surface[0] == surface[1] and surface[2] == surface[3]:
                    root = surface[0] + surface[2]
                    for word in lexicon.by_surface.get(root, []):
                        readings = [p for reading in word['pinyin'].split('/') for p in _aabb_pinyin(reading)]
                        choices.append((word['id'], readings, forms['AABB']))
                if (surface == '啊' and '啊2' in forms and 'L4-0002' in lexicon.by_id
                        and (start == 0 or start in boundaries)
                        and (end == len(text) or end in boundaries)):
                    choices.append(('L4-0002', ('ā', 'á', 'ǎ', 'à'), forms['啊2']))
                if surface in forms:
                    clause_start = max((b for b in boundaries if b <= start), default=0)
                    clause_end = min((b for b in boundaries if b >= end), default=len(text))
                    if _form_context(surface, text[clause_start:clause_end], start - clause_start,
                                     end - clause_start, mention, lexicon,
                                     [dict(t, start=t['start'] - clause_start, end=t['end'] - clause_start)
                                      for t in tokens if t['start'] >= clause_start]):
                        choices.append((None, FORM_PINYIN.get(surface, ()), forms[surface]))
                for identifier, readings, owners in choices:
                    normalized = [_pinyin(p) for p in readings]
                    offsets = [pronunciation]
                    if target is not None:
                        offsets = [pronunciation + len(p) for p in normalized
                                   if p and (lexicon.matches_pinyin(surface, p, target[pronunciation:pronunciation + len(p)])
                                             or (identifier is not None and start not in boundaries and
                                                 (('AA' in forms and tokens and tokens[-1]['id'] == identifier
                                                   and tokens[-1]['surface'] == surface)
                                                  or ('A一A' in forms and len(tokens) >= 2
                                                      and tokens[-1]['surface'] == '一'
                                                      and tokens[-2]['id'] == identifier
                                                      and tokens[-2]['surface'] == surface))
                                                 and _toneless(target[pronunciation:pronunciation + len(p)]) == target[pronunciation:pronunciation + len(p)]
                                                 and _toneless(p) == target[pronunciation:pronunciation + len(p)]))]
                    for offset in offsets:
                        identity = identifier or '@' + owners[0] + ':' + surface
                        new_cost = (cost[0] + 1, cost[1] + int(identifier is not None and identifier not in known),
                                    cost[2] + (identity,))
                        key = (end, offset)
                        if key not in states or new_cost < states[key][0]:
                            token = {'surface': surface, 'id': identifier, 'start': start, 'end': end}
                            if owners:
                                token['grammarIds'] = list(owners)
                            if surface == '澡':
                                token['dependencyIds'] = [w['id'] for w in lexicon.by_surface.get('洗澡', [])]
                            states[key] = (new_cost, tokens + [token])
    ends = [(cost, tokens) for (pos, pron), (cost, tokens) in states.items()
            if pos == len(text) and (target is None or pron == len(target))]
    if not ends:
        return {'ok': False, 'tokens': [], 'unmatchedAt': max((p for p, _ in states), default=0)}
    _, tokens = min(ends, key=lambda item: item[0])
    return {'ok': True, 'tokens': tokens}


def segment(text: str, lexicon: Lexicon | Iterable[dict], *,
            forms: dict[str, tuple[str, ...]] | None = None,
            known_ids: Iterable[str] = (), pinyin: str | None = None,
            mention: bool = False) -> dict:
    """DP-segment every Chinese span exactly; never invent unknown characters.

    Non-Chinese punctuation/Italian prose delimit spans. With sentence pinyin,
    attempt pronunciation-sensitive matching first, reporting unresolved alignment
    rather than silently conflating different official identities.
    """
    if not isinstance(lexicon, Lexicon):
        lexicon = Lexicon(lexicon)
    known = set(known_ids)
    forms = forms or {}
    matches = list(HAN.finditer(text))
    tokens, failures, ambiguities = [], [], []
    # Full-sentence pinyin follows punctuation boundaries, not Han-span lengths.
    # Segment the joined Chinese sentence to retain one pinyin offset globally.
    joined = ''.join(m.group() for m in matches)
    boundaries, end = set(), 0
    for match in matches[:-1]:
        end += len(match.group())
        boundaries.add(end)
    aligned = _span_segment(joined, lexicon, forms, known, pinyin, mention,
                            frozenset(boundaries)) if pinyin else None
    joined_tokens = aligned['tokens'] if aligned and aligned['ok'] else None
    cursor = 0
    for match in matches:
        snippet = match.group()
        if joined_tokens is not None:
            selected = [dict(t, start=t['start'] - cursor, end=t['end'] - cursor)
                        for t in joined_tokens if cursor <= t['start'] and t['end'] <= cursor + len(snippet)]
            # Never allow a lexical token to bridge punctuation.
            result = {'ok': sum(len(t['surface']) for t in selected) == len(snippet), 'tokens': selected}
            if not result['ok']:
                result = _span_segment(snippet, lexicon, forms, known, mention=mention)
        else:
            result = _span_segment(snippet, lexicon, forms, known, mention=mention)
        if not result['ok']:
            failures.append({'snippet': snippet, 'offset': match.start(),
                             'unmatchedAt': result.get('unmatchedAt', 0), 'reason': 'unsegmentable'})
        else:
            for token in result['tokens']:
                token['start'] += match.start()
                token['end'] += match.start()
                tokens.append(token)
                entries = lexicon.by_surface.get(token['surface'], [])
                if len(entries) > 1:
                    candidates = [w['id'] for w in entries]
                    if pinyin and joined_tokens is not None and token['id']:
                        chosen = lexicon.by_id[token['id']]
                        candidates = [w['id'] for w in entries if _pinyin(w['pinyin']) == _pinyin(chosen['pinyin'])]
                    if len(candidates) > 1:
                        ambiguities.append({'snippet': token['surface'], 'chosenId': token['id'], 'candidateIds': candidates})
        cursor += len(snippet)
    if pinyin and joined_tokens is None and not failures:
        failures.append({'reason': 'pinyin_alignment_unresolved', 'snippet': text, 'pinyin': pinyin})
    return {'ok': not failures, 'tokens': tokens,
            'wordIds': sorted({t['id'] for t in tokens if t['id']} |
                              {identifier for item in ambiguities for identifier in item.get('candidateIds', [])} |
                              {identifier for token in tokens for identifier in token.get('dependencyIds', [])}),
            'grammarIds': sorted({g for token in tokens for g in token.get('grammarIds', [])}),
            'failures': failures, 'ambiguities': ambiguities}


def analyze_rule(rule: dict, lexicon: Lexicon, *,
                 forms: dict[str, tuple[str, ...]] | None = None,
                 known_ids: Iterable[str] = ()) -> dict:
    """Analyze ALL Chinese in titles, patterns, explanations and examples."""
    ids, grammar_ids, failures, ambiguities = set(), set(), [], []
    fields = [(rule['id'], field, rule[field], None) for field in ('title', 'pattern', 'explanation')]
    fields += [(e['id'], 'hanzi', e['hanzi'], e.get('pinyin')) for e in rule['examples']]
    for identifier, field, text, pinyin in fields:
        result = segment(text, lexicon, forms=forms, known_ids=known_ids,
                         pinyin=pinyin, mention=field != 'hanzi')
        ids.update(result['wordIds'])
        grammar_ids.update(result['grammarIds'])
        for key, destination in (('failures', failures), ('ambiguities', ambiguities)):
            destination.extend(dict(item, id=identifier, ruleId=rule['id'], field=field) for item in result[key])
    return {'wordIds': sorted(ids), 'grammarIds': sorted(grammar_ids),
            'failures': failures, 'ambiguities': ambiguities}


def _prior_rules(corpus: Corpus, level: int) -> set[str]:
    return {r['id'] for n in range(1, level) for r in corpus.lessons[n]}


def build_plan(corpus: Corpus, level: int) -> dict:
    """Return a deterministic provisional permutation and explicit failures.

    Required dependencies lead each stage. Spare budget is spent on vocabulary
    needed by the cheapest upcoming rule, then canonical remaining word IDs.
    Only validate_plan can certify the resulting prefix bounds.
    """
    current = {w['id'] for w in corpus.words[level]}
    previous = {w['id'] for n in range(1, level) for w in corpus.words[n]}
    lexicon = corpus.lexicon(level)
    pending = list(corpus.lessons[level])
    order, word_order, known = [], [], set(previous)
    available_rules = _prior_rules(corpus, level)
    count, total = len(pending), len(current)
    while pending:
        budget = total * (len(order) + 1) // count
        candidates = []
        for rule in pending:
            forms = corpus.forms_for(available_rules | {rule['id']})
            analysis = analyze_rule(rule, lexicon, forms=forms, known_ids=known)
            additions = set(analysis['wordIds']) - known
            forced = FOUNDATION[len(order)] if level == 1 and len(order) < len(FOUNDATION) else None
            score = (0 if rule['id'] == forced else 1 if forced else 0,
                     len(word_order) + len(additions) > budget,
                     len(analysis['failures']), len(additions), rule['id'])
            candidates.append((score, rule, additions))
        _, chosen, additions = min(candidates, key=lambda row: row[0])
        for identifier in sorted(additions):
            word_order.append(identifier)
            known.add(identifier)
        order.append(chosen['id'])
        available_rules.add(chosen['id'])
        pending.remove(chosen)
        # Rank useful upcoming dependencies once per stage. Each identity is
        # appended at most once, including duplicate/polyphonic official words.
        upcoming = []
        for rule in pending:
            analysis = analyze_rule(rule, lexicon,
                                    forms=corpus.forms_for(available_rules | {rule['id']}), known_ids=known)
            needed = sorted(set(analysis['wordIds']) - known)
            priority = FOUNDATION.index(rule['id']) if level == 1 and rule['id'] in FOUNDATION else len(FOUNDATION)
            upcoming.append((priority, len(analysis['failures']), len(needed), rule['id'], needed))
        fillers = [identifier for *_, needed in sorted(upcoming) for identifier in needed]
        fillers.extend(sorted(current))
        for identifier in fillers:
            if len(word_order) >= budget:
                break
            if identifier not in known:
                word_order.append(identifier)
                known.add(identifier)
    word_order.extend(sorted(current - set(word_order)))
    plan = {'level': level, 'words': word_order, 'grammar': order}
    result = validate_plan(corpus, plan)
    return {'plan': plan, **result}


def _permutation(actual, expected: set[str], label: str) -> list[dict]:
    if not isinstance(actual, list) or any(not isinstance(item, str) for item in actual):
        return [{'reason': 'invalid_permutation', 'field': label}]
    counts = Counter(actual)
    missing, extra = sorted(expected - counts.keys()), sorted(counts.keys() - expected)
    duplicates = sorted(key for key, count in counts.items() if count != 1)
    return ([{'reason': 'invalid_permutation', 'field': label, 'missing': missing,
              'extra': extra, 'duplicates': duplicates}] if missing or extra or duplicates else [])


def validate_plan(corpus: Corpus, plan: dict) -> dict:
    if not isinstance(plan, dict) or set(plan) != {'level', 'words', 'grammar'}:
        return {'ok': False, 'failures': [{'reason': 'invalid_plan_fields'}], 'ambiguities': []}
    level = plan.get('level')
    if type(level) is not int or level not in range(1, 8):
        return {'ok': False, 'failures': [{'reason': 'invalid_level'}], 'ambiguities': []}
    rules = {r['id']: r for r in corpus.lessons[level]}
    failures = _permutation(plan.get('words'), {w['id'] for w in corpus.words[level]}, 'words')
    failures += _permutation(plan.get('grammar'), set(rules), 'grammar')
    if failures:
        return {'ok': False, 'failures': failures, 'ambiguities': []}
    previous = {w['id'] for n in range(1, level) for w in corpus.words[n]}
    available_rules = _prior_rules(corpus, level)
    ambiguities = []
    full_lexicon = corpus.lexicon(level)
    for position, identifier in enumerate(plan['grammar'], 1):
        cutoff = len(plan['words']) * position // len(rules)
        allowed = previous | set(plan['words'][:cutoff])
        available_rules.add(identifier)
        analysis = analyze_rule(rules[identifier], full_lexicon,
                                forms=corpus.forms_for(available_rules), known_ids=allowed)
        outside = sorted(set(analysis['wordIds']) - allowed)
        if outside:
            failures.append({'reason': 'outside_prefix', 'id': identifier, 'level': level,
                             'position': position, 'cutoff': cutoff, 'wordIds': outside,
                             'words': [full_lexicon.by_id[w]['hanzi'] for w in outside]})
        failures.extend(dict(f, level=level, position=position, cutoff=cutoff) for f in analysis['failures'])
        ambiguities.extend(dict(f, level=level) for f in analysis['ambiguities'])
    return {'ok': not failures, 'failures': failures, 'ambiguities': ambiguities}


def reading_allowance(corpus: Corpus, plan: dict, position: int) -> dict:
    """Return the exact cumulative word/rule allowance for reading 1..10."""
    if position not in range(1, 11):
        raise ValueError('Reading position must be 1..10')
    level = plan['level']
    cutoff = len(plan['words']) * position // 10
    words = {w['id'] for n in range(1, level) for w in corpus.words[n]}
    words.update(plan['words'][:cutoff])
    rules = _prior_rules(corpus, level)
    rules.update(identifier for i, identifier in enumerate(plan['grammar'], 1)
                 if len(plan['words']) * i // len(plan['grammar']) <= cutoff)
    return {'cutoff': cutoff, 'wordIds': words, 'grammarIds': rules}


def authoring_manifest(corpus: Corpus, plans: dict[int, dict]) -> dict:
    """Compact reading-author reference: exact deltas plus cumulative rule IDs."""
    vocabulary = {w['id']: {k: w[k] for k in ('id', 'hanzi', 'pinyin')}
                  for words in corpus.words.values() for w in words}
    grammar = {r['id']: {k: r[k] for k in ('id', 'title', 'pattern')}
               for rules in corpus.lessons.values() for r in rules}
    levels = []
    for level in range(1, 8):
        plan = plans[level]
        stages, previous_cutoff = [], 0
        for position in range(1, 11):
            allowance = reading_allowance(corpus, plan, position)
            stages.append({
                'id': f'R{level}-{position:02d}', 'cutoff': allowance['cutoff'],
                'newWords': [vocabulary[w] for w in plan['words'][previous_cutoff:allowance['cutoff']]],
                'availableGrammarIds': sorted(allowance['grammarIds']),
                'forms': {surface: list(owners) for surface, owners in
                          corpus.forms_for(allowance['grammarIds']).items()},
            })
            previous_cutoff = allowance['cutoff']
        levels.append({'level': level, 'previousWordIds': [
            w['id'] for n in range(1, level) for w in corpus.words[n]], 'stages': stages})
    return {'vocabulary': vocabulary, 'grammar': grammar, 'levels': levels,
            'boundFormContexts': {'边': 'suffix after 上下里外前后左右东西南北',
                                  '忽': 'only the taught 忽A忽B construction',
                                  '儿': 'suffix on an available lexical root, never standalone',
                                  '澡': 'only 洗…澡 in one clause, with 洗澡 already available',
                                  '亚': 'prefix before an available lexical base',
                                  'AABB': 'derive AABB only from available two-character AB root; declare G2-008',
                                  'AA': 'same-root repetition; declare G2-004 (verb) or G2-008 (adjective)',
                                  'A一A': 'same-root verb repetition; declare G2-004',
                                  '啊2': 'G4-022: clause-initial standalone interjection; expressive tone variants retain L4-0002'}}


def validate_readings(corpus: Corpus, plan: dict, readings: list) -> dict:
    level = plan['level']
    failures, ambiguities = [], []
    if not isinstance(readings, list) or len(readings) != 10:
        return {'ok': False, 'failures': [{'reason': 'reading_count', 'level': level, 'expected': 10}], 'ambiguities': []}
    for position, reading in enumerate(readings, 1):
        identifier = f'R{level}-{position:02d}'
        if not isinstance(reading, dict) or set(reading) != {'id', 'title', 'paragraphs', 'grammarIds'}:
            failures.append({'id': identifier, 'reason': 'reading_fields'})
            continue
        if reading['id'] != identifier or not isinstance(reading['title'], str) or not reading['title'].strip() or HAN.search(reading['title']):
            failures.append({'id': identifier, 'reason': 'reading_identity_or_italian_title'})
        allowance = reading_allowance(corpus, plan, position)
        grammar = reading['grammarIds']
        if not isinstance(grammar, list) or any(not isinstance(g, str) for g in grammar):
            failures.append({'id': identifier, 'reason': 'reading_grammar_ids'})
            continue
        invalid = sorted(set(grammar) - allowance['grammarIds'])
        if invalid or len(grammar) != len(set(grammar)):
            failures.append({'id': identifier, 'reason': 'reading_grammar_outside_prefix', 'grammarIds': invalid})
        paragraphs = reading['paragraphs']
        if not isinstance(paragraphs, list) or not paragraphs:
            failures.append({'id': identifier, 'reason': 'reading_paragraphs'})
            continue
        # A reading's declared constructions must account for all bound forms.
        forms = corpus.forms_for(set(grammar) & allowance['grammarIds'])
        lexicon = corpus.lexicon(level)
        for number, paragraph in enumerate(paragraphs, 1):
            if not isinstance(paragraph, str) or not HAN.search(paragraph) or re.search(r'[^\u3400-\u9fff\U00020000-\U0002fa1f〇，。？！；：、！？”“‘’（）《》—…\s]', paragraph):
                failures.append({'id': identifier, 'paragraph': number, 'reason': 'reading_chinese_only'})
                continue
            result = segment(paragraph, lexicon, forms=forms, known_ids=allowance['wordIds'])
            outside = sorted(set(result['wordIds']) - allowance['wordIds'])
            if outside:
                failures.append({'reason': 'reading_words_outside_prefix', 'id': identifier,
                                 'paragraph': number, 'cutoff': allowance['cutoff'],
                                 'wordIds': outside, 'words': [lexicon.by_id[w]['hanzi'] for w in outside]})
            failures.extend(dict(f, id=identifier, paragraph=number, cutoff=allowance['cutoff']) for f in result['failures'])
            ambiguities.extend(dict(f, id=identifier, paragraph=number) for f in result['ambiguities'])
    return {'ok': not failures, 'failures': failures, 'ambiguities': ambiguities}


def report(corpus: Corpus, plans: dict[int, dict] | None = None, *, readings: bool = False) -> dict:
    results = []
    for level in range(1, 8):
        saved = corpus.data_dir / f'curriculum-level-{level}.json'
        if plans is None and not saved.exists():
            result = build_plan(corpus, level)
            result['frozen'] = False
        else:
            plan = plans[level] if plans is not None else _json(saved)
            result = {'plan': plan, 'frozen': True, **validate_plan(corpus, plan)}
        if readings:
            path = corpus.data_dir / f'readings-level-{level}.json'
            reading_result = validate_readings(corpus, result['plan'], _json(path)) if path.exists() else {
                'ok': False, 'failures': [{'reason': 'missing_readings', 'level': level}], 'ambiguities': []}
            result['readings'] = reading_result
            result['ok'] = result['ok'] and reading_result['ok']
        results.append(result)
    return {'ok': all(r['ok'] for r in results), 'levels': results,
            'failureCount': sum(len(r['failures']) + len(r.get('readings', {}).get('failures', [])) for r in results)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--build', action='store_true', help='Freeze each valid level once; never reorder existing plans')
    action.add_argument('--check', action='store_true', help='Check saved plans and all 70 readings')
    action.add_argument('--report', action='store_true', help='JSON provisional plans, lexical failures and identity ambiguities')
    parser.add_argument('--data-dir', type=Path, default=DATA)
    args = parser.parse_args()
    try:
        corpus = load(args.data_dir)
        plans = None
        if args.check:
            plans = {n: _json(args.data_dir / f'curriculum-level-{n}.json') for n in range(1, 8)}
        result = report(corpus, plans, readings=args.check)
        if args.build:
            written = []
            for row in result['levels']:
                if not row['ok'] or row['frozen']:
                    continue
                plan = row['plan']
                path = args.data_dir / f'curriculum-level-{plan["level"]}.json'
                path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
                written.append(plan['level'])
            result['writtenLevels'] = written
        if args.check:
            result['levels'] = [{
                'level': row['plan']['level'],
                'words': len(row['plan']['words']),
                'rules': len(row['plan']['grammar']),
                'validReadings': 10 if row['readings']['ok'] else 0,
                'failures': row['failures'] + row['readings']['failures'],
                'identityAmbiguities': len(row['ambiguities']) + len(row['readings']['ambiguities']),
            } for row in result['levels']]
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result['ok'] else 1
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({'ok': False, 'failures': [{'reason': str(error)}]}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
