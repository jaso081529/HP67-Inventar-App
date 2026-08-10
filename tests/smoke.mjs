import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const fail=message=>{throw new Error(message);};
const required=['index.html','update.html','app.css','app.js','smart-camera.js','sw.js','manifest.webmanifest','icon.svg','serve.mjs','vendor/html5-qrcode.min.js','vendor/jsbarcode.min.js','vendor/xlsx.full.min.js','vendor/jspdf.umd.min.js','vendor/jspdf.plugin.autotable.min.js','vendor/jszip.min.js'];

for(const file of required)if(!fs.existsSync(path.join(root,file)))fail(`Pflichtdatei fehlt: ${file}`);

for(const file of ['app.js','smart-camera.js','sw.js'])new vm.Script(read(file),{filename:file});
execFileSync(process.execPath,['--check',path.join(root,'serve.mjs')],{stdio:'pipe'});

const html=read('index.html');
const app=read('app.js');
const smart=read('smart-camera.js');
const css=read('app.css');
const extractBetween=(source,start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);if(from<0||to<0)fail(`Testbarer Quellabschnitt fehlt: ${start}`);return source.slice(from,to);};
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
if(!smart.includes("needsConfirmation=candidate.source!=='barcode'")||!smart.includes('needsConfirmation&&!confirm('))fail('Foto-/OCR-Treffer dürfen nicht ohne Bestätigung buchen.');
if(!app.includes('visualSamples:pendingItemVisualSamples.slice(-6)'))fail('Artikeltraining wird nicht lokal gespeichert.');
if(!app.includes('visualSamples=pendingLocationVisualSamples.slice(-4)'))fail('Lagerplatztraining wird nicht lokal gespeichert.');
if(!idSet.has('updateApp')||!app.includes("register('./sw.js?v=34',{updateViaCache:'none'})")||!app.includes("name.startsWith('hp67-inventar-')"))fail('Zuverlässige PWA-Update-Funktion fehlt.');
if(!css.includes('[hidden]{display:none!important}'))fail('Versteckte Schaltflächen können durch Komponenten-CSS sichtbar werden.');
if(!css.includes('.item-save-bar{position:sticky'))fail('Artikelspeichern ist in langen iPhone-Formularen nicht dauerhaft erreichbar.');

const stateHelpers=extractBetween(app,'function safeText','function loadState');
const stateContext={console,Date,Set,Map,Number,String,variantValues:value=>[...new Set(String(value||'').split(/[,;\n]+/).map(entry=>entry.trim()).filter(Boolean))]};
vm.runInNewContext(`${stateHelpers}\nglobalThis.__validBackupData=validBackupData;globalThis.__normalizeItemRecord=normalizeItemRecord;`,stateContext,{filename:'state-validation-test.js'});
if(stateContext.__validBackupData({items:[{}],transactions:[]}))fail('Kaputte JSON-Artikel würden weiterhin als Sicherung akzeptiert.');
if(!stateContext.__validBackupData({items:[{id:'1',name:'Hoodie',stock:'5',cost:'8.5'}],transactions:[]}))fail('Gültige ältere Sicherung wird abgelehnt.');
if(stateContext.__normalizeItemRecord({name:'Hoodie',stock:'5',cost:'8.5'}).stock!==5)fail('Zahlenstrings aus Sicherungen werden nicht normalisiert.');
if(stateContext.__validBackupData({items:[{id:'1',name:'A'},{id:'1',name:'B'}],transactions:[]}))fail('Doppelte Artikel-IDs werden beim JSON-Import nicht erkannt.');

