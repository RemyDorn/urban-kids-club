# Dokio – KI-Dokumenten-Sekretaer

Automatische Dokumentenverarbeitung: Scannen, Analysieren, Sortieren, Loggen, Benachrichtigen.

## Ablauf

```
Scanner (Epson)
    |  alle Dokumente als eine PDF scannen
    v
Google Drive: _inbox/
    |
    v
Google Apps Script (jede Minute)
    |  Claude erkennt Dokumentgrenzen
    |  ilovepdf splittet PDF in Einzeldokumente
    |  Einzeldateien zurueck in _inbox/
    v
n8n Workflow (pro Einzeldatei)
    |
    ├─ Claude analysiert: Typ, Absender, Datum, Betrag, Prioritaet
    ├─ Ordner pruefen/erstellen in _sorted/Absender/
    ├─ Datei verschieben + umbenennen (YYYY-MM-DD_Typ_Absender_Betrag.pdf)
    ├─ Google Sheets: Metadaten loggen
    └─ Telegram: Benachrichtigung mit Aktionsempfehlung
```

## Voraussetzungen

- Hetzner Server mit n8n (Docker)
- Google Drive Account
- Anthropic API Key (claude-sonnet-4-6)
- ilovepdf API Keys (kostenlos: developer.ilovepdf.com)
- Telegram Bot Token (@BotFather)

## Google Drive Ordnerstruktur

```
Dokio/
├── _inbox/          ← Scanner legt PDFs hier ab
└── _sorted/         ← Automatisch sortierte Dokumente
    ├── Finanzamt/
    ├── AOK/
    ├── IHK/
    └── ...          ← werden automatisch erstellt
```

## Einrichtung

### 1. Google Drive Ordner erstellen

- `_inbox` Ordner erstellen → Folder-ID notieren (aus URL)
- `_sorted` Ordner erstellen → Folder-ID notieren

### 2. Google Sheets vorbereiten

Neues Spreadsheet erstellen. Erstes Tabellenblatt "Dokumente" nennen.
Spalten in Zeile 1:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| dokumenttyp | datum | absender | betrag | prioritaet | zusammenfassung | aktion_empfohlen | original_dateiname | neuer_dateiname | scan_datum |

Spreadsheet-ID notieren (aus URL).

### 3. Google Apps Script einrichten (PDF-Splitter)

1. Gehe zu [script.google.com](https://script.google.com)
2. Neues Projekt → Name: "Dokio Splitter"
3. Inhalt von `apps-script.js` einfuegen
4. Oben im Script die CONFIG Werte eintragen:
   - `ANTHROPIC_API_KEY`: Dein Anthropic API Key
   - `ILOVEPDF_PUBLIC_KEY`: Dein ilovepdf Public Key
   - `ILOVEPDF_SECRET_KEY`: Dein ilovepdf Secret Key
   - `INBOX_FOLDER_ID`: Google Drive _inbox Folder ID
5. Speichern (Ctrl+S)
6. Dropdown oben → `setupTrigger` auswaehlen → Ausfuehren
7. Google Berechtigungen bestaetigen

Das Script laeuft jetzt automatisch jede Minute.

### 4. n8n Workflow einrichten

**Option A: JSON importieren**
1. n8n oeffnen → ... (oben rechts) → Import from JSON
2. `n8n-workflow.json` hochladen
3. Alle PLATZHALTER ersetzen (siehe unten)
4. "Analyze document" Node manuell konfigurieren (siehe unten)

**Option B: Manuell aufbauen (nach Screenshot)**
Den Workflow wie im Screenshot aufbauen mit folgenden Nodes:

```
Trigger → Wait → Download → Analyze → Parse → Search → IF → Create/Use → Merge → Move → Rename → Sheets → Telegram
```

### 5. Platzhalter ersetzen

In der JSON (oder direkt in den Nodes):

| Platzhalter | Ersetzen mit |
|---|---|
| `DEINE_INBOX_FOLDER_ID` | Google Drive _inbox Folder ID |
| `DEINE_SORTED_FOLDER_ID` | Google Drive _sorted Folder ID |
| `DEINE_SHEETS_ID` | Google Sheets Spreadsheet ID |
| `DEINE_TELEGRAM_CHAT_ID` | Telegram Chat ID (von @userinfobot) |
| `CREDENTIAL_ID` | Wird automatisch gesetzt bei Node-Konfiguration |

### 6. Analyze Document Node konfigurieren

Dieser Node muss manuell eingerichtet werden:

1. Node loeschen falls aus Import vorhanden
2. \+ → "Anthropic" suchen → "Analyze Document" waehlen
3. Einstellungen:
   - **Credential**: Anthropic API Key eintragen
   - **Model**: `claude-sonnet-4-6`
   - **Input Type**: Binary
   - **Binary Property Name**: `data`
   - **Text Input** (Prompt):

```
Analysiere dieses Dokument praezise. Antworte NUR mit validem JSON ohne Markdown-Backticks:
{
  "dokumenttyp": "Rechnung|Vertrag|Kontoauszug|Behoerdenpost|Mahnung|Bescheid|Sonstiges",
  "datum": "YYYY-MM-DD oder null",
  "absender": "Vollstaendiger Name des Absenders",
  "absender_kurz": "Kurzer Name fuer Ordner z.B. Finanzamt, AOK, IHK - max 30 Zeichen, keine Sonderzeichen",
  "empfaenger": "Name des Empfaengers",
  "betrag": "Betrag als Zahl in EUR oder null",
  "faelligkeit": "YYYY-MM-DD oder null",
  "prioritaet": "hoch|mittel|niedrig",
  "zusammenfassung": "Kurze Zusammenfassung auf Deutsch in einem Satz",
  "aktion_empfohlen": "Konkrete naechste Aktion"
}
```

### 7. Telegram Bot einrichten

1. Telegram oeffnen → @BotFather anschreiben
2. `/newbot` → Name und Username vergeben
3. Bot Token kopieren → in n8n Telegram Credential eintragen
4. Chat-ID herausfinden: @userinfobot anschreiben → ID kopieren
5. Chat-ID im "Telegram – Benachrichtigung" Node eintragen

### 8. Testen

1. Ein Dokument scannen → als PDF in _inbox hochladen
2. Warten (max. 1 Min fuer Splitter + 2 Min Wait in n8n)
3. Pruefen:
   - [ ] Datei in _sorted/Absender/ verschoben?
   - [ ] Datei korrekt umbenannt?
   - [ ] Eintrag in Google Sheets?
   - [ ] Telegram Nachricht erhalten?

### 9. Workflow aktivieren

In n8n → Workflow oeffnen → oben rechts "Active" einschalten → Publish.

## Fehlerbehebung

| Problem | Loesung |
|---|---|
| Script splittet nicht | Apps Script Logs pruefen: Ausfuehrungen anzeigen |
| n8n triggert zu frueh | Wait Node auf 180 Sekunden erhoehen |
| Ordner nicht gefunden | Sheet-Tab Name pruefen (muss "Dokumente" heissen) |
| Telegram kommt nicht | Bot Token und Chat-ID pruefen |
| Claude Error 400 | Input Type auf "Binary" pruefen, Property "data" |

## Kosten

- **Claude API**: ~0.003 EUR pro Dokument (Sonnet)
- **ilovepdf**: Kostenlos bis 250 Splits/Monat
- **n8n**: Selbst-gehostet (nur Serverkosten)
- **Google**: Kostenlos
- **Telegram**: Kostenlos
