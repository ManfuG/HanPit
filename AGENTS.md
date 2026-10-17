# HanPit — memoria agentica

## Intento e perimetro

App per imparare il cinese, destinazione futura Android. Questa implementazione è una web app: solo flashcard stile Anki; Grammatica e Test devono restare vuoti. UI italiana minimale, niente testo decorativo o funzionalità aggiuntive. Preferire poco codice, dipendenze ridotte e costo computazionale basso.

Requisito futuro, non implementato: grammatica per livello con esempi/pinyin/TTS; test di 30 domande casuali di tipi diversi sul corso corrente; 10 punteggi perfetti consecutivi per sbloccare il livello successivo. Lo sblocco deve aggiungere vocabolario senza perdere lo storico. Attualmente il livello è selezionabile manualmente per rendere accessibili tutte le flashcard senza implementare i test.

## Decisioni e invarianti

- Fonte di riferimento: GF0025-2021, 11.092 voci, livelli 1–6 e blocco avanzato comune 7–9. Non inventare una suddivisione di 7/8/9; non sostituire tacitamente i dati con programmi d’esame successivi.
- Nuove voci per blocco: 500, 772, 973, 1000, 1071, 1140, 5636. ID ufficiali `L1-0001` ecc. Identità distinta anche quando hanzi/pinyin coincidono; mai deduplicare per grafia.
- Significati inglesi, chiaramente etichettati EN: nessuna traduzione italiana completa disponibile nel dataset adottato. Provenienza, 65 adattamenti editoriali e licenze CC-CEDICT/MIT in `public/data/README.md`.
- `src/study.ts`: FSRS-6 con `ts-fsrs` 5.4.2, ritenzione .9, passi 1m/10m e riapprendimento 10m, fuzz disabilitato. Primo Facile su una carta nuova: 5 giorni, tramite peso `w[3] = 5` (stabilità iniziale), non sovrascrivendo solo `due`. Nessuna riscrittura delle carte/scadenze già persistite. Ordine: apprendimento scaduto, ripasso scaduto, nuove; scansione O(n), senza sort/copie del mazzo per risposta. Nessun ripasso futuro anticipato.
- `src/storage.ts`: IndexedDB `hanpit` v1, store `cards`, `reviews`, `settings`. Date conservate dal structured clone. Carta e review salvate nella stessa transazione prima di aggiornare memoria/UI. Non cambiare schema o ID senza migrazione.
- `src/main.ts`: UI DOM nativa, cache dei JSON per livello, mazzo cumulativo, timer solo per l’attesa senza carte disponibili, scorciatoie Spazio/1–4. Nessun framework/backend/service worker.
- Audio: eliminata Web Speech API. `src/audio.ts` riproduce MP3 neurali locali `public/audio/{ID}.mp3`, generati da Kokoro-82M-v1.1-zh, voce mandarino zf_001 (Apache 2.0). Precaricare solo la carta corrente, mai parlare sul fronte; rivelazione e Ascolta avviano/ripetono. Stop su carta/livello/sezione/pagina nascosta; errori visibili, niente fallback robotico o API esterne. Unico elemento audio riusato, protezione dalle risposte asincrone obsolete.
- `scripts/generate-audio.py`: generazione offline CPU con modello/revisione/SHA-256 e dipendenze fissati; pinyin ufficiale prima dei fonemi, non lettura automatica dei polifonici dagli hanzi. Prima lettura per varianti con `/`, ü/toni neutri/erhua/sandhi contestuale espliciti. Manifest con letture, fonemi, hash, durata e RMS per ID; non dichiarare revisione umana o naturalezza universale di tutte le voci.
- Il generatore richiede Python 3.12, uv e FFmpeg/libmp3lame; `.venv-audio/` e pesi esclusi da git/build. Nessuna dipendenza TTS sul client: solo MP3. `Word` non contiene più il duplicato legacy `speech`; gli ID e IndexedDB restano invariati.
- Contratti TypeScript nominati al modulo proprietario; preferire Promise.withResolvers; Map per progressi dinamici, Record per lookup statici.

## Comandi e verifica svolta

Node >=24. `npm ci`, `npm run dev`, `npm run build`, `npm run preview`, `npm test`, `npm run data:import`. Solo per sviluppo audio, dopo setup documentato nel README: `npm run audio:generate`, `npm run audio:check`, `npm run audio:test`.

Verifica iniziale: importatore da commit fissati con SHA-256 e tutte le 11.092 voci; build TypeScript/Vite riuscita. Smoke Chromium a 1280×900 e 390×844: fronte/retro, quattro giudizi, carte/Date/storico/livello persistiti dopo reload, conteggi cumulativi, carta avanzata 阿拉伯语, precedenza scadute, attesa/ricomparsa automatica, scorciatoie e sezioni vuote. Le simulazioni di scadenza erano dati di smoke, non codice applicativo.

Smoke aggiuntivo sull’artefatto di produzione tramite `npm run preview`: rivelazione, valutazione, persistenza dopo reload e assenza di overflow su viewport mobile. Dati sintetici dello smoke rimossi dall’origine dev a fine verifica.

Modifica corrente: 7 test FSRS e 7 test fonetici passati. Smoke sullo scheduler reale conferma primo Facile/stabilità 5 giorni, nessuna disponibilità anticipata e compatibilità delle carte precedenti; dopo 5 giorni la sequenza simulata produce Di nuovo 10m, Difficile 17g, Bene 26g, Facile 44g (esempio, non tabella fissa). Browser Chromium senza voci di sistema riproduce realmente MP3 fino a `ended`; verificati precaricamento silenzioso, ripetizione, arresto su sezione/livello/valutazione, errore di file corrotto e recupero esplicito. Due carte 长 con pinyin cháng e zhǎng caricano e riproducono file diversi. Confermata persistenza effettiva di `stability=5`, `scheduled_days=5` e Date. Verifica strumentale, non ascolto umano.

Corpus audio completato: 11.092 MP3 per 10.207 pronunce distinte, 95.647.088 byte (~91,216 MiB), 24 kHz mono/64 kbps, durata 0,475–2,05s. Ogni file è stato interamente decodificato e verificato per RMS, formato, SHA-256 e copertura esatta ID/manifest; verificati hash del generatore e dei sette JSON. Revisione Kokoro `01e7505bd6a7a2ac4975463114c3a7650a9f7218`, fonti/licenza in `public/audio/NOTICE` e `LICENSE`, report in `generation.json`. Build finale riuscita (JS 9,5 kB gzip); tutti gli 11.092 hash MP3 e i sette hash JSON della distribuzione corrispondono al manifest, nessun peso del modello incluso. Smoke sulla nuova produzione mobile: audio reale fino a fine, primo Facile a 5 giorni, valutazione/persistenza dopo reload, nessun errore runtime o overflow osservato. Dati sintetici rimossi dalle origini di verifica; mantenere l’origine originale dell’app per non far apparire persi i progressi IndexedDB.

Non aggiungere test di cablaggio, testi UI o default incidentali della libreria. Test permanenti per comportamento/invarianti; smoke browser per superfici UI. Non generare documentazione aggiuntiva non richiesta. Prima della consegna aggiornare questa memoria e git, senza push non richiesto.

Git inizializzato su `main`. Nessuna identità Git utente configurata: primo commit attribuito all’identità tecnica `HanPit Agent <hanpit-agent@localhost>` tramite opzioni `git -c`, senza modificare configurazione globale o inventare un’identità personale. Nessun remote/push.
