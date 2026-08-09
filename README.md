# HP67 Inventar

Mobile, installierbare Inventar-App für Textilien. Sie verwaltet Artikel, Mindestbestände, Ein- und Verkäufe, zeigt farbige Bestandswarnungen und kann Rechnungen oder Listen per Foto einlesen.

## Funktionen

- Artikelvarianten mit SKU, EAN/Barcode, Farbe, Größe, Lieferant und Lagerplatz
- Lokale Artikelfotos direkt aus der iPhone-Kamera
- Deutsche Spracheingabe für mehrere Einkäufe, Verkäufe, Retouren oder Entnahmen in einem Satz
- Kamera-Scanner für EAN-13, EAN-8, UPC, Code 128, Code 39 und QR-Codes
- Automatische interne EAN-13-Erzeugung mit korrekter Prüfziffer
- Direkte Ein- und Ausbuchung nach einem erfolgreichen Scan
- Frei konfigurierbare Regale, Fächer und Boxen mit eigenem Lagercode und Kennfarbe
- Scannbare Lagerplatz-Aufkleber als SVG-ZIP, PDF oder direkter Ausdruck
- Lagerplatz-Scan öffnet automatisch alle dort zugeordneten Textilien
- Etikettendesigner für A4-Bögen und 50/62-mm-Thermodrucker
- Optionale Etikettenangaben für Lagerplatz, Marke und Material
- Einzel- und Stapeldruck sowie Barcode-Export als SVG und PNG
- Vollständige Vektoretiketten als SVG und Stapel-Export als ZIP
- Hochauflösende PNG-Etiketten mit 300 oder 600 DPI
- Eigenes SVG-/PNG-Logo, Farben, Schriftgröße und freie Startpositionen
- Ein- und Verkäufe mit frei wählbarem Buchungsdatum
- Kundenretouren sowie beschädigte oder entnommene Ware
- Mindestbestandsampel und automatische Nachbestellvorschläge
- Lieferantenbestellungen mit Status, Teilmengen und getrenntem Wareneingang
- Nachbestelllisten als CSV, PDF oder direkter Ausdruck
- Inventurmodus mit protokollierten Bestandskorrekturen
- Umsatz- und Rohertragsauswertung für die letzten sechs Monate
- OCR-Import für Rechnungsfotos und manuell eingefügte Listen
- Smart-Kamera für Artikel und Lagerplätze: Barcode/SKU/Lagercode zuerst, anschließend lokaler Fotovergleich
- Privates Foto-Lernsystem mit bis zu 6 Ansichten je Artikel und 4 Ansichten je Lagerplatz
- Bestehende Artikelfotos werden beim ersten Smart-Scan automatisch in speichersparende Bildmerkmale umgewandelt
- Foto-Treffer zeigen Ähnlichkeit und müssen vor einer Bestandsbuchung ausdrücklich bestätigt werden
- CSV-Import/-Export und vollständige JSON-Sicherung
- CSV-, TSV- und Excel-Import mit Vorschau und Duplikaterkennung
- XML-Import und -Export für strukturierte Datenaustauschprozesse
- Excel-Arbeitsmappe mit Inventar, Lagerplätzen, Buchungen und Bestellungen
- PDF-Inventarbericht sowie separater CSV-Buchungsverlauf
- Rückgängig-Funktion für die letzte Buchung
- Erweiterte Textilstammdaten, Tags, Beschreibung und Artikelarchiv
- Manuelle Inventar-Momentaufnahmen und ABC-Umsatzanalyse
- Begrenztes Rendering für flüssige Listen mit vielen Artikeln

## Starten

Die App muss über einen kleinen Webserver geöffnet werden (nicht direkt per Doppelklick), damit Offline-Modus und Installation funktionieren.

```powershell
node serve.mjs
```

Danach im Browser `http://localhost:8080` öffnen. Für das iPhone muss die Seite im selben Netzwerk oder über einen HTTPS-Webspace erreichbar sein. In Safari: **Teilen → Zum Home-Bildschirm**.

