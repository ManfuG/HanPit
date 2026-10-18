# HanPit vocabulary and grammar: GF0025-2021

The seven `level-*.json` files contain **all 11,092 official vocabulary entries**, not a selection of convenient dictionary headwords. Definitions are **English**, not Italian translations. The interface language does not change the dictionary's language.

| File | Official new entries | Cumulative |
| --- | ---: | ---: |
| `level-1.json` | 500 | 500 |
| `level-2.json` | 772 | 1,272 |
| `level-3.json` | 973 | 2,245 |
| `level-4.json` | 1,000 | 3,245 |
| `level-5.json` | 1,071 | 4,316 |
| `level-6.json` | 1,140 | 5,456 |
| `level-7.json` | 5,636 | 11,092 |

**Level 7 represents the single official shared levels 7–9 block.** It is not an invented split into three lists. This is the 2021 standard, not a claim about a later examination syllabus.

## Sources, immutable revisions and attribution

1. **Official standard:** Ministry of Education of the People's Republic of China, [国际中文教育中文水平等级标准, GF0025-2021](https://www.moe.gov.cn/jyb_sjzl/ziliao/A19/202111/t20211118_580755.html). The Ministry is the author of the standard; the transcription below is an independent community transcription, not an official JSON release.
2. **Official-entry spine:** Ivan Krasilnikov, [ivankra/hsk30](https://github.com/ivankra/hsk30), `hsk30.csv`, commit [`4ff9e3915ce87baaecd7ebe263085573a4ea3192`](https://github.com/ivankra/hsk30/tree/4ff9e3915ce87baaecd7ebe263085573a4ea3192). This transcription cross-checks the official PDF, official Chinese Test query data, elkmovie/hsk30 and shawkynasr/HSK-official-Query-System. SHA-256: `8c2b73f74776240bcf154624730fc6fb2c42c254d5c5d0f88943878b8e575b9b`.
3. **Modern dictionary forms and English glosses:** Yanis Zafirópulos (Dr.Kameleon), [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary), obtained from the [jelleverheyen/hsk-vocabulary fork](https://github.com/jelleverheyen/hsk-vocabulary), `complete.json`, commit [`a66fd30b9580da2c2af7eb19e4b9d8099a29c061`](https://github.com/jelleverheyen/hsk-vocabulary/tree/a66fd30b9580da2c2af7eb19e4b9d8099a29c061). Its definitions derive from CC-CEDICT. SHA-256: `fc474be223d2196b13bfc7c13e10054f1793c2f840eb1287dfc9620fa0d507d2`.
4. **Original dictionary references and supplementary evidence:** **CC-CEDICT, published by MDBG, created and maintained by the CC-CEDICT community**, including the earlier CEDICT work of Paul Andrew Denisowski (1997, 1998). [CC-CEDICT home and current downloads](https://www.mdbg.net/chinese/dictionary?page=cc-cedict); [project wiki](https://cc-cedict.org/wiki/). The importer uses Régis Behmo's [regisb/CC-CEDICT mirror](https://github.com/regisb/CC-CEDICT), `cedict_ts.u8`, commit [`a8e7ebcc6b7d19f6a615f9f1e8b1e3df6fad1e38`](https://github.com/regisb/CC-CEDICT/tree/a8e7ebcc6b7d19f6a615f9f1e8b1e3df6fad1e38), a snapshot published on 2013-08-28 with 107,619 entries. SHA-256: `8b77bf4833807411e7f221c007b97e7982955c790e9655dd4afda36b56283147`. The old snapshot supplements references and supplies explicit lexical evidence; it does not replace the newer primary dictionary wholesale.

Neural pronunciations are generated separately under `../audio/` from this dataset's pinyin using Kokoro v1.1-zh. They are synthetic audio, not recordings supplied by the dictionary sources. Model attribution and synthesis policy are bundled with the audio.

## Reproduction and coverage

From the project root, with Node 24 or newer and network access:

```sh
node scripts/import-vocabulary.mjs
```

The importer uses only Node built-ins. Every fetched URL contains a commit SHA, and the downloaded bytes must also match their recorded SHA-256. It validates all entries before writing any level: exact official counts, continuous original IDs within each level, 11,092 unique IDs, clean Chinese spelling, nonempty pinyin without spurious digits, real English glosses, and the existence of every editorial evidence key. Missing mappings abort the import; there is no Chinese-only or placeholder fallback. Stable source order and formatting, no dates, and no randomized choices make repeated successful imports byte-for-byte deterministic.

The completed import reports:

- **11,027 entries** mapped through exact official CC-CEDICT keys (traditional spelling, simplified spelling **and pronunciation**).
- **65 ID-scoped editorial mappings**, each with explicit dictionary evidence keys in `OVERRIDES` in the importer. These cover 44 absent or incompatible exact-key mappings, the 做证 alias, two numbered 称 senses, and 18 bound-morpheme sense refinements.
- **42 of the exact-key entries** require reference/alias resolution or supplementary original dictionary content; this is a subset of 11,027, not an additional entry count.
- **100% official identity coverage**, with zero omitted entries and zero generic fallback definitions.

### Representation and editorial changes

Every output object has `id`, `level`, `hanzi`, `pinyin`, and `meaning`. The official IDs (`L1-0001` through `L7-5636`, within their respective levels) are persisted identities, independent of spelling and display text. Never regenerate IDs from a dictionary ordering or deduplicate identical spellings: 面1/面2 and 称1/称2 are separate official entries.

- `hanzi` uses the **first genuine simplified variant**, without `|`, numerical sense labels, ellipses, or parenthesized examples. For example, 爸爸|爸 becomes 爸爸; 第（第二） becomes 第; …分之… becomes 分之. Examples do not become extra vocabulary cards. Optional and alternate written forms remain available in the pinned source transcription; they are not invented extra entries.
- Pinyin comes from that official primary variant. When the same primary spelling has two official readings, both are retained (`谁`: `shéi / shuí`; `熟`: `shú / shóu`). Pinyin for an alternate written variant or parenthesized example is not mislabeled as the pronunciation of the displayed spelling. Official neutral tones and the source's treatment of tone changes are retained.
- Dictionary matching never lowercases numbered pinyin: surname capitalization can distinguish a name from an ordinary word. It never merges every dictionary pronunciation of a spelling. For example, 长 `zhǎng` does not inherit `cháng` definitions, and 面1 (面, surface/face) remains distinct from 面2 (麵, flour/noodles).
- Bare cross-reference glosses are not presented as definitions. The importer follows the original, pronunciation-qualified CC-CEDICT references or equivalent same-pronunciation traditional variants. The modern dataset sometimes truncates a multi-character target to its last character: 无可厚非 points to 非, 下功夫 to 夫, 得意扬扬 to 洋, and 大腕儿 to 腕. Original references, and an explicitly marked erhua alias's unchanged base pronunciation, avoid those incorrect senses.
- English glosses and classifiers are separated by the upstream dataset. Reference-only annotations, classifier-only strings and non-English-only fragments are not used as stand-alone definitions. Other dictionary senses of the **matched pronunciation** are retained unless an explicit official affix/sense mapping narrows them.
- Productive expressions without dictionary headwords have explicit English renderings grounded in exact component entries, e.g. 车上 = 车 + 上, 见过 = 见 + 过, 飞往 = 飞 + 往. The importer does not mechanically translate arbitrary unmatched compounds.
- Editorial corrections replace known wrong or misleading upstream glosses: 离谱儿 is unreasonable/excessive, not “Scientific”; 贪玩儿 means being too fond of play, not simply “Greedy”; 指着 means pointing at, not “Poke”; 飞往 means flying to, not generic “Go to”; 车上 means in/on a vehicle, not “Car”; 特制 means specially/custom-made. Bound forms are defined as affixes in their listed role rather than indiscriminately including free-word meanings.

### Pronunciation disagreements and remaining sense granularity

These are deliberate, explicit mappings, not silent pronunciation-insensitive joins:

| Official entry | Source discrepancy | Treatment |
| --- | --- | --- |
| 尽可能 (`L5-0406`) | Official transcription `jìn kěnéng`; dictionary `jin3 ke3 neng2` | Keep official `jìn kěnéng`; explicitly use “as far as possible; to do one's utmost”. |
| 两边 (`L4-0479`) | Official `liǎngbiān`; dictionary neutral final `bian5` | Keep official reading; explicit “either/both sides” mapping. |
| 延误 (`L7-4768`) | Official `yánwù`; dictionary `yan2 wu5` | Keep official reading; explicit delay/hold-up gloss. |
| 不予 (`L7-0300`) | Official `bù yǔ`; old snapshot has `bu4 yu2` | Use the evidenced components 不 + 予 `yu3` and keep the official reading. |
| 不一会儿 (`L2-0044`) | Supplementary dictionary has non-erhua 不一会; modern transcription has malformed `r5` | Keep official pinyin; explicit soon/in-a-short-while mapping. |
| Other erhua words | Modern supplementary transcriptions sometimes leave a literal `r5` | Pinyin always comes from the official spine, never these malformed fields. |
| 称1 / 称2 | Official IDs distinguish two `chēng` senses, while CC-CEDICT combines them in one entry | Separate editorial senses: weigh (`L2-0062`); call/name/state/praise (`L5-0101`). Both cite the exact combined dictionary key. |

English dictionaries do not always subdivide a reading exactly as the standard does. Beyond the explicit numbered and affix refinements, these are dictionary glosses for the matched official reading, not a claim that every listed sense is individually examinable. The source transcription's spelling/pronunciation conventions are retained rather than silently rewriting the official identities.

## Data license: CC BY-SA 3.0

The **derived `level-*.json` vocabulary dataset**, including its adapted CC-CEDICT definitions and editorial dictionary adaptations, is distributed under the **Creative Commons Attribution-ShareAlike 3.0 Unported license (CC BY-SA 3.0)**:

- [License deed](https://creativecommons.org/licenses/by-sa/3.0/)
- [Full legal code](https://creativecommons.org/licenses/by-sa/3.0/legalcode)

Attribution: **CC-CEDICT / MDBG and its community contributors; Ivan Krasilnikov and the transcription contributors named below; Yanis Zafirópulos (Dr.Kameleon); HanPit contributors for the adapted per-level dataset.** This file records the sources, immutable versions and changes. CC-CEDICT is based in part on CEDICT, copyright (C) 1997, 1998 Paul Andrew Denisowski. Attribution does not imply endorsement by these authors or by the Ministry of Education.

You may share and adapt the data, including commercially, subject to attribution, a license link, indication of changes, and sharing adaptations under the same or a compatible license as permitted by CC BY-SA 3.0. No additional restrictions are imposed here. The upstream MIT notices below are retained for their respective contributions; they do **not** remove CC-CEDICT's attribution/share-alike requirements. This data licensing statement does not relicense unrelated application source code.

## Grammar inventory and original lessons

The grammar follows **Appendix A of GF0025-2021**, with **572 points**, not a later examination syllabus. `grammar-level-7.json` represents the common advanced 7–9 block, without an invented subdivision.

| Level | Grammar points | Authored examples |
| --- | ---: | ---: |
| 1 | 48 | 134 |
| 2 | 81 | 221 |
| 3 | 81 | 203 |
| 4 | 76 | 181 |
| 5 | 71 | 164 |
| 6 | 67 | 142 |
| 7–9 | 148 | 320 |
| Total | 572 | 1,365 |

Primary source: the Ministry’s [official scanned PDF](https://www.moe.gov.cn/jyb_sjzl/ziliao/A19/202111/W020211118507389477190.pdf), SHA-256 `e451fdf0899d9267bbd122db66e7e75bdd2851ad1e6732e47b6e960290d73a63`. Appendix A occupies PDF pages 176–260, printed pages 170–254.

The inventory uses Ivan Krasilnikov’s [hsk30-grammar.csv at commit 4ff9e3915ce87baaecd7ebe263085573a4ea3192](https://github.com/ivankra/hsk30/blob/4ff9e3915ce87baaecd7ebe263085573a4ea3192/hsk30-grammar.csv), SHA-256 `9a546944af00976a3afb160fe70dd564a035d36eff82eb275b6aed7ed8a9ccf4`, vendored unchanged as `scripts/sources/grammar.csv`. Its MIT notice is retained below. Three source treatments are explicit in `scripts/check-grammar.py`:

- Row `No=123` is an unnumbered `※` cross-reference under official 【二74】, not an extra grammar point. Excluding it gives 81 level-2 points and 572 overall; see PDF page 196, printed page 190.
- Row `No=67`, official 【二19】: restore missing **一定** in `必须、差不多、好像、一定、也许`; PDF page 187, printed page 181.
- Row `No=297`, A.5.1.4.2 **将**: preserve category **介词**, correct its function to **引出施事、受事**, rather than purpose/cause; PDF page 223, printed page 217.

`grammar-index.json` preserves the corrected inventory’s source group, category, details and construction. `sourceNo` is the original CSV number. **`G1-001` … `G7-148` are stable local lesson IDs, not official appendix numbers**; in particular, the advanced transcription’s order differs from the PDF’s order. No point is deduplicated by its spelling.

The seven lesson files contain English titles, patterns and explanations, plus original Chinese examples, explicit citation Pinyin and English translations. The English editorial migration preserves every Chinese/Pinyin value, identity and Chinese-character sequence in teaching prose. These are teaching materials aligned to the inventory, not an official English translation or Ministry endorsement. They do not derive from CC-CEDICT glosses; the vocabulary’s CC BY-SA statement above applies to `level-*.json`, not these independent lesson texts. The upstream MIT notice applies to the source transcription and its adapted inventory.

Validation from the project root:

```sh
npm run grammar:check
python3 scripts/check-grammar.py --write-index
```

The second command rebuilds only the canonical inventory from the pinned CSV; it does not generate or rewrite teaching prose. Validation checks exact point coverage, source identities, per-level order, unique example IDs, required fields, Unicode normalization and at least two examples per rule. Example audio is generated separately under `../audio/grammar/`; its manifest records the source text, Pinyin, surface pronunciation, phonemes and hashes.

The English-only editorial migration did not regenerate audio. All 1,365 planned pronunciation records were compared with the existing manifest, and all clips were decoded and validated unchanged. Only the seven lesson source hashes and their combined fingerprint were refreshed; generator/runtime settings and every clip record remain unchanged. The original generation fingerprint was `996b3add7cd860cab2d97238af71fbd9fcd40a577957c9a970117a3642497649`; the English-source metadata fingerprint is `142e693da8f8da79cc8fae548735af8b4d3c85134b006c8ef89dede9839dfb61`.

## Study sequence and progressive readings

`curriculum-level-1.json` through `curriculum-level-7.json` contain complete permutations of the stable vocabulary and grammar IDs for each block. These are local teaching sequences, not a replacement for the official inventories or a renumbering of persisted cards. Vocabulary source files and their existing audio are unchanged. Only new-card introduction follows this sequence; due reviews retain FSRS precedence.

For a block with N new words and R new rules, rule i may use the first `floor(N*i/R)` current words plus all previous levels. Every Chinese span in lesson titles, patterns, explanations and examples is checked. HSK1 has 48 rules: its initial word limits are 10, 20, 31 and 41.

Some grammatical forms are not independent flashcard entries. `scripts/sources/grammar-forms.json` records narrow exceptions evidenced by the owning official inventory entry, not arbitrary lexical additions. The checker constrains bound suffixes/prefixes and separated compounds, derives AA/AABB/A一A forms from known roots only when their rule is available, and distinguishes contextual interjection tones from the separate 啊 particle ID. Unknown content words and proper names are not given a free-character fallback. Example Pinyin disambiguates polyphonic IDs; unresolved readings fail rather than silently using another pronunciation.

`readings-level-1.json` through `readings-level-7.json` contain **70 original HanPit passages**, ten per block, with English topic titles and 193 paragraphs. Paragraphs have `hanzi`, authored citation-tone `pinyin` and English `translation`; the original Chinese, pinyin, identities and grammar references remain unchanged. These are not official examination texts or copied Ministry examples. Stage j permits the first `floor(N*j/10)` current words and the current rules whose cumulative word limit has been reached, plus all previous knowledge. `grammarIds` identifies targeted constructions and required grammatical-form owners, including neutral verb reduplication; it is not a complete syntactic parse. No reading audio is generated.

The word-prefix validator now aligns the authored Pinyin, retaining distinct official lexical identities. Its dynamic-programming state keeps the preceding lexical context needed for neutral reduplication rather than pruning a valid reading at an ambiguous word boundary. A contextual neutral reading without its own dictionary entry retains all unresolved same-base citation identities; it cannot borrow a future-level reading or collapse an explicit neutral particle into another official entry. Chinese syntax and discourse coherence also receive separate editorial review, not an automated-parser guarantee or a claim of native-speaker review.

Grammar and reading summaries show green only when every previous-level word and the required contiguous current-level prefix has a saved flashcard review (`reps > 0`); missing vocabulary shows red, even if an equal number of unrelated or later cards has been studied. This is guidance, not per-lesson locking. Readiness uses the cached curriculum IDs without loading vocabulary data, and refreshes on revisiting a section or after a pending review commits.

```sh
npm run curriculum:check
npm run curriculum:test
npm run curriculum:build
```

These commands use the Python standard library only and run offline. `curriculum:build` writes only missing, valid plans and never overwrites a frozen sequence. `curriculum:check` checks all saved plans and all seventy readings. After lesson changes, recheck fixed prefixes; changed spoken Chinese/Pinyin requires grammar audio regeneration. Prose-only fingerprint updates require verified pronunciation equivalence, as recorded above. Do not alter official IDs or rewrite existing review progress.

## Test content

Tests reuse the pronunciation-qualified English `meaning` values already provided by all **11,092 official vocabulary IDs**; there is no separate glossary or runtime translation model. The obsolete Italian glossary files and their loader were removed. Original IDs remain distinct, and the vocabulary attribution and CC BY-SA 3.0 license above continue to apply.

`test-pinyin.json` is a derived index of the **138 repeated written forms** and their distinct raw official Pinyin values across all seven blocks. Quiz distractors must exclude every valid reading of the displayed form, including a pronunciation belonging to a later block; loading a lower test does not grant access to that later vocabulary.

Sentence-translation questions use the original grammar examples and their English translations. Every attempt samples 15 distinct word IDs and five distinct grammar rules, balanced across four question types. Conservative gloss/concept/Chinese-content overlap filters reject synonymous and near-duplicate distractors; this is not a complete semantic parser or an official examination bank.

`npm run tests:check` checks vocabulary meaning availability and equality of the Pinyin index with the unchanged source vocabulary. `python3 scripts/check-tests.py --write-pinyin` rebuilds only the index. Content is shipped as local JSON; no translation model, remote service or reading/test audio is part of the client.

## Upstream MIT notices (retained)

### ivankra/hsk30

```text
MIT License

Copyright (c) 2023 Ivan Krasilnikov
Copyright (c) 2021 Shawky
Copyright (c) 2021 Pleco Inc.

Permission is hereby granted, free of charge, to any person obtaining
 a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### complete-hsk-vocabulary / jelleverheyen fork

The pinned `LICENSE` names 2023; the pinned README additionally names 2025. Both notices are retained here.

```text
MIT License

Copyright (c) 2023 Yanis Zafirópulos
Copyright (c) 2025 Yanis Zafirópulos (aka Dr.Kameleon)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
