# DripOrSkip — Fix tastiera/input Android (Capacitor)

Questo documento riassume le modifiche applicate per risolvere il bug per cui,
nell'APK Android, entrando in un campo input (login o ricerca) la tastiera si
apriva ma il testo digitato non compariva, il cursore restava bloccato e la UI
si congelava.

## Modifiche applicate

### 1. `capacitor.config.ts`
- **`android.captureInput: true`** — fix documentato da Capacitor per il bug
  del WebView Android in cui il testo digitato non aggiorna visivamente
  l'input (usa una `InputConnection` alternativa).
- **`plugins.Keyboard.resizeOnFullScreen: false`** — richiesto dal plugin
  edge-to-edge (vedi sotto) per evitare un doppio resize del WebView.
- **`plugins.SystemBars.insetsHandling: "disable"`** — disattiva la gestione
  insets integrata di Capacitor 8, sostituita dal plugin dedicato.
- **`plugins.EdgeToEdge`** — colori barra di stato/navigazione (nero, coerente
  col tema dell'app).

### 2. `AndroidManifest.xml`
- Aggiunto **`android:windowSoftInputMode="adjustResize"`** alla
  `MainActivity`: rende prevedibile il ridimensionamento del WebView
  all'apertura della tastiera.

### 3. Nuovi plugin (installati e sincronizzati)
- **`@capacitor/keyboard`** (v8) — controllo/eventi tastiera.
- **`@capawesome/capacitor-android-edge-to-edge-support`** (v8) — ripristina
  il layout tradizionale su Android 15/16 (SDK 35+), dove il sistema forza
  l'edge-to-edge senza opt-out. Questa combinazione è la mitigazione
  consigliata dalla community Capacitor per i bug tastiera/inset su
  `targetSdk 35/36` (questo progetto targetizza SDK 36).

### 4. `MainActivity.java` (RICREATA — era assente dal repository)
- Il repo non conteneva `android/app/src/main/java/...` (mai committata).
  È stata ricreata la classe standard Capacitor in
  `android/app/src/main/java/com/driporskip/app/MainActivity.java`.
  Senza questo file una build da clone pulito fallisce.

### 5. TabBar e tastiera (`src/routes/__root.tsx` + nuovo hook)
- Nuovo hook `src/hooks/use-keyboard-visible.ts`: ascolta gli eventi nativi
  `keyboardWillShow`/`keyboardWillHide` (no-op nel browser).
- La bottom TabBar (position: fixed) ora viene nascosta **mentre la tastiera
  è aperta**, così con `adjustResize` non "sale" sopra la tastiera coprendo
  il campo a fuoco. La logica per route (`/auth`, `/messages/:id`) è invariata.

### 6. `vite.config.ts`
- Corretto un errore TypeScript pre-esistente (non causato dai fix):
  l'oggetto passato a `defineConfig` di `@lovable.dev/vite-tanstack-config`
  non rispettava i tipi. Comportamento a runtime identico.

### 7. `.env.example` (nuovo)
- Documenta le variabili obbligatorie. **Senza un file `.env` valido, la
  build produce un'app che si blocca all'avvio** (errore "Missing Supabase
  environment variables").

## Come generare l'APK (passi obbligatori, in ordine)

```bash
# 1. Crea il file .env partendo dall'esempio e inserisci la tua chiave
cp .env.example .env
#    -> apri .env e inserisci VITE_SUPABASE_PUBLISHABLE_KEY

# 2. Installa le dipendenze (include i nuovi plugin)
npm install

# 3. Compila il bundle web per mobile
npm run build:mobile

# 4. Sincronizza il progetto Android (copia assets + collega i plugin nativi)
npx cap sync android

# 5. Apri in Android Studio e genera l'APK
npx cap open android
#    Build -> Build App Bundle(s)/APK(s) -> Build APK(s)
```

## Verifiche fatte in questo ambiente (senza SDK Android)

- ✅ `tsc --noEmit`: nessun errore di tipo su tutto il progetto
- ✅ ESLint + Prettier sui file modificati: puliti
- ✅ `npm run build:mobile`: build OK
- ✅ `npm run build` (build web): OK, nessuna regressione dal fix di
  `vite.config.ts`
- ✅ `npx cap sync android`: 2 plugin rilevati e collegati; il file generato
  `android/app/src/main/assets/capacitor.config.json` contiene
  `captureInput`, `Keyboard`, `SystemBars`, `EdgeToEdge`
- ✅ `AndroidManifest.xml` valido (XML well-formed, `windowSoftInputMode`
  presente)
- ✅ Il bundle compilato contiene l'hook tastiera (`keyboardWillShow`)

## Cosa NON è stato possibile verificare qui (da fare sul tuo ambiente)

In questo ambiente non sono disponibili Android SDK/Gradle/emulatore, quindi
la verifica finale su dispositivo va fatta dopo la build:

1. Login: digitare email/password, il testo deve comparire mentre si digita
2. Passaggio tra campi (email -> password) senza blocchi
3. Ricerca: digitazione fluida con risultati che si aggiornano (debounce)
4. La TabBar scompare quando la tastiera è aperta e ricompare alla chiusura
5. Nessun freeze: chiudere la tastiera, navigare, riaprire un input
6. Swipe Drip/Skip nel feed invariato (nessuna regressione)

Se dopo questi fix il problema dovesse persistere su un dispositivo
specifico, raccogliere un logcat durante la riproduzione:

```bash
adb logcat | grep -iE "chromium|Capacitor|InputMethodManager"
```

e in base all'esito valutare (in ordine): aggiornare Android System WebView
sul dispositivo/emulatore; provare `captureInput: false` (alcuni WebView
recenti si comportano meglio senza); verificare le issue aperte di Capacitor
per Android 16 (es. ionic-team/capacitor#8432).
