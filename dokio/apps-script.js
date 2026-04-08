// ============================================================
// DOKIO PDF-SPLITTER – Google Apps Script
// ============================================================
// Dieses Script ueberwacht den _inbox Ordner in Google Drive.
// Wenn eine neue PDF erkannt wird:
//   1. Sofort umbenennen zu BATCH_ (damit n8n nicht triggert)
//   2. Claude analysiert die Dokumentgrenzen
//   3. ilovepdf splittet die PDF in Einzeldokumente
//   4. Einzeldokumente werden in _inbox abgelegt
//   5. n8n verarbeitet jede Einzeldatei automatisch
// ============================================================

// === KONFIGURATION ===
const CONFIG = {
  ANTHROPIC_API_KEY: 'DEIN_ANTHROPIC_API_KEY',
  ILOVEPDF_PUBLIC_KEY: 'DEIN_ILOVEPDF_PUBLIC_KEY',
  ILOVEPDF_SECRET_KEY: 'DEIN_ILOVEPDF_SECRET_KEY',
  INBOX_FOLDER_ID: 'DEINE_INBOX_FOLDER_ID'
};

// === HAUPTFUNKTION ===
function processBatchScan() {
  var query = "'" + CONFIG.INBOX_FOLDER_ID + "' in parents" +
    " and mimeType = 'application/pdf'" +
    " and not title contains 'BATCH_'" +
    " and not title contains 'SPLIT_'" +
    " and trashed = false";

  var files = DriveApp.searchFiles(query);

  while (files.hasNext()) {
    var file = files.next();
    var originalName = file.getName();

    // Sofort umbenennen damit n8n nicht triggert
    file.setName('BATCH_' + originalName);
    Logger.log('Gefunden: ' + originalName);

    try {
      var pdfBlob = file.getBlob();
      var seiteninfo = analysiereDocumentGrenzen(pdfBlob);

      Logger.log('Claude sagt: ' + JSON.stringify(seiteninfo));

      if (seiteninfo.anzahl <= 1) {
        // Einzeldokument - einfach zurueckbenennen
        file.setName(originalName);
        Logger.log('Einzeldokument, kein Split noetig');
        continue;
      }

      // Seitenbereiche fuer ilovepdf formatieren
      var ranges = formatPageRanges(seiteninfo.dokumente);
      Logger.log('Split-Ranges: ' + ranges);

      // PDF splitten via ilovepdf
      var splitBlobs = splitPdfViaIlovepdf(pdfBlob, ranges);
      Logger.log('Erhalten: ' + splitBlobs.length + ' Teile');

      // Einzeldateien in _inbox ablegen
      var folder = DriveApp.getFolderById(CONFIG.INBOX_FOLDER_ID);
      for (var i = 0; i < splitBlobs.length; i++) {
        var newName = 'SPLIT_' + (i + 1) + '_von_' + seiteninfo.anzahl + '_' + originalName;
        splitBlobs[i].setName(newName);
        folder.createFile(splitBlobs[i]);
        Logger.log('Erstellt: ' + newName);
      }

      // Original in Papierkorb
      file.setTrashed(true);
      Logger.log('Original geloescht');

    } catch (e) {
      Logger.log('FEHLER: ' + e.toString());
      // Bei Fehler: Original zurueckbenennen damit es nochmal versucht wird
      file.setName('FEHLER_' + originalName);
    }
  }
}

// === CLAUDE: DOKUMENTGRENZEN ERKENNEN ===
function analysiereDocumentGrenzen(pdfBlob) {
  var base64 = Utilities.base64Encode(pdfBlob.getBytes());

  var payload = {
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64
          }
        },
        {
          type: 'text',
          text: 'Dies ist ein Batch-Scan mit eventuell mehreren einzelnen Dokumenten (Briefe, Rechnungen, Bescheide etc.). '
            + 'Analysiere jede Seite und erkenne wo ein neues Dokument beginnt. '
            + 'Achte auf: verschiedene Briefkoepfe, verschiedene Absender, verschiedene Themen, Seitenzahlen wie "Seite 1 von 3". '
            + 'Antworte NUR mit validem JSON ohne Backticks:\n'
            + '{"anzahl": 3, "dokumente": [{"nummer": 1, "seiten": [1, 2]}, {"nummer": 2, "seiten": [3]}, {"nummer": 3, "seiten": [4, 5, 6]}]}\n'
            + 'Wenn es nur EIN Dokument ist: {"anzahl": 1, "dokumente": [{"nummer": 1, "seiten": "alle"}]}'
        }
      ]
    }]
  };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-beta': 'pdfs-2024-09-25'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var responseCode = response.getResponseCode();
  if (responseCode !== 200) {
    throw new Error('Claude API Fehler ' + responseCode + ': ' + response.getContentText());
  }

  var result = JSON.parse(response.getContentText());
  var text = result.content[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(text);
}