## Vor dem Hochladen prüfen

```powershell
node tests/smoke.mjs
```

Der Test prüft JavaScript-Syntax, alle lokal benötigten Dateien, doppelte oder fehlende HTML-IDs, die Offline-Dateiliste und typische versehentlich eingetragene Geheimnisse. Beim Push zu GitHub läuft derselbe Test automatisch über GitHub Actions.

## Neues privates GitHub-Repository

1. Auf GitHub **New repository** auswählen.
2. Einen Namen wie `hp67-inventar` vergeben und unbedingt **Private** auswählen.
3. Keine README, `.gitignore` oder Lizenz von GitHub erzeugen lassen, da diese Dateien bereits vorhanden sind.
4. Im Projektordner ausführen; `DEIN-NAME` durch den GitHub-Benutzernamen ersetzen:

```powershell
git add .
git commit -m "HP67 Inventar App"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/hp67-inventar.git
git push -u origin main
```

Für eine private iPhone-Web-App empfiehlt sich anschließend eine HTTPS-Bereitstellung mit Zugriffsschutz, beispielsweise Cloudflare Pages plus Cloudflare Access. In GitHub liegen nur Programmdateien. Artikel, Preise, Rechnungen und Fotos, die später auf dem iPhone erfasst werden, bleiben im lokalen App-Speicher des jeweiligen Geräts.

## Datensicherheit

Alle Inventardaten liegen lokal im Browser des Geräts. Unter **Mehr → Sicherung herunterladen** sollte regelmäßig eine JSON-Sicherung erstellt werden. Beim Löschen der Browserdaten gehen ungesicherte Daten verloren.

Die OCR-Texterkennung lädt beim ersten Scan die Erkennungssoftware und das deutsche Sprachmodell aus dem Internet. Die eigentliche Erkennung läuft im Browser. Jeder Belegimport wird vor der Buchung zur Kontrolle angezeigt.

## Smart-Kamera richtig anlernen

Öffne einen Artikel, tippe bei „Lokale Fotoerkennung“ auf „Ansicht anlernen“ und fotografiere das Textil 3–6 Mal: Vorderseite, Rückseite, Etikett und bei Bedarf ein Detail. Ein ruhiger, möglichst gleicher Hintergrund verbessert die Treffer. Lagerplätze können unter „Mehr → Lagerplätze & Aufkleber“ mit 2–4 Blickwinkeln angelernt werden.

Die Smart-Kamera arbeitet in Stufen: Ein Barcode, eine SKU oder ein Lagercode ist eindeutig. OCR versucht sichtbare Etiketten zu lesen. Der Fotovergleich erkennt bereits angelernte Motive und übernimmt deren Artikelart – beispielsweise „T-Shirts“ – zeigt dabei aber immer eine Ähnlichkeit und verlangt vor dem Buchen eine Bestätigung. Ein unbekanntes Textil ohne lesbaren Code muss einmal zugeordnet werden; danach lernt die App seine Ansichten lokal. Fotos und Bildmerkmale werden nicht zu GitHub hochgeladen.

## Barcodes und Drucken

Der Kamera-Scanner benötigt auf iPhone und iPad eine HTTPS-Adresse und eine einmalige Kamerafreigabe. Alternativ können ein Barcode-Foto sowie Artikel- oder Lagercodes manuell eingegeben werden. Das Etikettenstudio unterstützt A4-Bögen, 50/62-mm-Thermoetiketten und freie Abmessungen. Über den Druckdialog kann direkt gedruckt oder als PDF gespeichert werden.

Automatisch erzeugte EAN-13-Codes beginnen mit `29` und sind ausschließlich für die interne Lagerkennzeichnung gedacht. Für Codes, die im öffentlichen Einzelhandel, bei Amazon oder anderen Marktplätzen verwendet werden, müssen offiziell zugeteilte GS1-Nummern genutzt werden.
