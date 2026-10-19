# Third-party notices

## Scope and application licensing

Original HanPit application code, design, documentation, curriculum sequencing, grammar lessons and readings are licensed under [MIT](LICENSE), copyright (c) 2026 Giacomo Manfucci (ManfuG). The grant covers only rights he holds, not third-party material. The package's `MIT` metadata describes this original work, not every bundled asset. Existing third-party copyright and permission notices remain in force.

Exceptions: adapted CC-CEDICT vocabulary is distributed under **CC BY-SA 4.0**, with original source notices preserved; source transcriptions and the grammar inventory retain their upstream MIT notices; `scripts/generate-audio.py` and `scripts/generate-grammar-audio.py` retain their existing **Apache-2.0** terms and Misaki/PaddleSpeech attribution. Generated audio has the limited grant and uncertainty described below. No blanket relicensing of the repository or third-party rights is intended.

## Vocabulary and grammar sources

The adapted `public/data/level-*.json` vocabulary is distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), including attribution, indication of changes and share-alike obligations for adaptations. It derives from CC-CEDICT / MDBG and community contributors (including earlier CEDICT work by Paul Andrew Denisowski), Ivan Krasilnikov's HSK transcription and Yanis Zafirópulos's complete-hsk-vocabulary via the jelleverheyen fork.

[`public/data/README.md`](public/data/README.md) contains complete source revisions, hashes, adaptation details, license links and retained upstream MIT notices. The MIT transcription notices do not remove CC-CEDICT's share-alike requirements. The grammar inventory adapts the separately MIT-licensed transcription in `scripts/sources/grammar.csv`; original lesson and reading prose is not covered by the vocabulary license. Alignment with GF0025-2021 does not imply Ministry endorsement or an official English translation.

