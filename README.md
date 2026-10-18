# HanPit

Web app essenziale per flashcard, grammatica e letture di cinese HSK 3.0. TypeScript, Vite e FSRS-6; nessun backend.

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
- Grammatica e Letture mostrano il livello selezionato. Test resta vuoto; il blocco dei livelli tramite test non è implementato e il livello si seleziona manualmente.

## Vocabolario

**11.092 voci**, secondo lo standard ufficiale [GF0025-2021 del Ministero dell’Istruzione cinese](https://www.moe.gov.cn/jyb_sjzl/ziliao/A19/202111/t20211118_580755.html). Livelli 1–6 e blocco comune **7–9**: lo standard non suddivide il vocabolario avanzato in tre liste. Non va confuso con successivi programmi d’esame.

I JSON sono inclusi: nessun download esterno durante lo studio. Caricamento per livello, cache in memoria e selezione della carta in un solo passaggio O(n), senza ordinamento del mazzo. Stato FSRS indicizzato per ID ufficiale stabile; ogni valutazione scrive solo una carta e una voce di storico.

Per rigenerare i dati dalle revisioni fissate delle fonti:

```sh
npm run data:import
```

L’importazione verifica SHA-256, conteggi ufficiali, ID e copertura delle definizioni prima di pubblicare i file. Fonti, correzioni editoriali e licenze in [`public/data/README.md`](public/data/README.md). Il dataset derivato da CC-CEDICT è CC BY-SA 3.0; i significati non sono traduzioni italiane.

## Grammatica

**572 punti grammaticali dell’Appendice A di GF0025-2021**, nei livelli 1–6 e nel blocco comune 7–9. Ogni regola ha schema, spiegazione italiana ed esempi con caratteri, pinyin, traduzione italiana e Ascolta: **1.365 frasi** complessive. Spiegazioni ed esempi sono contenuti didattici originali, non una traduzione ufficiale dello standard.

Si scarica soltanto il JSON del livello corrente, con cache delle richieste. Gli esempi vengono inseriti nel DOM alla prima apertura della regola; aprirla non avvia né precarica audio. Ascolta carica e riproduce soltanto la frase scelta. Il vocabolario delle flashcard resta cumulativo e i progressi non vengono modificati studiando grammatica.

Inventario, correzioni della trascrizione, conteggi e provenienza in [`public/data/README.md`](public/data/README.md). `npm run grammar:check` verifica tutti i livelli senza caricare il modello vocale.

## Progressione e letture

`curriculum-level-{1..7}.json` definisce l’ordine di introduzione delle parole e delle regole, senza cambiare ID o livelli ufficiali. Si riordinano solo le carte nuove: i ripassi scaduti mantengono la precedenza FSRS e le scadenze persistite non vengono riscritte.

Con `N` parole e `R` regole nuove nel livello, la regola in posizione `i` usa al massimo le prime `floor(N × i / R)` parole, oltre a tutti i livelli precedenti. HSK 1 ha **500 parole e 48 regole**: i primi limiti sono 10, 20, 31 e 41, fino a 500. Gli esempi sono stati adattati al lessico disponibile. Le forme grammaticali introdotte dalla regola stessa, come il suffisso 儿 o la particella 矣, appartengono alla conoscenza grammaticale e non richiedono una flashcard inesistente.

**Letture** contiene dieci testi originali per ciascuno dei sette blocchi: **70 testi**, con temi diversi. La lettura `j` usa le prime `floor(N × j / 10)` parole e le regole già comprese entro quel limite, più le conoscenze dei livelli precedenti. Per HSK 1: 50, 100, …, 500 parole. I testi sono in cinese, con titolo italiano e indicazione del limite; nessun audio o traduzione aggiuntivi.

Si caricano soltanto percorso e letture del livello scelto, con cache delle richieste; i paragrafi vengono inseriti alla prima apertura. I limiti indicano la sequenza didattica, non nuovi blocchi automatici legati alle valutazioni.

Verifiche offline, con la sola libreria standard Python:

```sh
npm run curriculum:check
npm run curriculum:test
```

Il controllo verifica permutazioni complete degli ID, dipendenze lessicali dei testi cinesi, letture polifoniche negli esempi e disponibilità delle regole dichiarate. La coerenza sintattica delle letture è sottoposta anche a revisione editoriale; il controllo lessicale non è un parser grammaticale completo. `npm run curriculum:build` crea soltanto percorsi mancanti validi e non sovrascrive quelli già fissati.

## Pronuncia e compatibilità

Browser moderno con IndexedDB, `Promise.withResolvers` e riproduzione MP3. La voce è **Kokoro-82M-v1.1-zh, zf_001**, modello neurale dedicato al cinese con [licenza Apache 2.0](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh). Le **11.092 pronunce del vocabolario** sono generate in anticipo e incluse in `public/audio/` (circa **91,2 MiB** per il vocabolario): nessun servizio a pagamento, chiave API, voce del sistema o modello da eseguire sul dispositivo. Durante lo studio si scarica/precarica solo il piccolo file della carta corrente, non l’intero corpus.

Per il vocabolario, il generatore usa il **pinyin della carta** per distinguere i caratteri polifonici, comprese ü, sillabe neutre ed erhua, e applica il sandhi tonale contestuale. Per le voci con più letture ufficiali viene pronunciata la prima. Il manifest registra pinyin di citazione, lettura di superficie e fonemi per ogni ID. Questa prosodia riguarda parole isolate.

Alla rivelazione parte l’audio; Ascolta lo ripete. Cambiare carta, livello, sezione o nascondere la pagina interrompe la riproduzione. Se il browser blocca l’avvio automatico o il file non è disponibile, il motivo è visibile e Ascolta permette di riprovare. Nessun fallback alla vecchia voce robotica.

Le frasi grammaticali usano lo stesso modello, con MP3 separati in `public/audio/grammar/`. Il pinyin esplicito degli esempi guida i polifonici; la punteggiatura conserva pause e confini del sandhi. Il generatore distingue 一 nei numerali e nelle parole composte da 一 davanti ai classificatori, senza cambiare i toni neutri scritti. Frasi troppo lunghe o non allineate vengono rifiutate, mai troncate. Chiudere la regola interrompe la sua pronuncia. Nessuna revisione d’ascolto umana dell’intero corpus è dichiarata.

### Rigenerazione audio, solo sviluppo

I file sono inclusi: per usare o compilare la web app non serve Python. Per rigenerarli servono Python 3.12, `uv`, FFmpeg con `libmp3lame` e rete per il primo download del modello:

```sh
uv venv --python 3.12 .venv-audio
uv pip install --python .venv-audio/bin/python -r scripts/audio-requirements.txt
npm run audio:generate
npm run audio:check
npm run audio:test
npm run grammar:check
npm run grammar:audio
npm run grammar:audio:check
npm run grammar:audio:test
```

Il modello e le dipendenze CPU restano nella directory ignorata `.venv-audio/`; non entrano nella build né in git. Revisione del modello, SHA-256, dipendenze, voce e regole fonetiche sono fissati e registrati nei manifest. `audio:check` e `grammar:audio:check` decodificano i rispettivi corpus e verificano copertura, hash, durata e segnale non silenzioso. Dopo una modifica ai dati, rigenerare e verificare il relativo audio. Il generatore delle frasi riusa quello del vocabolario senza modificarlo né riscrivere i suoi MP3.

## Verifiche

```sh
npm test
npm run grammar:check
npm run curriculum:check
npm run curriculum:test
npm run build
```

**38 test passati**: 7 FSRS, 11 sulla progressione lessicale, 7 fonetici del vocabolario e 13 delle frasi. Verificati tutti i percorsi, **572 regole**, **1.365 esempi** e **70 letture**, senza errori nei vincoli didattici.

Smoke Chromium su sviluppo e produzione, desktop 1280×900 e mobile 390×844; sviluppo anche a 320×740. Verificati ordine delle nuove e delle regole, limiti progressivi, apertura lazy e da tastiera, tutte le settanta letture, assenza di audio nelle letture e di richieste del vocabolario cambiandone il livello. Recupero dopo HTTP 503 e vecchie risposte ignorate verificati sullo sviluppo. Nessun overflow osservato.

Confermati primo Facile a **5 giorni**, precedenza delle vecchie carte scadute e progressi invariati dopo letture/cambio livello/reload. In produzione il livello avanzato conserva tutte le **11.092 carte cumulative**, il player nativo resta unico, gli MP3 raggiungono `ended` e si arrestano entrando in Letture. Test resta vuoto. Nessun errore runtime/media o richiesta esterna osservati nei percorsi verificati.

Audio grammaticale rigenerato sugli esempi adattati: **1.365 MP3**, circa **34,7 MiB**, 24 kHz mono, durate **1,1–6,225 secondi**; tutti interamente decodificati e verificati per hash e segnale. Gli **11.092 MP3** del vocabolario e il suo generatore sono invariati. La verifica strumentale non equivale a un ascolto umano o a una garanzia universale di naturalezza.

Build TypeScript/Vite riuscita: JavaScript **11,21 kB gzip**, esclusi dati/audio. Verificati tutti gli hash di **12.457 MP3**, **29 JSON** e **due manifest** nella distribuzione; nessun peso del modello o audio di lettura incluso. Dati sintetici rimossi soltanto da localhost:5177 e :5178; mantenuta l’origine utente localhost:5173 senza modificarne i progressi.
