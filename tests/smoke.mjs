import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const fail=message=>{throw new Error(message);};
const required=['index.html','app.css','app.js','smart-camera.js','sw.js','manifest.webmanifest','icon.svg','serve.mjs','vendor/html5-qrcode.min.js','vendor/jsbarcode.min.js','vendor/xlsx.full.min.js','vendor/jspdf.umd.min.js','vendor/jspdf.plugin.autotable.min.js','vendor/jszip.min.js'];

for(const file of required)if(!fs.existsSync(path.join(root,file)))fail(`Pflichtdatei fehlt: ${file}`);

for(const file of ['app.js','smart-camera.js','sw.js'])new vm.Script(read(file),{filename:file});
execFileSync(process.execPath,['--check',path.join(root,'serve.mjs')],{stdio:'pipe'});

const html=read('index.html');
const app=read('app.js');
const smart=read('smart-camera.js');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
const duplicates=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
if(duplicates.length)fail(`Doppelte HTML-IDs: ${duplicates.join(', ')}`);

const idSet=new Set(ids);
const closeButtons=[...html.matchAll(/<button\b[^>]*class="close-btn"[^>]*>/g)].map(match=>match[0]);
if(!closeButtons.length||closeButtons.some(button=>! /\btype="button"/.test(button)))fail('Dialog-Schließen darf niemals ein Formular absenden.');
if(!app.includes("$$('.close-btn').forEach"))fail('Sicherer Dialog-Schließen-Handler fehlt.');
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
for(const feature of ['transactionPriceType','transactionPriceHelp','labelPriceType','labelPriceTypeWrap'])if(!idSet.has(feature))fail(`Verbundene Preisfunktion fehlt: ${feature}`);
for(const field of ['onlinePrice','marketPrice','wholesalePrice','specialPriceName','specialPrice'])if(!html.includes(`name="${field}"`))fail(`Verkaufspreisfeld fehlt: ${field}`);
for(const logic of ['function priceForItem','function updateTransactionPrice','priceType:f.elements.labelPriceType.value','const labelPrice=priceForItem'])if(!app.includes(logic))fail(`Preisautomatik fehlt: ${logic}`);
for(const column of ['VK Standard','VK Online','VK Markt','VK B2B','Sonderpreis Name'])if(!app.includes(column))fail(`Preisexportspalte fehlt: ${column}`);
for(const feature of ['manageLocations','locationDialog','locationOptions','locationList','locationLabelPreset','exportLocationLabelsSvg','exportLocationLabelsPdf','printLocationLabels'])if(!idSet.has(feature))fail(`Lagerorganisations-Funktion fehlt: ${feature}`);
for(const field of ['showLocation','showBrand','showMaterial'])if(!html.includes(`name="${field}"`))fail(`Etiketten-Zusatzfeld fehlt: ${field}`);
for(const logic of ['function ensureLocation','function buildLocationLabelSvg','selectedLocationsForLabels','scannedLocation','Lagerplätze'])if(!app.includes(logic))fail(`Lagerplatz-Automatik fehlt: ${logic}`);
if(!app.includes("XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(locations),'Lagerplätze')"))fail('Lagerplätze fehlen im Excel-Export.');
if(!html.includes('id="manualBarcode" inputmode="text"'))fail('Der Scanner muss alphanumerische Lagercodes manuell annehmen.');
for(const feature of ['smartCameraInput','smartGalleryInput','smartCameraDialog','smartCameraPreview','smartCameraResults','trainItemVisual','trainLocationVisual'])if(!idSet.has(feature))fail(`Smart-Kamera-Funktion fehlt: ${feature}`);
for(const logic of ['function createVisualFingerprint','function visualSimilarity','function bestVisualCandidates','function findKnownCode','function analyzeSmartPhoto','Keine automatische Buchung'])if(!smart.includes(logic)&&!html.includes(logic))fail(`Lokale Bilderkennung fehlt: ${logic}`);
if(!smart.includes("confirm(`Foto-Treffer"))fail('Foto-Treffer dürfen nicht ohne Bestätigung buchen.');
if(!app.includes('visualSamples:pendingItemVisualSamples.slice(-6)'))fail('Artikeltraining wird nicht lokal gespeichert.');
if(!app.includes('visualSamples=pendingLocationVisualSamples.slice(-4)'))fail('Lagerplatztraining wird nicht lokal gespeichert.');

const smartElementStub=()=>({addEventListener(){},classList:{add(){},remove(){},toggle(){}},style:{},dataset:{}});
const smartContext={console,window:{},setTimeout,clearTimeout,Blob:class{},URL:{},Image:class{},document:{},state:{items:[],locations:[]},$:smartElementStub,$$:()=>[],toast(){},confirm:()=>false};
vm.runInNewContext(`${smart}\nglobalThis.__visualSimilarity=visualSimilarity;`,smartContext,{filename:'smart-camera-runtime-test.js'});
const visualSample=(bit,tone,color,histIndex)=>({version:1,hash:bit.repeat(64),tones:Array(64).fill(tone),colors:Array(48).fill(color),hist:Array.from({length:20},(_,index)=>index===histIndex?1:0)});
const shirtSample=visualSample('0',10,8,2),sameShirt=visualSample('0',10,8,2),differentShelf=visualSample('1',55,28,15);
if(smartContext.__visualSimilarity(shirtSample,sameShirt)<.99)fail('Gleiches angelerntes Motiv wird nicht sicher wiedererkannt.');
if(smartContext.__visualSimilarity(shirtSample,differentShelf)>=.72)fail('Deutlich anderes Motiv würde fälschlich als Foto-Treffer erscheinen.');

const sw=read('sw.js');
for(const asset of required.filter(file=>!['serve.mjs','sw.js'].includes(file))){
  const expected=`./${asset}`;
  if(!sw.includes(`'${expected}'`)&&!['icon.svg'].includes(asset))fail(`Offline-Datei fehlt im Service Worker: ${expected}`);
}

const manifest=JSON.parse(read('manifest.webmanifest'));
if(manifest.display!=='standalone'||!manifest.start_url)fail('Manifest ist nicht als installierbare Web-App konfiguriert.');

const sourceFiles=['index.html','app.js','smart-camera.js','app.css','sw.js','manifest.webmanifest','serve.mjs'];
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
