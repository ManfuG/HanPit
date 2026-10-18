# Third-party notices

## Scope and application licensing

HanPit has no project-wide application license. These third-party terms do not license the application source, original grammar lessons, readings, or every generated audio output. No owner identity or additional permission is asserted here. A rights-holder decision is needed before describing the whole application as open source or granting reuse rights to its original content.

## Vocabulary and grammar sources

The adapted `public/data/level-*.json` vocabulary is distributed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), including attribution, indication of changes and share-alike obligations for adaptations. It derives from CC-CEDICT / MDBG and community contributors (including earlier CEDICT work by Paul Andrew Denisowski), Ivan Krasilnikov's HSK transcription and Yanis Zafirópulos's complete-hsk-vocabulary via the jelleverheyen fork.

[`public/data/README.md`](public/data/README.md) contains complete source revisions, hashes, adaptation details, license links and retained upstream MIT notices. The MIT transcription notices do not remove CC-CEDICT's share-alike requirements. The grammar inventory adapts the separately MIT-licensed transcription in `scripts/sources/grammar.csv`; original lesson and reading prose is not covered by the vocabulary license. Alignment with GF0025-2021 does not imply Ministry endorsement or an official English translation.

## Local audio and offline tools

Vocabulary and grammar MP3s were synthesized offline using [hexgrad/Kokoro-82M-v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh), revision `01e7505bd6a7a2ac4975463114c3a7650a9f7218`, voice `zf_001`. The model's Apache-2.0 text is retained in [`public/audio/LICENSE`](public/audio/LICENSE). Model/training-data attribution, pronunciation policy and the Misaki/PaddleSpeech Apache-2.0 adapter attribution are retained in [`public/audio/NOTICE`](public/audio/NOTICE) and [`public/audio/grammar/NOTICE`](public/audio/grammar/NOTICE). These notices describe the synthesis tooling; they do not by themselves grant a blanket license to the generated recordings or their underlying authored text. Human listening review is not claimed.

The Python generators and importer are offline authoring tools, not client dependencies. The importer fetches commit-pinned, SHA-256-checked sources; model files are revision-pinned and SHA-256 checked before synthesis. `scripts/audio-requirements.txt` pins the CPU Python environment's versions, including a Linux x86-64 Python 3.12 PyTorch wheel, but does not hash-lock package artifacts. The environment, model weights, FFmpeg and Python packages are not vendored or included in the static build. If distributing those tools or binaries, retain their own package and bundled-component notices; the model's Apache license does not replace them. FFmpeg licensing depends on its build configuration, including enabled codecs.

## JavaScript dependencies

Direct dependencies resolved by `package-lock.json`:

| Package | Version | License | Role / upstream |
| --- | --- | --- | --- |
| ts-fsrs | 5.4.2 | MIT | Browser scheduling — https://github.com/open-spaced-repetition/ts-fsrs |
| TypeScript | 5.9.3 | Apache-2.0 | Development type checker — https://github.com/microsoft/TypeScript |
| Vite | 8.3.4 | MIT | Development server and static build — https://github.com/vitejs/vite |

The full ts-fsrs MIT copyright and permission text is retained in [`public/THIRD_PARTY_LICENSES.txt`](public/THIRD_PARTY_LICENSES.txt), which Vite copies into `dist/` with the runtime bundle. Audio and data notices are also copied from `public/`; do not strip them from a distribution.

The lockfile records transitive build dependencies and their upstream licenses. Non-MIT entries include `detect-libc@2.1.2` (Apache-2.0), `lightningcss@1.33.0` and its platform bindings (MPL-2.0), `picocolors@1.1.1` (ISC), and `source-map-js@1.2.2` (BSD-3-Clause). These tools are not reclassified as MIT or relicensed by HanPit. Dependency source and `node_modules/` are not vendored in the repository; retain upstream notices if redistributing development dependencies.