const importSource=extractBetween(app,'function normalizeImportRows','function parseInventoryXml');
const importContext={variantValues:value=>String(value||'').split(',').map(entry=>entry.trim()).filter(Boolean),parseNumber:value=>Number(String(value).replace(',','.'))||0};
vm.runInNewContext(`${importSource}\nglobalThis.__normalizeImportRows=normalizeImportRows;`,importContext,{filename:'roundtrip-import-test.js'});
const roundtrip=importContext.__normalizeImportRows([['Artikel','Farbe','Größe','VK Standard','VK Online','VK Markt','VK B2B','Sonderpreis Name','Sonderpreis'],['Hoodie','Schwarz','M','19,90','21,90','18,00','14,00','Verein','16,50']])[0];
if(roundtrip.salePrice!==19.9||roundtrip.onlinePrice!==21.9||roundtrip.marketPrice!==18||roundtrip.wholesalePrice!==14||roundtrip.specialPriceName!=='Verein'||roundtrip.specialPrice!==16.5)fail('Preisfelder überstehen CSV-/Excel-Roundtrip nicht.');

const matchSource=extractBetween(app,'function importItemData','function validateImportRows');
const matchContext={state:{items:[{id:'s',name:'Hoodie Basic',color:'Schwarz',size:'S',sku:'HD-S',barcode:'12345670'},{id:'m',name:'Hoodie Basic',color:'Schwarz',size:'M',sku:'HD-M',barcode:'4006381333931'}]},safeText:value=>String(value||'').trim(),normalizedText:value=>String(value||'').toLowerCase()};
vm.runInNewContext(`${matchSource}\nglobalThis.__findImportMatch=findImportMatch;globalThis.__assertUniqueInventoryCodes=assertUniqueInventoryCodes;`,matchContext,{filename:'variant-match-test.js'});
if(matchContext.__findImportMatch({name:'Hoodie Basic',color:'Schwarz',size:'M'})?.id!=='m')fail('Import ordnet gleichnamige Größenvarianten nicht eindeutig zu.');
let importConflict=false;try{matchContext.__findImportMatch({name:'Hoodie Basic',sku:'HD-S',barcode:'4006381333931'});}catch{importConflict=true;}
if(!importConflict)fail('Import akzeptiert eine SKU-/Barcode-Kollision zwischen zwei Artikeln.');
let duplicateCode=false;try{matchContext.__assertUniqueInventoryCodes([...matchContext.state.items,{id:'x',name:'Duplikat',sku:'HD-S'}]);}catch{duplicateCode=true;}
if(!duplicateCode)fail('Globale SKU-/Barcode-Eindeutigkeit wird vor dem Speichern nicht geprüft.');

const eanSource=extractBetween(app,'function eanCheckDigit','function createInternalEan');
const eanContext={};vm.runInNewContext(`${eanSource}\nglobalThis.__validEan=validEan;`,eanContext,{filename:'ean-test.js'});
if(!eanContext.__validEan('12345670')||!eanContext.__validEan('4006381333931')||eanContext.__validEan('12345671'))fail('EAN-8-/EAN-13-Prüfziffer ist fehlerhaft.');

const codeSource=extractBetween(smart,'function compactCode','function suggestionFromText');
const codeContext={state:{items:[{id:'1',sku:'TS-01',barcode:'4006381333931'}],locations:[]},normalizedText:value=>String(value||'').toLowerCase(),validEan:eanContext.__validEan};
vm.runInNewContext(`${codeSource}\nglobalThis.__findKnownCode=findKnownCode;`,codeContext,{filename:'ocr-code-test.js'});
if(codeContext.__findKnownCode('Artikelnummer und Beschreibung'))fail('Zufälliger OCR-Text wird als kurzer eindeutiger Code akzeptiert.');
if(codeContext.__findKnownCode('Etikett TS-01 Schwarz')?.entity?.id!=='1')fail('Tokenbegrenzter SKU-Treffer funktioniert nicht.');

const smartElementStub=()=>({addEventListener(){},classList:{add(){},remove(){},toggle(){}},style:{},dataset:{}});
const smartContext={console,window:{},setTimeout,clearTimeout,Blob:class{},URL:{},Image:class{},document:{},state:{items:[],locations:[]},$:smartElementStub,$$:()=>[],toast(){},confirm:()=>false};
vm.runInNewContext(`${smart}\nglobalThis.__visualSimilarity=visualSimilarity;`,smartContext,{filename:'smart-camera-runtime-test.js'});
const visualSample=(bit,tone,color,histIndex)=>({version:1,hash:bit.repeat(64),tones:Array(64).fill(tone),colors:Array(48).fill(color),hist:Array.from({length:20},(_,index)=>index===histIndex?1:0)});
const shirtSample=visualSample('0',10,8,2),sameShirt=visualSample('0',10,8,2),differentShelf=visualSample('1',55,28,15);
if(smartContext.__visualSimilarity(shirtSample,sameShirt)<.99)fail('Gleiches angelerntes Motiv wird nicht sicher wiedererkannt.');
if(smartContext.__visualSimilarity(shirtSample,differentShelf)>=.72)fail('Deutlich anderes Motiv würde fälschlich als Foto-Treffer erscheinen.');

