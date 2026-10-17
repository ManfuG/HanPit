# HanPit — memoria agentica

## Intento e perimetro

App per imparare il cinese, destinazione futura Android. Questa implementazione è una web app: solo flashcard stile Anki; Grammatica e Test devono restare vuoti. UI italiana minimale, niente testo decorativo o funzionalità aggiuntive. Preferire poco codice, dipendenze ridotte e costo computazionale basso.

Requisito futuro, non implementato: grammatica per livello con esempi/pinyin/TTS; test di 30 domande casuali di tipi diversi sul corso corrente; 10 punteggi perfetti consecutivi per sbloccare il livello successivo. Lo sblocco deve aggiungere vocabolario senza perdere lo storico. Attualmente il livello è selezionabile manualmente per rendere accessibili tutte le flashcard senza implementare i test.

## Decisioni e invarianti

- Fonte di riferimento: GF0025-2021, 11.092 voci, livelli 1–6 e blocco avanzato comune 7–9. Non inventare una suddivisione di 7/8/9; non sostituire tacitamente i dati con programmi d’esame successivi.
- Nuove voci per blocco: 500, 772, 973, 1000, 1071, 1140, 5636. ID ufficiali `L1-0001` ecc. Identità distinta anche quando hanzi/pinyin coincidono; mai deduplicare per grafia.
- Significati inglesi, chiaramente etichettati EN: nessuna traduzione italiana completa disponibile nel dataset adottato. Provenienza, 65 adattamenti editoriali e licenze CC-CEDICT/MIT in `public/data/README.md`.
- `src/study.ts`: FSRS-6 con `ts-fsrs` 5.4.2, ritenzione .9, passi 1m/10m e riapprendimento 10m, fuzz disabilitato. Ordine: apprendimento scaduto, ripasso scaduto, nuove; scansione O(n), senza sort/copie del mazzo per risposta. Nessun ripasso futuro anticipato.
- `src/storage.ts`: IndexedDB `hanpit` v1, store `cards`, `reviews`, `settings`. Date conservate dal structured clone. Carta e review salvate nella stessa transazione prima di aggiornare memoria/UI. Non cambiare schema o ID senza migrazione.
- `src/main.ts`: UI DOM nativa, cache dei JSON per livello, mazzo cumulativo, timer solo per l’attesa senza carte disponibili, scorciatoie Spazio/1–4. Nessun framework/backend/service worker.
- Audio: Web Speech API con voce mandarino, preferenza zh-CN; mai fallback a una lingua diversa. Mancanza voce ed errori espliciti. Polifonia dipendente dal sintetizzatore: non dichiarare che la correttezza audio è stata validata per ogni voce.
- Contratti TypeScript nominati al modulo proprietario; preferire Promise.withResolvers; Map per progressi dinamici, Record per lookup statici.

## Comandi e verifica svolta

Node >=24. `npm ci`, `npm run dev`, `npm run build`, `npm run preview`, `npm test`, `npm run data:import`.

Verificati: importatore da commit fissati con SHA-256 e tutte le 11.092 voci; 7 test dello scheduler passati; build TypeScript/Vite riuscita (JS ~9,4 kB gzip, dati esclusi). Smoke Chromium reale a 1280×900 e 390×844: fronte/retro, quattro giudizi e intervalli, carte/Date/storico/livello persistiti dopo reload, tutti i conteggi cumulativi, carta avanzata 阿拉伯语, precedenza delle scadute, attesa e ricomparsa automatica, scorciatoie e sezioni vuote. Nessun errore runtime osservato. Il browser headless non ha voci: verificato il ramo audio indisponibile, non ascolto reale. Le modifiche al database per simulare scadenze erano dati di smoke, non codice applicativo.

Smoke aggiuntivo sull’artefatto di produzione tramite `npm run preview`: rivelazione, valutazione, persistenza dopo reload e assenza di overflow su viewport mobile. Dati sintetici dello smoke rimossi dall’origine dev a fine verifica.

Non aggiungere test di cablaggio, testi UI o default incidentali della libreria. Test permanenti per comportamento/invarianti; smoke browser per superfici UI. Non generare documentazione aggiuntiva non richiesta. Prima della consegna aggiornare questa memoria e git, senza push non richiesto.

Git inizializzato su `main`. Nessuna identità Git utente configurata: primo commit attribuito all’identità tecnica `HanPit Agent <hanpit-agent@localhost>` tramite opzioni `git -c`, senza modificare configurazione globale o inventare un’identità personale. Nessun remote/push.
