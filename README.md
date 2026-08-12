# HP67 Inventar

Mobile, installierbare Inventar-App für Textilien. Sie verwaltet Artikel, Mindestbestände, Ein- und Verkäufe, zeigt farbige Bestandswarnungen und kann Rechnungen oder Listen per Foto einlesen.

## Neu in Version 3.10

- Vollständige Etiketten lassen sich als kontrastreiche 203-DPI-PNGs direkt an das iPhone-Teilen-Menü und – sofern dort verfügbar – an Nelko übergeben.
- Nelko-Formate 40 × 15, 50 × 25, 50 × 30 und 70 × 40 mm stehen direkt im Etikettenstudio bereit.
- Ohne Nelko-Freigabeerweiterung speichert die App dieselbe druckfertige PNG-Datei als zuverlässigen Fallback für „Picture/Bild“.

## Neu in Version 3.9

- Beliebig viele eigene Preisvarianten pro Artikel, zum Beispiel „Vorne“ und „Vorne + hinten“.
- Beim Verkauf wird die tatsächlich verkaufte Preisvariante ausgewählt und dauerhaft in der Buchung gespeichert.
- Verlauf, Statistik, CSV- und Excel-Export werten die Verkaufsvarianten getrennt aus.

## Neu in Version 3.8

- Die laufende SKU-Endnummer zählt jetzt gemeinsam je Artikel und Farbe über alle Größen weiter: Rot/S 001, Rot/M 002, Rot/L 003.
- Jede andere Farbe führt eine eigene, automatisch fortgesetzte Nummernreihe.

## Neu in Version 3.7

- Einzelne Exemplare je Farb-/Größenkombination erhalten automatisch fortlaufende SKUs und eigene Barcodes.
- Gruppenbarcodes bündeln frei ausgewählte Produkte und öffnen beim Scan zuerst die Artikelauswahl.
- Gruppenbarcodes lassen sich bearbeiten, löschen und direkt im 50 × 25-mm-Format drucken.

## Neu in Version 3.6

- sichere Dialog-Navigation: iPhone-Zurück, Escape und Schließen schützen ungespeicherte Artikel-, Buchungs-, Inventur-, Import- und Bestelldaten
- Scanner und Smart-Kamera erkennen archivierte Artikel, sperren Buchungen und führen direkt zur Reaktivierung
- Foto- und Lernvorgänge sperren Speichern bis zur vollständigen lokalen Verarbeitung
- strikter CSV-/TSV-/XML-/Excel-Import mit deutschen Tausenderformaten, leeren Zellen, eindeutigen Varianten und vollständig vorgeplantem Merge
- Rückgängig folgt der tatsächlichen Buchungsreihenfolge und schützt spätere Bestands- oder EK-Änderungen
- Inventur überspringt leere Zählfelder und lehnt negative oder gebrochene Stückzahlen ab
- Gratisverkauf mit 0,00 € bleibt 0,00 €; Tabellenexporte neutralisieren ausführbare Formelpräfixe
- Druckformat des Einzelbarcodes folgt dem gewählten Nelko-Format; große Etikettenjobs werden klar begrenzt
- OCR läuft mit fest versionierten Dateien, Sprachdaten und Rechenkern vollständig aus diesem Repository; die CSP sperrt fremde Laufzeitskripte (nur lokale WebAssembly-Kompilierung ist erlaubt)
- verbesserte Touch-Ziele, Dialognamen, Statusansagen, Tastaturzugriff und reduzierte Bewegung

## Neu in Version 3.5

- Artikel als Arbeitszentrale: Einkauf, Verkauf, Verlauf, Etikett, Nachbestellung und Lagerplatz direkt miteinander verknüpft
- anklickbare Dashboard-Kennzahlen und Monatsbalken führen mit sichtbarem Kontext zum passenden Inventar oder Verlauf
- exakte Lagerplatzansicht aus Lagerverwaltung, Scanner und Smart-Kamera statt fehleranfälliger Freitextsuche
- Etiketten, Inventur und Nachbestellung übernehmen die aktuelle Inventarsuche und den aktuellen Filter
- offene Bestellmengen werden als „unterwegs“ angezeigt und verhindern doppelte Nachbestellvorschläge
- Bestellungen bleiben nach Erhalt oder Stornierung schreibgeschützt einsehbar; jede Position führt zurück zum Artikel
- Wareneingänge werden vollständig geprüft, bevor Bestand, Einkaufspreis oder Verlauf verändert werden
- „Rückgängig“ betrifft immer die neueste sichtbare Buchung im gewählten Artikel-, Bestell-, Monats- und Typfilter
- Browser-Zurück stellt Seiten- und Arbeitskontext wieder her, ohne Artikel-IDs oder andere lokale Daten in die URL zu schreiben