// === SEITENBEREICHE FORMATIEREN ===
function formatPageRanges(dokumente) {
  var ranges = [];
  for (var i = 0; i < dokumente.length; i++) {
    var doc = dokumente[i];
    if (doc.seiten === 'alle') {
      continue; // Sollte nicht vorkommen bei anzahl > 1
    }
    var seiten = doc.seiten;
    if (seiten.length === 1) {
      ranges.push(String(seiten[0]));
    } else {
      ranges.push(seiten[0] + '-' + seiten[seiten.length - 1]);
    }
  }
  return ranges.join(',');
}

// === ILOVEPDF: PDF SPLITTEN ===
function splitPdfViaIlovepdf(pdfBlob, ranges) {
  // 1. Authentifizieren
  var authRes = UrlFetchApp.fetch('https://api.ilovepdf.com/v1/auth', {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify({ public_key: CONFIG.ILOVEPDF_PUBLIC_KEY }),
    muteHttpExceptions: true
  });

  if (authRes.getResponseCode() !== 200) {
    throw new Error('ilovepdf Auth Fehler: ' + authRes.getContentText());
  }

  var token = JSON.parse(authRes.getContentText()).token;

  // 2. Task starten
  var startRes = UrlFetchApp.fetch('https://api.ilovepdf.com/v1/start/split', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });

  if (startRes.getResponseCode() !== 200) {
    throw new Error('ilovepdf Start Fehler: ' + startRes.getContentText());
  }

  var taskInfo = JSON.parse(startRes.getContentText());
  var server = taskInfo.server;
  var taskId = taskInfo.task;

  // 3. Datei hochladen
  var uploadRes = UrlFetchApp.fetch('https://' + server + '/v1/upload', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token },
    payload: {
      task: taskId,
      file: pdfBlob
    },
    muteHttpExceptions: true
  });

  if (uploadRes.getResponseCode() !== 200) {
    throw new Error('ilovepdf Upload Fehler: ' + uploadRes.getContentText());
  }

  var serverFilename = JSON.parse(uploadRes.getContentText()).server_filename;

  // 4. Splitten
  var processRes = UrlFetchApp.fetch('https://' + server + '/v1/process', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token },
    contentType: 'application/json',
    payload: JSON.stringify({
      task: taskId,
      tool: 'split',
      files: [{
        server_filename: serverFilename,
        filename: 'input.pdf'
      }],
      split_mode: 'ranges',
      ranges: ranges
    }),
    muteHttpExceptions: true
  });

  if (processRes.getResponseCode() !== 200) {
    throw new Error('ilovepdf Process Fehler: ' + processRes.getContentText());
  }

  // 5. Ergebnis herunterladen
  var downloadRes = UrlFetchApp.fetch('https://' + server + '/v1/download/' + taskId, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });

  if (downloadRes.getResponseCode() !== 200) {
    throw new Error('ilovepdf Download Fehler: ' + downloadRes.getContentText());
  }

  var contentType = downloadRes.getHeaders()['Content-Type'] || '';
  var resultBlob = downloadRes.getBlob();

  // Pruefen ob ZIP (mehrere Dateien) oder einzelne PDF
  if (contentType.indexOf('zip') !== -1 || resultBlob.getContentType().indexOf('zip') !== -1) {
    // ZIP entpacken
    var zipBlob = resultBlob.setContentTypeFromExtension();
    // Fallback: Content-Type manuell setzen
    if (zipBlob.getContentType().indexOf('zip') === -1) {
      zipBlob = resultBlob.setContentType('application/zip');
    }
    var unzipped = Utilities.unzip(zipBlob);
    // Nur PDFs zurueckgeben
    var pdfs = [];
    for (var i = 0; i < unzipped.length; i++) {
      if (unzipped[i].getContentType() === 'application/pdf' ||
          unzipped[i].getName().indexOf('.pdf') !== -1) {
        pdfs.push(unzipped[i]);
      }
    }
    return pdfs;
  } else {
    // Einzelne PDF (sollte bei ranges > 1 nicht passieren)
    return [resultBlob];
  }
}

// === TRIGGER EINRICHTEN ===
function setupTrigger() {
  // Alte Trigger loeschen
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  // Neuer Trigger: jede Minute
  ScriptApp.newTrigger('processBatchScan')
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log('Trigger gesetzt - laeuft jede Minute');
}

// === MANUELLER TEST ===
function testMitDatei() {
  // Zum Testen: Lege eine Multi-Page PDF in _inbox und fuehre diese Funktion aus
  processBatchScan();
}
