# HanPit

Web app essenziale per flashcard di cinese HSK 3.0. TypeScript, Vite e FSRS-6; nessun backend.

## Avvio

Node.js 24 o superiore.

```sh
npm ci
npm run dev
```

Aprire l’indirizzo mostrato da Vite. Build statica: `npm run build`; anteprima: `npm run preview`.

## Comportamento

- Fronte: carattere/parola. Retro: pinyin, significato **in inglese**, pronuncia neurale mandarino.
- Valutazioni Di nuovo / Difficile / Bene / Facile, con anteprima dell’intervallo. Spazio mostra la risposta; 1–4 valutano.
- FSRS-6 tramite `ts-fsrs`: ritenzione 90%, apprendimento 1/10 minuti, riapprendimento 10 minuti. **Il primo Facile su una carta nuova vale 5 giorni**, con stabilità iniziale FSRS di 5 giorni, non una scadenza sovrascritta dopo il calcolo. Gli altri parametri restano quelli di FSRS-6. Le scadenze già salvate non vengono riscritte. Prima le carte in apprendimento scadute, poi i ripassi scaduti, poi le nuove; nessun limite giornaliero. Le carte future non vengono anticipate.
- Carte, storico delle valutazioni e livello conservati in IndexedDB. Il salvataggio di carta e storico è atomico; si passa alla carta successiva solo dopo il salvataggio. Dati locali al browser e all’origine, senza account o sincronizzazione; cancellare i dati del sito elimina i progressi.
- Si parte da HSK 1. Il selettore include cumulativamente il vocabolario dei livelli precedenti senza azzerarne i progressi. Tornare a un livello inferiore nasconde, ma non elimina, le carte superiori.
- Grammatica e Test sono intenzionalmente vuoti. Il blocco dei livelli tramite test non è implementato: per ora il livello si seleziona manualmente.

## Vocabolario

**11.092 voci**, secondo lo standard ufficiale [GF0025-2021 del Ministero dell’Istruzione cinese](https://www.moe.gov.cn/jyb_sjzl/ziliao/A19/202111/t20211118_580755.html). Livelli 1–6 e blocco comune **7–9**: lo standard non suddivide il vocabolario avanzato in tre liste. Non va confuso con successivi programmi d’esame.

I JSON sono inclusi: nessun download esterno durante lo studio. Caricamento per livello, cache in memoria e selezione della carta in un solo passaggio O(n), senza ordinamento del mazzo. Stato FSRS indicizzato per ID ufficiale stabile; ogni valutazione scrive solo una carta e una voce di storico.

Per rigenerare i dati dalle revisioni fissate delle fonti:

```sh
npm run data:import
```

L’importazione verifica SHA-256, conteggi ufficiali, ID e copertura delle definizioni prima di pubblicare i file. Fonti, correzioni editoriali e licenze in [`public/data/README.md`](public/data/README.md). Il dataset derivato da CC-CEDICT è CC BY-SA 3.0; i significati non sono traduzioni italiane.

## Pronuncia e compatibilità

Browser moderno con IndexedDB, `Promise.withResolvers` e riproduzione MP3. La voce è **Kokoro-82M-v1.1-zh, zf_001**, modello neurale dedicato al cinese con [licenza Apache 2.0](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh). Le **11.092 pronunce** sono generate in anticipo e incluse in `public/audio/` (circa **91,2 MiB** complessivi): nessun servizio a pagamento, chiave API, voce del sistema o modello da eseguire sul dispositivo. Durante lo studio si scarica/precarica solo il piccolo file della carta corrente, non l’intero corpus.

Il generatore usa il **pinyin della carta** per distinguere i caratteri polifonici, comprese ü, sillabe neutre ed erhua, e applica il sandhi tonale contestuale. Per le voci con più letture ufficiali viene pronunciata la prima. Il manifest registra pinyin di citazione, lettura di superficie e fonemi per ogni ID. La prosodia riguarda parole isolate, non frasi: il pinyin resta il riferimento e non si dichiara una revisione d’ascolto umana di ogni voce.

Alla rivelazione parte l’audio; Ascolta lo ripete. Cambiare carta, livello, sezione o nascondere la pagina interrompe la riproduzione. Se il browser blocca l’avvio automatico o il file non è disponibile, il motivo è visibile e Ascolta permette di riprovare. Nessun fallback alla vecchia voce robotica.

### Rigenerazione audio, solo sviluppo

I file sono inclusi: per usare o compilare la web app non serve Python. Per rigenerarli servono Python 3.12, `uv`, FFmpeg con `libmp3lame` e rete per il primo download del modello:

```sh
uv venv --python 3.12 .venv-audio
uv pip install --python .venv-audio/bin/python -r scripts/audio-requirements.txt
npm run audio:generate
npm run audio:check
npm run audio:test
```

Il modello e le dipendenze CPU restano nella directory ignorata `.venv-audio/`; non entrano nella build né in git. Revisione del modello, SHA-256, dipendenze, voce e regole fonetiche sono fissati e registrati nel manifest. `audio:check` decodifica i file e verifica copertura, hash, durata e segnale non silenzioso. Dopo una modifica al vocabolario, rigenerare e verificare anche l’audio.

## Verifiche

```sh
npm test
npm run build
```

Test dello scheduler su precedenze, scadenze, espansione cumulativa, transizioni FSRS, primo Facile a 5 giorni e conservazione dello stato. Test fonetici su polifonia, segmentazione, ü, erhua, toni neutri, sandhi e pinyin non allineato. Smoke browser su desktop/mobile: rivelazione, valutazioni, persistenza, livelli cumulativi, attesa e scorciatoie. La nuova riproduzione MP3 è stata esercitata anche in Chromium senza voci di sistema: precaricamento silenzioso, avvio, fine, ripetizione, arresto al cambio sezione/livello e recupero dopo un file corrotto simulato. La verifica strumentale non equivale a una valutazione umana della naturalezza o di tutte le pronunce.

Verificata anche la nuova build servita da `npm run preview`: MP3 riprodotti fino a fine, rivelazione, primo Facile a 5 giorni, persistenza dopo reload e assenza di overflow mobile. Il corpus completo è stato decodificato: 11.092 file, 24 kHz mono, durate 0,475–2,05 secondi, nessun segnale silenzioso. Verificati anche tutti gli SHA-256 degli MP3 e dei JSON copiati nella distribuzione; nessun peso del modello incluso. Build TypeScript/Vite riuscita, JavaScript circa 9,5 kB gzip esclusi dati/audio.