## Neu in Version 3.4

- iPhone-Formulare mit gut lesbaren Einzelfeldern und dauerhaft erreichbarem Speichern-Knopf
- zuverlässiges Ausblenden inaktiver Schaltflächen und klare Leermeldung in der Monatsauswertung
- automatische SKU- und EAN-13-Zuordnung beim Anlegen einzelner Artikel sowie eindeutige Codes für Stapelvarianten
- sichere CSV-/Excel-Zuordnung per SKU, Barcode oder Name + Farbe + Größe; Verkaufspreise bleiben beim Roundtrip erhalten
- geprüfter JSON-Import mit Typnormalisierung und Schutz vor doppelten IDs, SKUs und Barcodes
- Bestandsänderungen im Artikelformular erzeugen automatisch eine Korrekturbuchung; Überverkäufe werden abgelehnt
- Wareneingang und Rückgängig-Funktion halten Bestellung, Bestand und Einkaufspreis gemeinsam konsistent
- Kamera- und OCR-Läufe werden beim Schließen entwertet; große iPhone-Fotos werden vor OCR speicherschonend verkleinert
- Foto-Treffer benötigen mehrere angelernte Ansichten und werden bei ähnlichen Treffern oder unbekanntem Barcode für Schnellbuchungen gesperrt
- app-spezifischer Offline-Cache und Veröffentlichung erst nach erfolgreichem Testlauf

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

Die Smart-Kamera arbeitet in Stufen: Ein direkt gescannter, bereits zugeordneter Barcode ist eindeutig. OCR versucht sichtbare Etikettencodes zu lesen und verlangt eine Bestätigung. Der Fotovergleich erkennt nur bereits angelernte Motive; je Artikel sind dafür mindestens drei Ansichten, je Lagerplatz mindestens zwei Ansichten nötig. Bei ähnlich guten Treffern oder einem neuen unbekannten Barcode bleibt die Bestandsbuchung gesperrt. Ein unbekanntes Textil ohne lesbaren Code kann nicht zuverlässig allein als Shirt oder Hoodie bestimmt werden und muss einmal manuell zugeordnet werden. Fotos und Bildmerkmale werden nicht zu GitHub hochgeladen.

Falls eine lange installierte Home-Bildschirm-App noch eine alte Oberfläche zeigt, öffne **Mehr → App-Update jetzt laden**. Dabei werden nur alte Programmdateien ersetzt; das lokale Inventar und die angelernten Fotoansichten bleiben erhalten.

Falls selbst dieser Knopf in einer sehr alten Version noch fehlt, öffne einmal `https://jaso081529.github.io/HP67-Inventar-App/update.html`. Die Rettungsseite entfernt ebenfalls nur den Programm-Cache und öffnet danach automatisch die aktuelle App.

## Barcodes und Drucken

Der Kamera-Scanner benötigt auf iPhone und iPad eine HTTPS-Adresse und eine einmalige Kamerafreigabe. Alternativ können ein Barcode-Foto sowie Artikel- oder Lagercodes manuell eingegeben werden. Das Etikettenstudio unterstützt A4-Bögen, 50/62-mm-Thermoetiketten und freie Abmessungen. Über den Druckdialog kann direkt gedruckt oder als PDF gespeichert werden.

Automatisch erzeugte EAN-13-Codes beginnen mit `29` und sind ausschließlich für die interne Lagerkennzeichnung gedacht. Für Codes, die im öffentlichen Einzelhandel, bei Amazon oder anderen Marktplätzen verwendet werden, müssen offiziell zugeteilte GS1-Nummern genutzt werden.

## Hinweis zur GitHub-Pages-Adresse

Die eingetragenen Inventardaten werden nicht in das GitHub-Repository hochgeladen. Browser-Speicher ist technisch jedoch an die gesamte Adresse `jaso081529.github.io` gebunden, nicht nur an diesen Repository-Pfad. Auf demselben iPhone sollten deshalb keine fremden oder nicht vertrauenswürdigen GitHub-Pages-Projekte unter diesem Konto geöffnet werden. Für eine vollständig getrennte Herkunft eignet sich langfristig eine eigene Subdomain.
