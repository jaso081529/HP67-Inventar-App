# Lokale OCR-Dateien

Diese Dateien werden ausschließlich für die lokale Texterkennung in HP67 Inventar verwendet.

- `tesseract.js` 5.1.1
- `tesseract.js-core` 5.1.1
- schnelle deutsche und englische Sprachdaten aus `tessdata.projectnaptha.com/4.0.0_fast`

Die Laufzeitpfade sind in `smart-camera.js` fest auf diesen Ordner gesetzt. Dadurch wird beim Beleg- oder Kamerascan kein fremdes JavaScript in den App-Kontext geladen. Die Lizenztexte liegen daneben.