const sw=read('sw.js');
if(!sw.includes("CACHE_PREFIX='hp67-inventar-'")||!sw.includes('k.startsWith(CACHE_PREFIX)'))fail('Service Worker löscht Caches nicht app-spezifisch.');
if(!sw.includes("isShell?'./index.html':e.request"))fail('Fremde Navigationen können weiterhin den Offline-App-Shell überschreiben.');
if(!sw.includes("requestUrl.pathname.startsWith(`${scopeUrl.pathname}v34/`)"))fail('Versionsgebundene Kern-Dateien werden nicht network-first geladen.');
for(const releaseAsset of ['./v34/app.css','./v34/app.js','./v34/smart-camera.js'])if(!sw.includes(`'${releaseAsset}'`))fail(`Versionsgebundene Offline-Datei fehlt im Service Worker: ${releaseAsset}`);
if(!sw.includes("cached||caches.match(fallbackAsset)"))fail('Versionsgebundene Offline-Dateien haben keinen sicheren Fallback.');
for(const asset of required.filter(file=>!['serve.mjs','sw.js','update.html'].includes(file))){
  const expected=`./${asset}`;
  if(!sw.includes(`'${expected}'`)&&!['icon.svg'].includes(asset))fail(`Offline-Datei fehlt im Service Worker: ${expected}`);
}

const manifest=JSON.parse(read('manifest.webmanifest'));
if(manifest.display!=='standalone'||!manifest.start_url)fail('Manifest ist nicht als installierbare Web-App konfiguriert.');

const sourceFiles=['index.html','update.html','app.js','smart-camera.js','app.css','sw.js','manifest.webmanifest','serve.mjs'];
const secretPatterns=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  /gh[opusr]_[A-Za-z0-9_]{20,}/
];
for(const file of sourceFiles){
  const content=read(file);
  for(const pattern of secretPatterns)if(pattern.test(content))fail(`Mögliches Geheimnis in ${file} gefunden.`);
}

const updatePage=read('update.html');
if(!updatePage.includes("registration.unregister()")||!updatePage.includes("registration.scope===scope")||!updatePage.includes("name.startsWith('hp67-inventar-')")||updatePage.includes('localStorage'))fail('Sichere Rettungsseite für alte PWA-Caches fehlt oder verändert Inventardaten.');
const pagesWorkflow=read('.github/workflows/pages.yml');
for(const deployedFile of ['index.html','update.html','app.css','app.js','smart-camera.js','icon.svg','manifest.webmanifest','sw.js'])if(!pagesWorkflow.includes(deployedFile))fail(`GitHub-Pages-Paket enthält ${deployedFile} nicht.`);
for(const releaseAsset of ['v34/app.css','v34/app.js','v34/smart-camera.js'])if(!pagesWorkflow.includes(releaseAsset.split('/')[1])||!pagesWorkflow.includes('public/v34'))fail(`Versionsgebundene Pages-Datei fehlt: ${releaseAsset}`);
if(!pagesWorkflow.includes("sed -i 's|app.css?v=34|v34/app.css|g; s|app.js?v=34|v34/app.js|g; s|smart-camera.js?v=34|v34/smart-camera.js|g'"))fail('GitHub Pages verweist nicht garantiert auf frische v34-Kern-Dateien.');

console.log(`HP67 Smoke-Test bestanden: ${required.length} Dateien, ${ids.length} HTML-IDs, PWA-Manifest und Datenschutzprüfung.`);
