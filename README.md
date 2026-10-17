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

- Fronte: carattere/parola. Retro: pinyin, significato **in inglese**, sintesi vocale mandarino.
- Valutazioni Di nuovo / Difficile / Bene / Facile, con anteprima dell’intervallo. Spazio mostra la risposta; 1–4 valutano.
- FSRS-6 tramite `ts-fsrs`: ritenzione 90%, apprendimento 1/10 minuti, riapprendimento 10 minuti. Prima le carte in apprendimento scadute, poi i ripassi scaduti, poi le nuove; nessun limite giornaliero. Le carte future non vengono anticipate.
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

Browser moderno con IndexedDB, `Promise.withResolvers` e Web Speech API. L’audio richiede una voce **mandarino** disponibile nel sistema/browser, preferibilmente `zh-CN`. Alla rivelazione viene avviata la pronuncia; Ascolta la ripete. Se manca la voce, il controllo è disabilitato e il motivo è visibile: non viene usata una voce di un’altra lingua. Le voci possono richiedere rete o un pacchetto lingua installato. La scelta della lettura dei caratteri polifonici dipende dal sintetizzatore; il pinyin del dataset resta il riferimento esplicito.

## Verifiche

```sh
npm test
npm run build
```

7 test su precedenze, scadenze, espansione cumulativa, transizioni FSRS e conservazione dello stato. Smoke browser desktop/mobile eseguito su rivelazione, quattro valutazioni, persistenza dopo ricaricamento, tutti i livelli, carta 7–9, ripassi scaduti, attesa/riapparizione automatica, tastiera e sezioni vuote. Chromium di verifica non espone voci: verificato il messaggio di indisponibilità, **non verificato l’ascolto audio**. La build genera circa 9,4 kB gzip di JavaScript, escluso il vocabolario.

Verificata anche la build servita da `npm run preview`: rivelazione, valutazione e persistenza dopo reload su viewport mobile.