The [pinned CC-CEDICT snapshot header](https://github.com/regisb/CC-CEDICT/blob/a8e7ebcc6b7d19f6a615f9f1e8b1e3df6fad1e38/cedict_ts.u8#L1-L29) identifies CC BY-SA 3.0; the [current MDBG publisher terms](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) identify CC BY-SA 4.0. The modern [vocabulary fork's README](https://github.com/jelleverheyen/hsk-vocabulary/blob/a66fd30b9580da2c2af7eb19e4b9d8099a29c061/README.md) credits CC-CEDICT but does not pin its dictionary snapshot or license version. HanPit therefore distributes its combined adaptation under 4.0 rather than assuming every modern definition has the old snapshot's 3.0 terms. [CC BY-SA 3.0 section 4(b)](https://creativecommons.org/licenses/by-sa/3.0/legalcode) permits later-version adaptations with the same license elements; original source notices remain intact. The pinned [hsk30](https://github.com/ivankra/hsk30/blob/4ff9e3915ce87baaecd7ebe263085573a4ea3192/LICENSE) and [vocabulary-fork](https://github.com/jelleverheyen/hsk-vocabulary/blob/a66fd30b9580da2c2af7eb19e4b9d8099a29c061/LICENSE) MIT grants cover their licensors' contributions, not a waiver of CC-CEDICT rights.

## Local audio and offline tools

Vocabulary and grammar MP3s were synthesized offline using [hexgrad/Kokoro-82M-v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh), revision `01e7505bd6a7a2ac4975463114c3a7650a9f7218`, voice `zf_001`. The [pinned model card](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh/blob/01e7505bd6a7a2ac4975463114c3a7650a9f7218/README.md) declares Apache-2.0 and credits LongMaoData and the synthetic English data contributors; its license text is retained in [`public/audio/LICENSE`](public/audio/LICENSE). The installed Misaki 0.9.4 package is Apache-2.0, and its [tone-sandhi adapter](https://github.com/hexgrad/misaki/blob/main/misaki/tone_sandhi.py) retains the [PaddleSpeech copyright and Apache notice](https://github.com/PaddlePaddle/PaddleSpeech/blob/develop/paddlespeech/t2s/frontend/tone_sandhi.py). Model/training-data attribution, pronunciation policy and the adapter attribution are retained in [`public/audio/NOTICE`](public/audio/NOTICE) and [`public/audio/grammar/NOTICE`](public/audio/grammar/NOTICE). Human listening review is not claimed.

**Output rights are separate from tool/model licenses.** Giacomo Manfucci licenses only his own copyright or related rights, if any, in HanPit's audio contributions under MIT. This includes his original grammar-example text, but does not assert ownership of every synthesized sound or license third-party voices, training data or other rights. Vocabulary audio pronounces entries from the CC BY-SA dataset; retain that dataset's attribution and apply its share-alike terms to any protected adaptation rather than treating the MP3s as unconditionally MIT. Original grammar examples retain MIT and their source-inventory notices; they are not CC-CEDICT-derived definitions.

Copyrightability of generated outputs and any producer/related rights depend on jurisdiction and human contribution. The [U.S. Copyright Office's January 2025 guidance](https://www.copyright.gov/newsnet/2025/1060.html), for example, requires sufficient human-determined expressive elements; it is not a worldwide clearance of these files. Neither Apache-2.0 nor this notice guarantees that all outputs are copyrightable, infringement-free, public domain or cleared of personality/voice rights. No additional upstream output restriction or blanket output permission is inferred from the model card.

The Python generators and importer are offline authoring tools, not client dependencies. The importer fetches commit-pinned, SHA-256-checked sources; model files are revision-pinned and SHA-256 checked before synthesis. `scripts/audio-requirements.txt` pins the CPU Python environment's versions, including a Linux x86-64 Python 3.12 PyTorch wheel, but does not hash-lock package artifacts. The environment, model weights, FFmpeg and Python packages are not vendored or included in the static build. If distributing those tools or binaries, retain their own package and bundled-component notices; the model's Apache license does not replace them. FFmpeg licensing depends on its build configuration, including enabled codecs.

## JavaScript dependencies

Direct dependencies resolved by `package-lock.json`:

| Package | Version | License | Role / upstream |
| --- | --- | --- | --- |
| ts-fsrs | 5.4.2 | MIT | Browser scheduling — https://github.com/open-spaced-repetition/ts-fsrs |
| TypeScript | 5.9.3 | Apache-2.0 | Development type checker — https://github.com/microsoft/TypeScript |
| Vite | 8.3.4 | MIT | Development server and static build — https://github.com/vitejs/vite |

The full [ts-fsrs v5.4.2 MIT notice](https://github.com/open-spaced-repetition/ts-fsrs/blob/v5.4.2/LICENSE), matching the installed package, and HanPit's scoped MIT grant are retained in [`public/THIRD_PARTY_LICENSES.txt`](public/THIRD_PARTY_LICENSES.txt), which Vite copies into `dist/`. Full [CC BY-SA 4.0](public/data/CC-BY-SA-4.0.txt) and [original 3.0](public/data/CC-BY-SA-3.0.txt) legal texts are bundled for offline use. Keep them together with `public/data/README.md` (attribution, source revisions, changes and transcription MIT notices), `public/audio/LICENSE`, both audio `NOTICE` files and the runtime notice. The app links to its central licenses/credits notice; all records must survive static publication.

The lockfile records transitive build dependencies and their upstream licenses. Non-MIT entries include `detect-libc@2.1.2` (Apache-2.0), `lightningcss@1.33.0` and its platform bindings (MPL-2.0), `picocolors@1.1.1` (ISC), and `source-map-js@1.2.2` (BSD-3-Clause). These tools are not reclassified as MIT or relicensed by HanPit. Dependency source and `node_modules/` are not vendored in the repository; retain upstream notices if redistributing development dependencies.

## Heading font

English headings use the unmodified, locally served Syne variable font copied from the sibling applications. Copyright 2017 The Syne Project Authors ([upstream](https://gitlab.com/bonjour-monde/fonderie/syne-typeface)); SIL Open Font License 1.1, retained in [`public/fonts/Syne-OFL.txt`](public/fonts/Syne-OFL.txt). Body text uses the system sans-serif stack, with no downloaded body font. The font's OFL terms are separate from HanPit's MIT license.
