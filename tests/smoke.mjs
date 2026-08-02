import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const fail=message=>{throw new Error(message);};
const required=['index.html','app.css','app.js','sw.js','manifest.webmanifest','icon.svg','serve.mjs','vendor/html5-qrcode.min.js','vendor/jsbarcode.min.js','vendor/xlsx.full.min.js','vendor/jspdf.umd.min.js','vendor/jspdf.plugin.autotable.min.js','vendor/jszip.min.js'];

for(const file of required)if(!fs.existsSync(path.join(root,file)))fail(`Pflichtdatei fehlt: ${file}`);

for(const file of ['app.js','sw.js'])new vm.Script(read(file),{filename:file});
execFileSync(process.execPath,['--check',path.join(root,'serve.mjs')],{stdio:'pipe'});

const html=read('index.html');
const app=read('app.js');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
const duplicates=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
if(duplicates.length)fail(`Doppelte HTML-IDs: ${duplicates.join(', ')}`);

const idSet=new Set(ids);
const referenced=[...app.matchAll(/\$\('#([^']+)'\)/g)].map(match=>match[1]);
const missing=[...new Set(referenced.filter(id=>!idSet.has(id)))];
if(missing.length)fail(`Von app.js referenzierte HTML-IDs fehlen: ${missing.join(', ')}`);

for(const feature of ['sizeRangeFrom','sizeRangeTo','applySizeRange','variantSizes'])if(!idSet.has(feature))fail(`Größenautomatik fehlt: ${feature}`);
if(!app.includes("const SIZE_SCALE=['XXS','XS','S','M','L','XL','XXL','3XL','4XL','5XL']"))fail('Größenfolge XXS bis 5XL fehlt.');
if(!app.includes('SIZE_SCALE.slice(start,end+1)'))fail('Automatische Größenbereich-Auswahl fehlt.');
if(!app.includes("{code:'TS',label:'T-Shirts',match:/\\b(t[ -]?shirt|tee|shirt)\\b/i}"))fail('Shirts werden nicht als T-Shirts erkannt.');
for(const feature of ['exportReorderPdf','printReorder','exportLabelsPdf'])if(!idSet.has(feature))fail(`PDF-/Druckfunktion fehlt: ${feature}`);
for(const handler of ["$('#exportReorderPdf').onclick","$('#printReorder').onclick","$('#exportLabelsPdf').onclick"])if(!app.includes(handler))fail(`PDF-Klickfunktion fehlt: ${handler}`);
for(const column of ['Artikelbezeichnung','Farbe / Größe','Bestellen','Summe'])if(!app.includes(column))fail(`Genaue Nachbestellspalte fehlt: ${column}`);

const sw=read('sw.js');
for(const asset of required.filter(file=>!['serve.mjs','sw.js'].includes(file))){
  const expected=`./${asset}`;
  if(!sw.includes(`'${expected}'`)&&!['icon.svg'].includes(asset))fail(`Offline-Datei fehlt im Service Worker: ${expected}`);
}

const manifest=JSON.parse(read('manifest.webmanifest'));
if(manifest.display!=='standalone'||!manifest.start_url)fail('Manifest ist nicht als installierbare Web-App konfiguriert.');

const sourceFiles=['index.html','app.js','app.css','sw.js','manifest.webmanifest','serve.mjs'];
const secretPatterns=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  /gh[opusr]_[A-Za-z0-9_]{20,}/
];
for(const file of sourceFiles){
  const content=read(file);
  for(const pattern of secretPatterns)if(pattern.test(content))fail(`Mögliches Geheimnis in ${file} gefunden.`);
}

console.log(`HP67 Smoke-Test bestanden: ${required.length} Dateien, ${ids.length} HTML-IDs, PWA-Manifest und Datenschutzprüfung.`);
