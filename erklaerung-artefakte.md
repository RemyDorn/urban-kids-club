# Was sind Claude.ai-Artefakte?

## Konzeptualisierte Erklärung

**Artefakte** sind interaktive, eigenständige Inhalte, die Claude direkt im Chat rendert – nicht nur als Text, sondern als live ausführbares oder darstellbares Element neben der Konversation.

---

## Typen von Artefakten

### 1. Code-Artefakte
- Vollständige Code-Dateien (JavaScript, Python, HTML, etc.)
- Syntax-Highlighting und Kopier-Funktion
- Direkt ausführbar im Browser (bei HTML/JS/React)

### 2. Dokument-Artefakte
- Markdown-Dokumente
- Strukturierte Texte mit Formatierung
- Exportierbar als eigenständige Dateien

### 3. Interaktive Artefakte (React-Komponenten)
- Live-Dashboards und Visualisierungen
- Interaktive Tools und Rechner
- Diagramme und Charts mit Benutzerinteraktion
- Mini-Anwendungen direkt im Chat

### 4. SVG-Artefakte
- Vektorgrafiken und Diagramme
- Flowcharts und Architekturdiagramme
- Icons und Illustrationen

### 5. Mermaid-Diagramme
- Flowcharts
- Sequenzdiagramme
- ER-Diagramme
- Gantt-Charts

---

## Wie funktionieren Artefakte?

```
Benutzer stellt Anfrage
        |
        v
Claude analysiert: Braucht die Antwort ein Artefakt?
        |
        v
  [Ja]                          [Nein]
   |                              |
   v                              v
Artefakt wird erzeugt        Normale Textantwort
und im Panel gerendert
   |
   v
Benutzer kann:
- Artefakt bearbeiten lassen
- Kopieren / Herunterladen
- Iterativ verbessern
- Versionen durchblättern
```

### Wann wird ein Artefakt erstellt?

Claude erstellt ein Artefakt wenn der Inhalt:
- **Eigenständig nutzbar** ist (nicht nur ein Ausschnitt)
- **Länger als ~15 Zeilen** Code oder strukturierter Text ist
- **Wiederverwendbar** oder **exportierbar** sein soll
- **Interaktiv** dargestellt werden kann

### Wann wird KEIN Artefakt erstellt?

- Kurze Code-Snippets (unter ~15 Zeilen)
- Erklärungen und Diskussionen
- Einfache Antworten auf Fragen
- Code-Korrekturen innerhalb einer Erklärung

---

## Artefakte vs. normaler Chat-Text

| Eigenschaft | Chat-Text | Artefakt |
|---|---|---|
| Darstellung | Im Konversationsfluss | Separates Panel rechts |
| Interaktivität | Keine | Live-Rendering möglich |
| Versionierung | Nein | Ja (Versionshistorie) |
| Export | Copy-Paste | Download-Button |
| Bearbeitbar | Nein | Iterativ durch Folge-Prompts |
| Länge | Beliebig | Typischerweise vollständige Dateien |

---

## Praxisbeispiel: Dokio – Der KI-Sekretär

Ein reales Beispiel für die Nutzung von Claude (nicht als Artefakt, sondern als Arbeitswerkzeug) zeigt das Projekt **Dokio**: ein vollautomatischer Dokumenten-Sekretär, der mit folgenden Technologien arbeitet:

### Architektur

```
Epson Scanner
     |
     v
Google Drive (_inbox/)
     |
     v
Google Apps Script (Batch-Erkennung, PDF-Splitting)
     |
     v
n8n Workflow:
  1. Google Drive Trigger → neue PDF erkannt
  2. Wait Node (2 Min. Puffer für Splitting)
  3. PDF herunterladen
  4. Claude Analyze Document → Absender, Typ, Datum, Betrag erkennen
  5. Google Drive → Ordner nach Absender suchen/erstellen
  6. Datei umbenennen (YYYY-MM_Typ_Absender_Betrag.pdf)
  7. In _sorted/Absender/ verschieben
  8. Google Sheets → Metadaten loggen
  9. Telegram → Benachrichtigung senden
```

### Verwendete Claude-Funktionen

- **Document Analysis**: Claude analysiert gescannte PDFs und extrahiert strukturierte Metadaten (Absender, Datum, Betrag, Dokumenttyp, Priorität)
- **Batch-Erkennung**: Claude erkennt Dokumentgrenzen in mehrseitigen Batch-Scans anhand von Briefköpfen und Themenwechseln
- **Strukturierte JSON-Ausgabe**: Claude antwortet mit reinem JSON zur maschinellen Weiterverarbeitung

### Erkenntnisse aus dem Aufbau

1. **Native Integrationen bevorzugen**: Der eingebaute Anthropic-Node in n8n funktioniert sofort mit Binary-PDFs – kein base64-Encoding nötig
2. **Binary-Daten in n8n**: n8n speichert Binärdaten im Filesystem-Modus (`filesystem-v2:`), was direkte base64-Referenzen in HTTP-Request-Nodes verhindert
3. **PDF-Splitting ist komplex**: Echtes seitenweises Aufteilen von PDFs erfordert spezialisierte Libraries (pdf-lib, ilovepdf API, oder Community Nodes)
4. **Iteratives Vorgehen**: Komplexe Automatisierungen entstehen Schritt für Schritt – erst den Kernprozess zum Laufen bringen, dann erweitern

---

## Zusammenfassung

Artefakte in Claude.ai sind **eigenständige, interaktive Inhaltsblöcke**, die neben dem Chat dargestellt werden. Sie ermöglichen:

- **Live-Vorschau** von Code, Dokumenten und Visualisierungen
- **Iterative Verbesserung** durch Folge-Prompts
- **Versionsverwaltung** mit Rückblick auf frühere Versionen
- **Export** als vollständige, nutzbare Dateien

Sie sind besonders nützlich für die Erstellung von Code, Dokumenten, Diagrammen und interaktiven Prototypen – alles direkt im Chat, ohne externe Tools.
