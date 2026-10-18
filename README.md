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
- Si parte da HSK 1; il selettore mostra soltanto come disponibili i livelli già sbloccati. Il mazzo include cumulativamente il vocabolario precedente. Tornare a un livello inferiore nasconde, ma non elimina, le carte superiori.
- Grammatica e Letture mostrano il livello selezionato. Test permette di sbloccare il livello successivo con 20 risultati perfetti consecutivi.

## Vocabolario

**11.092 voci**, secondo lo standard ufficiale [GF0025-2021 del Ministero dell’Istruzione cinese](https://www.moe.gov.cn/jyb_sjzl/ziliao/A19/202111/t20211118_580755.html). Livelli 1–6 e blocco comune **7–9**: lo standard non suddivide il vocabolario avanzato in tre liste. Non va confuso con successivi programmi d’esame.

I JSON sono inclusi: nessun download esterno durante lo studio. Caricamento per livello, cache in memoria e selezione della carta in un solo passaggio O(n), senza ordinamento del mazzo. Stato FSRS indicizzato per ID ufficiale stabile; ogni valutazione scrive solo una carta e una voce di storico.

Per rigenerare i dati dalle revisioni fissate delle fonti:

```sh
npm run data:import
```

L’importazione verifica SHA-256, conteggi ufficiali, ID e copertura delle definizioni prima di pubblicare i file. Fonti, correzioni editoriali e licenze in [`public/data/README.md`](public/data/README.md). I significati delle flashcard restano in inglese. I test usano anche glossari italiani originali derivati dagli stessi significati CC-CEDICT, sotto CC BY-SA 3.0.

## Grammatica

**572 punti grammaticali dell’Appendice A di GF0025-2021**, nei livelli 1–6 e nel blocco comune 7–9. Ogni regola ha schema, spiegazione italiana ed esempi con caratteri, pinyin, traduzione italiana e Ascolta: **1.365 frasi** complessive. Spiegazioni ed esempi sono contenuti didattici originali, non una traduzione ufficiale dello standard.

Si scarica soltanto il JSON del livello corrente, con cache delle richieste. Gli esempi vengono inseriti nel DOM alla prima apertura della regola; aprirla non avvia né precarica audio. Ascolta carica e riproduce soltanto la frase scelta. Il vocabolario delle flashcard resta cumulativo e i progressi non vengono modificati studiando grammatica.

Inventario, correzioni della trascrizione, conteggi e provenienza in [`public/data/README.md`](public/data/README.md). `npm run grammar:check` verifica tutti i livelli senza caricare il modello vocale.

## Progressione e letture

`curriculum-level-{1..7}.json` definisce l’ordine di introduzione delle parole e delle regole, senza cambiare ID o livelli ufficiali. Si riordinano solo le carte nuove: i ripassi scaduti mantengono la precedenza FSRS e le scadenze persistite non vengono riscritte.

Con `N` parole e `R` regole nuove nel livello, la regola in posizione `i` usa al massimo le prime `floor(N × i / R)` parole, oltre a tutti i livelli precedenti. HSK 1 ha **500 parole e 48 regole**: i primi limiti sono 10, 20, 31 e 41, fino a 500. Gli esempi sono stati adattati al lessico disponibile. Le forme grammaticali introdotte dalla regola stessa, come il suffisso 儿 o la particella 矣, appartengono alla conoscenza grammaticale e non richiedono una flashcard inesistente.

**Letture** contiene dieci testi originali per ciascuno dei sette blocchi: **70 testi**, con temi diversi. La lettura `j` usa le prime `floor(N × j / 10)` parole e le regole già comprese entro quel limite, più le conoscenze dei livelli precedenti. Per HSK 1: 50, 100, …, 500 parole. Ogni paragrafo ha caratteri, Pinyin e traduzione italiana; due caselle indipendenti mostrano o nascondono i supporti sotto il cinese. Entrambi sono nascosti inizialmente. **Nessun audio nelle letture.**

Si caricano soltanto percorso e letture del livello scelto, con cache delle richieste; i paragrafi vengono inseriti alla prima apertura. I limiti restano indicazioni didattiche: lo sblocco avviene per livello, non per singola regola o lettura.

Verifiche offline, con la sola libreria standard Python:

```sh
npm run curriculum:check
npm run curriculum:test
```

Il controllo verifica permutazioni complete degli ID, dipendenze lessicali dei testi cinesi, letture polifoniche negli esempi e disponibilità delle regole dichiarate. La coerenza sintattica delle letture è sottoposta anche a revisione editoriale; il controllo lessicale non è un parser grammaticale completo. `npm run curriculum:build` crea soltanto percorsi mancanti validi e non sovrascrive quelli già fissati.

## Test e sblocco

Un test per ciascuno dei sette blocchi HSK, **20 domande casuali a scelta multipla**, quattro opzioni e una risposta corretta. Ogni tentativo comprende cinque domande per tipo:

- caratteri → Pinyin;
- caratteri → significato italiano;
- frase cinese della grammatica → traduzione italiana;
- parola o espressione italiana → caratteri.

Il pool comprende tutte le parole e le regole del livello selezionato e dei precedenti: fino a **11.092 voci e 572 regole / 1.365 esempi**. I glossari italiani sono contenuti editoriali locali, non traduzioni ufficiali dello standard. Letture e test non richiedono servizi esterni o sintesi audio.

**20 test da 20/20 consecutivi sbloccano il livello seguente.** Una risposta errata confermata azzera immediatamente la serie del proprio livello, anche abbandonando il tentativo. Un tentativo incompleto non assegna successi. Le serie sono indipendenti; un livello già sbloccato non si riblocca. Il blocco 7–9 è l’ultimo.

Conteggi e sblocco sono salvati atomicamente in IndexedDB prima di avanzare la UI. In caso di errore di salvataggio la stessa risposta resta recuperabile, senza assegnare due successi. Il caricamento dei pool è lazy e condiviso con le cache del vocabolario e della grammatica; il campionamento non copia o mescola l’intero mazzo.

Questo aggiornamento applica il **reset richiesto una sola volta per browser/origine**: carte, storico, livello, serie e sblocchi tornano allo stato iniziale, con HSK 1 disponibile. Il marcatore `settings.progressRevision = 1` viene scritto nella stessa transazione del reset; i nuovi progressi non vengono cancellati ai reload successivi.

`npm run tests:check` verifica glossari italiani e indice delle letture polifoniche. `python3 scripts/check-tests.py --write-pinyin` rigenera soltanto tale indice dai JSON ufficiali invariati.

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
npm run tests:check
npm run build
```

**49 test passati**: 7 FSRS, 4 sulla generazione dei quiz, 4 sulla progressione dei test, 14 sul validatore didattico, 7 fonetici del vocabolario e 13 delle frasi. Controllati tutti i percorsi, **572 regole**, **1.365 esempi**, **70 letture**, le **11.092 glosse italiane** e le **138 grafie con più letture ufficiali**. Uno smoke sul generatore reale ha prodotto 1.400 tentativi, 200 per livello, verificando le quattro tipologie, quattro opzioni uniche e venti bersagli distinti per tentativo.

Smoke Chromium sullo sviluppo a 1280×900 e 390×844 e sulla produzione a 390×844. Completati venti test perfetti consecutivi su HSK 1: HSK 2 resta bloccato fino al ventesimo, poi si sblocca e conserva 1.272 carte cumulative dopo reload. Una risposta errata azzera subito la serie, anche abbandonando il tentativo. Verificati persistenza, recupero dopo HTTP 503, conservazione del tentativo cambiando sezione e mancata duplicazione del successo dopo errore di salvataggio e doppio clic sul recupero. In produzione l’interruzione forzata della transazione mostra un errore leggibile e non attribuisce successi prima del commit; avviati inoltre i test di tutti i sette blocchi.

Aperte tutte le 70 letture, con 193 paragrafi: Pinyin e Traduzione si attivano indipendentemente sotto il cinese, senza audio né nuove richieste del vocabolario passando tra i livelli. Verificati anche i supporti della lettura avanzata sulla produzione mobile. Nessun overflow, errore runtime non gestito o richiesta esterna osservato nei percorsi verificati.

Verificato il reset una tantum con progressi preesistenti sullo sviluppo e lo stato iniziale sull’origine utente localhost:5173: HSK 1, 500 nuove carte, nessuna review o serie di successi, livelli superiori bloccati. Dopo il reset, primo Facile ancora a **5 giorni**, Date e stabilità persistite; i nuovi progressi delle carte e dei test sopravvivono al reload. Rimossi i dati sintetici dalle sole origini di verifica localhost:5177 e :5178.

Build TypeScript/Vite riuscita: JavaScript **16,25 kB gzip**, esclusi dati/audio. Verificati gli hash di tutti i **12.457 MP3**, **37 JSON** e **due manifest** nella distribuzione; vocabolario ufficiale, lezioni grammaticali, generatore audio del vocabolario e corpus MP3 invariati. Nessun peso del modello o audio di lettura/test incluso. La verifica strumentale dell’audio non equivale a un ascolto umano o a una garanzia universale di naturalezza.
