import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const fail=message=>{throw new Error(message);};
const required=['index.html','update.html','app.css','app.js','smart-camera.js','sw.js','manifest.webmanifest','icon.svg','serve.mjs','vendor/html5-qrcode.min.js','vendor/jsbarcode.min.js','vendor/xlsx.full.min.js','vendor/jspdf.umd.min.js','vendor/jspdf.plugin.autotable.min.js','vendor/jszip.min.js','vendor/tesseract/tesseract.min.js','vendor/tesseract/worker.min.js','vendor/tesseract/core/tesseract-core.wasm.js','vendor/tesseract/core/tesseract-core-simd.wasm.js','vendor/tesseract/core/tesseract-core-lstm.wasm.js','vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js','vendor/tesseract/lang/deu.traineddata.gz','vendor/tesseract/lang/eng.traineddata.gz'];

for(const file of required)if(!fs.existsSync(path.join(root,file)))fail(`Pflichtdatei fehlt: ${file}`);

for(const file of ['app.js','smart-camera.js','sw.js'])new vm.Script(read(file),{filename:file});
execFileSync(process.execPath,['--check',path.join(root,'serve.mjs')],{stdio:'pipe'});

const html=read('index.html');
const app=read('app.js');
const smart=read('smart-camera.js');
const css=read('app.css');
const sw=read('sw.js');
const extractBetween=(source,start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);if(from<0||to<0)fail(`Testbarer Quellabschnitt fehlt: ${start}`);return source.slice(from,to);};
const sourceSection=(source,start,end)=>{const section=extractBetween(source,start,end);return section.replace(/\s+/g,' ');};
const throws=fn=>{try{fn();return false;}catch{return true;}};
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
const duplicates=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
if(duplicates.length)fail(`Doppelte HTML-IDs: ${duplicates.join(', ')}`);

const idSet=new Set(ids);
const closeButtons=[...html.matchAll(/<button\b[^>]*class="close-btn"[^>]*>/g)].map(match=>match[0]);
if(!closeButtons.length||closeButtons.some(button=>! /\btype="button"/.test(button)))fail('Dialog-Schließen darf niemals ein Formular absenden.');
if(!app.includes("$$('.close-btn').forEach"))fail('Sicherer Dialog-Schließen-Handler fehlt.');
for(const logic of ["$$('dialog').forEach(dialog=>dialog.addEventListener('click'",'event.target===dialog','event.clientX<bounds.left','closeDialogSafely(dialog)'])if(!app.includes(logic))fail(`Schließen durch Tippen außerhalb des Dialogs fehlt: ${logic}`);
const referenced=[...app.matchAll(/\$\('#([^']+)'\)/g)].map(match=>match[1]);
const missing=[...new Set(referenced.filter(id=>!idSet.has(id)))];
if(missing.length)fail(`Von app.js referenzierte HTML-IDs fehlen: ${missing.join(', ')}`);

for(const feature of ['sizeRangeFrom','sizeRangeTo','applySizeRange','variantSizes'])if(!idSet.has(feature))fail(`Größenautomatik fehlt: ${feature}`);
for(const feature of ['productPreset','productNameOptions','categoryPreset','colorPreset','sizePreset','supplierPreset','supplierOptions','locationPreset','brandPreset','materialPreset','seasonPreset','seasonOptions','unitPreset','unitOptions','tagPreset','tagOptions','skuHelp'])if(!idSet.has(feature))fail(`Verknüpfte Artikelauswahl fehlt: ${feature}`);
for(const logic of ['const PRODUCT_CATALOG=','function buildProductSuggestions','state.items.map(item=>({name:item.name','function renderArticleEntryOptions','function applyProductSuggestion','function updateSkuReadiness','button.disabled=!ready','Bitte zuerst die passende Kategorie auswählen'])if(!app.includes(logic))fail(`Lokale Produktvorschläge oder SKU-Abhängigkeit fehlen: ${logic}`);
if(!/<input required name="category"/.test(html)||!/<button id="generateSku" type="button" disabled>/.test(html))fail('Kategorie und anfängliche SKU-Sperre sind nicht verbindlich umgesetzt.');
for(const feature of ['openBackupCenter','backupStatusSummary','backupDialog','backupStorageStatus','requestPersistentStorage','backupName','createLocalBackup','shareCurrentBackup','backupImportFile','backupCount','backupList'])if(!idSet.has(feature))fail(`Lokales Sicherungscenter fehlt: ${feature}`);
for(const logic of ["const BACKUP_DB_NAME='hp67-inventory-backups'","format:'HP67_INVENTORY_BACKUP'",'schemaVersion:BACKUP_SCHEMA_VERSION','function extractBackupData','function prepareBackupState','function createLocalBackupRecord','function createSafetyBackup','function scheduleDailyBackup','function shareBackupPackage','navigator.storage?.persist','navigator.storage?.estimate','data-backup-restore','data-backup-rename','data-backup-copy','data-backup-delete','Vor vollständigem Tabellenimport','Vor App-Update'])if(!app.includes(logic))fail(`Lokale Sicherung, Dateiformat oder Schutzstand fehlt: ${logic}`);
if(!app.includes("rows.length===1?'1 lokaler Sicherungsstand'"))fail('Die Sicherungsanzahl wird bei genau einem Stand nicht korrekt bezeichnet.');
if(!html.includes('.hp67-backup.json')||!html.includes('Auf meinem iPhone/iPad'))fail('iPhone-Dateien-Ablage oder HP67-Sicherungsformat wird nicht erklärt.');
const backupFormatSource=extractBetween(app,'function cloneBackupData','function prepareBackupState');
const backupFormatContext={structuredClone:value=>JSON.parse(JSON.stringify(value)),JSON,Date,BACKUP_SCHEMA_VERSION:1,APP_VERSION:'3.29',safeText:value=>String(value??'').trim()};
vm.runInNewContext(`${backupFormatSource}\nglobalThis.__makeBackupPackage=makeBackupPackage;globalThis.__extractBackupData=extractBackupData;`,backupFormatContext,{filename:'backup-format-test.js'});
const legacyBackup={items:[{id:'legacy-item'}],transactions:[],orders:[],locations:[],snapshots:[],settings:{}};
const wrappedBackup=backupFormatContext.__makeBackupPackage(legacyBackup,'iPhone Test','manual');
if(wrappedBackup.format!=='HP67_INVENTORY_BACKUP'||wrappedBackup.schemaVersion!==1||wrappedBackup.label!=='iPhone Test'||backupFormatContext.__extractBackupData(wrappedBackup).items[0]?.id!=='legacy-item')fail('Das neue HP67-iPhone-Sicherungsformat kann nicht verlustfrei gelesen werden.');
if(backupFormatContext.__extractBackupData(legacyBackup)!==legacyBackup)fail('Frühere direkte JSON-Sicherungen sind nicht mehr importierbar.');
if(!throws(()=>backupFormatContext.__extractBackupData({...wrappedBackup,schemaVersion:99})))fail('Unbekannte zukünftige Sicherungsformate werden nicht sicher abgewiesen.');
for(const feature of ['variantCopies','manageBarcodeGroups','barcodeGroupDialog','barcodeGroupItems','barcodeGroupSelectionStatus','generateGroupCode','testGroupBarcode','groupBarcodeFormat','groupLabelSize','groupLabelLayout','shareGroupNelko','downloadGroupPng','downloadGroupSvg','printGroupBarcode','labelGroupHelp','createGroupFromLabels'])if(!idSet.has(feature))fail(`Barcodegruppen-/Exemplar-Funktion fehlt: ${feature}`);
for(const feature of ['manageLabelLibrary','labelLibraryDialog','labelLibraryList','saveLabelsToLibrary','saveGroupToLibrary'])if(!idSet.has(feature))fail(`Lokale Etikettenbibliothek fehlt: ${feature}`);
for(const logic of ['function labelLibrary','function labelLibraryConfig','function applyLabelLibraryConfig','function storeLabelLibraryEntry','function renderLabelLibrary',"type:'group'","type:'items'",'state.settings.labelLibrary'])if(!app.includes(logic))fail(`Etikettenbibliothek ist nicht vollständig verbunden: ${logic}`);
for(const feature of ['barcodeLibraryCount','barcodeLibrarySelectAll','barcodeLibraryClear','barcodeLibraryOpenLabels','barcodeLibraryCreateGroup','barcodeLibraryList','barcodeGroupLibraryList'])if(!idSet.has(feature))fail(`Barcode-Bibliothek fehlt: ${feature}`);
for(const logic of ['function barcodeLibraryPreview','function selectedBarcodeLibraryItems','function updateBarcodeLibrarySelection','function renderBarcodeLibrary','function openBarcodeLibrarySelection','data-barcode-library-item','data-barcode-group-library-open','data-barcode-library-export'])if(!app.includes(logic)&&!html.includes(logic))fail(`Barcode-Bibliothek ist nicht vollständig verbunden: ${logic}`);
for(const feature of ['bulkAddItems','bulkItemDialog','bulkItemForm','bulkItemRows','addBulkItemRow','bulkItemCount','bulkOpenLabels','saveBulkItems'])if(!idSet.has(feature))fail(`Mehrfachartikel-Assistent fehlt: ${feature}`);
for(const logic of ['function bulkItemRowTemplate','function addBulkItemRow','function openBulkItemCreator','record.sku=createTextileSku(record)','record.barcode=createInternalEan()','state.items.push(record)','openLabelStudio(ids[0]'])if(!app.includes(logic))fail(`Mehrfachartikel werden nicht vollständig getrennt angelegt: ${logic}`);
for(const feature of ['exportLabelsPngZip','downloadGroupPdf','exportLabelsA4Pdf','printLabelsA4','restartBarcodeScanner'])if(!idSet.has(feature))fail(`Erweiterter Etikettenexport oder Scanner-Neustart fehlt: ${feature}`);
for(const quality of ['groupLabelConfig(600)','barcodeLabelConfig(600)','pdfCfg={...cfg,dpi:cfg.dpi}','ctx.imageSmoothingEnabled=false','-600dpi.png','-${cfg.dpi}dpi-'])if(!app.includes(quality))fail(`Hochauflösender, scharfkantiger Export fehlt: ${quality}`);
if(app.includes('pdfCfg={...cfg,dpi:Math.min(cfg.dpi,300)}'))fail('Die gewählte 600-DPI-Auflösung wird beim PDF-Export weiterhin unbemerkt auf 300 DPI reduziert.');
for(const feature of ['customBarcodeSize','customBarcodeWidth','customBarcodeHeight','barcodeOutputSize','customGroupLabelSize','customGroupLabelWidth','customGroupLabelHeight','groupOutputSize','labelOutputSize','customLocationLabelSize','customLocationLabelWidth','customLocationLabelHeight','locationOutputSize'])if(!idSet.has(feature))fail(`Frei einstellbare oder sichtbare Ausgabegröße fehlt: ${feature}`);
for(const logic of ['function barcodeLabelConfig','function buildItemBarcodeLabelSvg','function outputSizeText','function sizeFileToken','sizeFileToken(cfg)','preset:cfg.preset,width:cfg.width,height:cfg.height'])if(!app.includes(logic))fail(`Durchgängige Größensteuerung im Export fehlt: ${logic}`);
for(const logic of ['function updateLocationOutputSize','state.settings.locationLabelStyle','customLocationLabelWidth','customLocationLabelHeight'])if(!app.includes(logic))fail(`Lagerplatz-Aufklebergröße ist nicht vollständig verbunden: ${logic}`);
for(const logic of ['function derivedState()','derivedStateCache=null','incomingByItem','barcodeLibraryLimit = 60','active.slice(0,barcodeLibraryLimit)','transactionSearchTimer=setTimeout','inventorySearchTimer=setTimeout','matches.slice(0,250)','function scheduleLabelPreview()','requestAnimationFrame(updateBulkItemRows)','pixelsPerLabel*items.length>90_000_000'])if(!app.includes(logic))fail(`iPhone-Leistungsoptimierung fehlt: ${logic}`);
const renderAllSource=extractBetween(app,'function renderAll()','function uniqueEntryValues');
if(renderAllSource.includes('renderDashboard(); renderInventory(); renderTransactions()')||!renderAllSource.includes("currentPage==='dashboard'")||!renderAllSource.includes("currentPage==='inventory'")||!renderAllSource.includes("currentPage==='activity'"))fail('Speichern rendert weiterhin unnötig alle versteckten App-Seiten.');
if(!app.includes('const max=360')||!app.includes("canvas.toDataURL('image/jpeg',.64)"))fail('Artikelfotos werden für den iPhone-Speicher nicht ausreichend verkleinert.');
for(const logic of ['data-library-action="png"','data-library-action="pdf"','data-library-action="print"','data-library-action="svg"','function runLabelLibraryAction','function applyGroupLibraryConfig'])if(!app.includes(logic))fail(`Direktaktionen der Etikettenbibliothek fehlen: ${logic}`);
if(!app.includes("button.textContent='←'")||!app.includes("button.setAttribute('aria-label','Zurück')"))fail('Popup-Fenster erhalten keinen eindeutigen Zurück-Pfeil.');
for(const logic of ['function createGroupCode','function openBarcodeGroupManager','scannedBarcodeGroup','data-scan-group-item','for(let copy=0;copy<copies;copy++)'])if(!app.includes(logic))fail(`Barcodegruppen oder Einzelartikel-Staffelung fehlt: ${logic}`);
for(const logic of ['function updateBarcodeGroupSelectionStatus',"$('#createGroupFromLabels').onclick",'openBarcodeGroupManager(\'\',ids,suggestedName)','Bitte dieses Gruppenetikett zuerst speichern','`${group.itemIds.length} VARIANTEN`','function currentSavedGroupLabel','function buildGroupLabelSvg','group.barcodeFormat||cfg.barcodeFormat','svgToThermalPngBlob(buildGroupLabelSvg(group,cfg)'])if(!app.includes(logic))fail(`Sicherer Gruppenetikett-Ablauf fehlt: ${logic}`);
if(!html.includes('Mehrere einzelne Varianten-Etiketten')||!html.includes('Aus Auswahl Gruppenetikett erstellen'))fail('Einzel- und Gruppenetiketten sind in der Oberfläche nicht eindeutig getrennt.');
const scannerGroupSource=sourceSection(app,'async function handleScannedCode','function bookScanned');
for(const logic of ['data-group-sale','data-group-purchase','data-group-open',"openTransaction(button.dataset.groupSale,'sale')","openTransaction(button.dataset.groupPurchase,'purchase')",'openItem(button.dataset.groupOpen)'])if(!scannerGroupSource.includes(logic))fail(`Gruppenscan-Aktion fehlt: ${logic}`);
if(scannerGroupSource.indexOf('if(scannedBarcodeGroup)')<0||scannerGroupSource.indexOf('if(scannedBarcodeGroup)')>scannerGroupSource.indexOf('else if(scannedItem)'))fail('Ein Gruppenbarcode wird nicht vor einem eventuell gleichlautenden Artikelcode aufgelöst.');
if(scannerGroupSource.includes('handleScannedCode(scannedItem?.barcode'))fail('Die Gruppenliste kollabiert weiterhin rekursiv auf einen einzelnen Artikel.');
const groupLabelSource=extractBetween(app,'function groupLabelConfig',"$('#testGroupBarcode').onclick");
let renderedGroupCode='',renderedGroupFormat='';const groupLabelContext={$:selector=>({value:selector==='#groupLabelLayout'?'standard':'50x25',addEventListener(){}}),state:{settings:{},items:[]},persistState:()=>true,renderBarcodeGroupPreview(){},updateFontScaleLabels(){},fontPercentValue:()=>100,xmlEscape:value=>String(value),barcodeVector:(value,format)=>{renderedGroupCode=value;renderedGroupFormat=format;return{svg:`<g data-group-code="${value}" data-format="${format}"></g>`};}};
vm.runInNewContext(`${groupLabelSource}\nglobalThis.__buildGroupLabelSvg=buildGroupLabelSvg;`,groupLabelContext,{filename:'group-label-test.js'});
const renderedGroupSvg=groupLabelContext.__buildGroupLabelSvg({name:'Testgruppe',code:'2960799401472',barcodeFormat:'EAN13',itemIds:['rot-s','schwarz-s','weiss-s']},{width:50,height:25,dpi:300});
if(renderedGroupCode!=='2960799401472'||renderedGroupFormat!=='EAN13'||!renderedGroupSvg.includes('2960799401472')||!renderedGroupSvg.includes('3 VARIANTEN'))fail('Das exportierte Gruppenetikett verwendet nicht eindeutig den gespeicherten Gruppencode und dessen Barcode-Art.');
groupLabelContext.state.items=[{id:'rot-s',color:'Rot',size:'S'},{id:'schwarz-s',color:'Schwarz',size:'S'},{id:'weiss-s',color:'Weiß',size:'S'}];
const variantsGroupSvg=groupLabelContext.__buildGroupLabelSvg({name:'Testgruppe',code:'HP67-GRP-12345678',itemIds:['rot-s','schwarz-s','weiss-s']},{width:70,height:40,dpi:300,layout:'variants',nameFontScale:1,metaFontScale:1,barcodeFontScale:1});
if(!variantsGroupSvg.includes('GRUPPENÜBERSICHT')||!variantsGroupSvg.includes('Rot / S')||!variantsGroupSvg.includes('Schwarz / S'))fail('Die Gruppenetikett-Übersicht zeigt ausgewählte Varianten nicht an.');
for(const layout of ['standard','scan','name','variants'])if(!html.includes(`<option value="${layout}">`))fail(`Gruppenetikett-Art fehlt: ${layout}`);
for(const format of ['EAN13','CODE39','CODE128'])if(!html.includes(`<option value="${format}"`))fail(`Gruppenbarcode-Art fehlt: ${format}`);
for(const logic of ["facingMode:'environment'","fps:15",'scanBox=(viewWidth,viewHeight)','aspectRatio:1.7778','Html5Qrcode.getCameras','preferred.id',"$('#manualBarcode').value=visible","$('#restartBarcodeScanner').onclick"] )if(!app.includes(logic))fail(`Robuste Scanner-Rückmeldung oder iPhone-Kamerafallback fehlt: ${logic}`);
for(const logic of ['function a4LabelLayout','function exportLabelsA4Pdf','function openLabelsPrintView','A4-Sammel-PDF','function printViewToolbar','Zurück zur App','returnToHp67App'])if(!app.includes(logic)&&!html.includes(logic))fail(`A4-Sammeldruck oder Rückweg zur App fehlt: ${logic}`);
const a4LayoutSource=extractBetween(app,'function a4LabelLayout','async function exportLabelsA4Pdf');
const a4LayoutContext={Math,Error};vm.runInNewContext(`${a4LayoutSource}\nglobalThis.__a4=a4LabelLayout;`,a4LayoutContext,{filename:'a4-label-layout-test.js'});
const a4Grid=a4LayoutContext.__a4({width:50,height:25});
if(a4Grid.columns!==4||a4Grid.rows!==11||a4Grid.perPage!==44)fail('50 × 25 mm Etiketten werden nicht korrekt auf einer A4-Seite gesammelt.');
if(!throws(()=>a4LayoutContext.__a4({width:211,height:25})))fail('Ein zu breites Etikett wird für A4 nicht sauber abgewiesen.');
for(const feature of ['nameFontScaleValue','metaFontScaleValue','barcodeFontScaleValue','groupNameScaleValue','groupMetaScaleValue','groupBarcodeScaleValue'])if(!idSet.has(feature))fail(`Frei einstellbare Etikettenschrift fehlt: ${feature}`);
for(const logic of ['function fontPercentValue','function updateFontScaleLabels','nameFontScale:fontPercentValue','metaFontScale:fontPercentValue','barcodeFontScale:fontPercentValue','13*(Number(fontScale)||1)'])if(!app.includes(logic))fail(`Schriftgrößensteuerung ist nicht vollständig verbunden: ${logic}`);
for(const logic of ['function textileSkuFamily','function createTextileSkuAtSequence','let colorSequence=Math.max(0,...existingSequence)+1','colorSequence=(Number(variant.sku.match'])if(!app.includes(logic))fail(`Fortlaufende SKU-Nummerierung je Farbe fehlt: ${logic}`);
if(!app.includes("const SIZE_SCALE=['XXS','XS','S','M','L','XL','XXL','3XL','4XL','5XL']"))fail('Größenfolge XXS bis 5XL fehlt.');
if(!app.includes('SIZE_SCALE.slice(start,end+1)'))fail('Automatische Größenbereich-Auswahl fehlt.');
if(!app.includes("{code:'TS',label:'T-Shirts',match:/\\b(t[ -]?shirt|tee|shirt)\\b/i}"))fail('Shirts werden nicht als T-Shirts erkannt.');
for(const feature of ['exportReorderPdf','printReorder','exportLabelsPdf','exportLabelsA4Pdf','printLabelsA4'])if(!idSet.has(feature))fail(`PDF-/Druckfunktion fehlt: ${feature}`);
for(const handler of ["$('#exportReorderPdf').onclick","$('#printReorder').onclick","$('#exportLabelsPdf').onclick"])if(!app.includes(handler))fail(`PDF-Klickfunktion fehlt: ${handler}`);
for(const column of ['Artikelbezeichnung','Farbe / Größe','Bestellen','Summe'])if(!app.includes(column))fail(`Genaue Nachbestellspalte fehlt: ${column}`);
for(const feature of ['transactionPriceType','transactionPriceHelp','labelPriceType','labelPriceTypeWrap'])if(!idSet.has(feature))fail(`Verbundene Preisfunktion fehlt: ${feature}`);
for(const feature of ['transactionItemSearch','transactionVariantChoices','transactionItemSummary','transactionStockPreview','transactionAllStock'])if(!idSet.has(feature))fail(`Eindeutige Buchungs-/Variantenhilfe fehlt: ${feature}`);
for(const logic of ['function transactionItemSearchText','function renderTransactionItemDetails','function updateTransactionStockPreview','data-transaction-variant','itemColor:item.color','Bestand_vorher'])if(!app.includes(logic))fail(`Buchungsdetails oder Bestandsvorschau fehlen: ${logic}`);
if(!idSet.has('shareNelkoLabel'))fail('Direkte Nelko-/iPhone-Übergabe fehlt.');
for(const preset of ['40x15','50x25','50x30','70x40'])if(!html.includes(`<option value="${preset}">Nelko`))fail(`Nelko-Etikettenformat fehlt: ${preset}`);
for(const logic of ["thermalCfg={...cfg,dpi:203,background:'#ffffff',textColor:'#000000'}",'svgToThermalPngBlob(svg,thermalCfg.width,thermalCfg.height,203)','navigator.share(shareData)','Picture/Bild'])if(!app.includes(logic)&&!html.includes(logic))fail(`Nelko-Übergabe ist unvollständig: ${logic}`);
for(const feature of ['customPriceRows','addCustomPrice','priceVariantStats'])if(!idSet.has(feature))fail(`Freie Preisvarianten-Funktion fehlt: ${feature}`);
if(!idSet.has('restoreDefaultCategories'))fail('Wiederherstellung fehlender Standardkategorien fehlt.');
for(const category of ['Tank Tops','Longsleeves','Zipper & Hoodiejacken','Blusen','Westen','Softshell','Arbeitskleidung','Sportbekleidung','Kindertextilien','Babytextilien','Schürzen','Taschen & Beutel','Handtücher','Sonstige Textilien'])if(!app.includes(`'${category}'`))fail(`Aktualisierte Textilkategorie fehlt: ${category}`);
for(const logic of ['CATEGORY_CATALOG_VERSION=2','function mergeDefaultCategories','settings.categoryCatalogVersion=CATEGORY_CATALOG_VERSION'])if(!app.includes(logic))fail(`Sichere Kategorienaktualisierung fehlt: ${logic}`);
for(const field of ['onlinePrice','marketPrice','wholesalePrice','specialPriceName','specialPrice'])if(!html.includes(`name="${field}"`))fail(`Verkaufspreisfeld fehlt: ${field}`);
for(const logic of ['function priceForItem','function updateTransactionPrice','priceType:f.elements.labelPriceType.value','const labelPrice=priceForItem'])if(!app.includes(logic))fail(`Preisautomatik fehlt: ${logic}`);
for(const logic of ['function customPriceDraft','function addCustomPriceRow','function priceTypeLabel','Verkäufe nach Preisvariante','priceLabel'])if(!app.includes(logic))fail(`Freie Preisvarianten oder deren Statistik fehlen: ${logic}`);
if(!app.includes("$('#scanSale').onclick=()=>")||!app.includes("openTransaction(itemId,'sale')")||!smart.includes("closeSmartDialog(()=>openTransaction(item.id,'sale'))"))fail('Scanner-Verkäufe öffnen nicht zuverlässig die Preisvarianten-Auswahl.');
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
if(!idSet.has('updateApp')||!app.includes("register('./sw.js?v=329',{updateViaCache:'none'})")||!app.includes("name.startsWith('hp67-inventar-')")||!app.includes('registration.unregister()')||!app.includes("cache:'no-store'")||!sw.includes("searchParams.has('hp67-update')")||!sw.includes('e.respondWith(fetch(e.request))'))fail('Zuverlässige PWA-Update-/Neuinstallationsfunktion fehlt.');
if(!css.includes('[hidden]{display:none!important}'))fail('Versteckte Schaltflächen können durch Komponenten-CSS sichtbar werden.');
if(!css.includes('.item-save-bar{position:sticky'))fail('Artikelspeichern ist in langen iPhone-Formularen nicht dauerhaft erreichbar.');
if(!app.includes("typeof root==='string'?document.querySelector(root):root"))fail('Dialoglisten mit einer Container-ID können nicht sicher gelesen werden.');
for(const feature of ['inventoryContext','inventoryContextClear','activityContext','activityContextOpen','activityContextClear','itemActionHub','itemActionPurchase','itemActionSale','itemActionHistory','itemActionLabel','itemActionReorder','itemActionLocation','orderOpenItem','orderHistory','labelOpenItem'])if(!idSet.has(feature))fail(`Bereichsübergreifende Navigation fehlt: ${feature}`);
for(const logic of ['function filteredInventoryItems','function openInventoryLocation','function openActivityForItem','function openActivityForOrder','function openActivityForMonth','function navigationState','history[method](navigationState()','lastRenderedActivity[0]','ensureBarcodesPersisted(targets)','function serializeItemDraft','Ungespeicherte Änderungen verwerfen','function serializeReceiveDraft','Geänderte Eingangsmengen verwerfen'])if(!app.includes(logic))fail(`Verbundener Arbeitsablauf fehlt: ${logic}`);
if(!/requestDialogClose\(\s*\$\(\s*['"]#reorderDialog['"]\s*\)\s*,\s*openOrdersList/.test(app))fail('Bestellung → Bestellliste verliert beim Dialogwechsel den History-Kontext.');
if(app.includes('if(!ensureBarcodesPersisted(active))return'))fail('Das Öffnen eines Einzeletiketts erzeugt weiterhin Barcodes für das gesamte Inventar.');
if(!app.includes('item.minStock*2-item.stock-pendingIncomingQuantity(item.id)')||app.includes('Math.max(1,suggested)'))fail('Offene Bestellmengen werden beim Nachbestellvorschlag nicht sicher abgezogen.');
if(!app.includes('Es wurde nichts verändert.'))fail('Wareneingänge werden nicht vor jeder Bestandsänderung vollständig validiert.');
if(!app.includes("item?.archived?' · Archiv'")||!app.includes('entry.item?.archived')||!app.includes('!entry.item.archived&&entry.qty>0'))fail('Wareneingänge können weiterhin unsichtbar auf archivierte Artikel gebucht werden.');
for(const lineLogic of ['data-receive="${esc(line.id)}"','order.lines.find(l=>l.id===row.dataset.receive)','orderLineId:line.id','entry.id===tx.orderLineId'])if(!app.includes(lineLogic))fail(`Bestellzeilen sind nicht eindeutig verknüpft: ${lineLogic}`);
if(!smart.includes('openInventoryLocation(location.id)')||smart.includes("$('#search').value=location.name"))fail('Smart-Kamera öffnet Lagerplätze nicht mit einem exakten Lagerplatzfilter.');

const itemOpenSource=sourceSection(app,'function openItem','function openTransaction');
if(!/setCustomValidity\(\s*['"]['"]\s*\)/.test(itemOpenSource)||!/saveButton\.disabled\s*=\s*false/.test(itemOpenSource))fail('Ein zuvor ungültiger Artikelname oder gesperrter Speichern-Button wird beim erneuten Öffnen nicht zurückgesetzt.');
const itemSubmitSource=extractBetween(app,"$('#itemForm').addEventListener('submit'",'function bulkPresetOptions');
let capturedItemSubmit=null;
const whitespaceNameInput={value:'   ',validationMessage:'',reported:0,focused:0,setCustomValidity(message){this.validationMessage=message;},reportValidity(){this.reported++;},focus(){this.focused++;}};
const whitespaceSubmitButton={disabled:false};
const whitespaceForm={elements:{name:whitespaceNameInput},querySelector:()=>whitespaceSubmitButton};
const whitespaceContext={itemMediaPending:0,$:()=>({addEventListener:(type,handler)=>{if(type==='submit')capturedItemSubmit=handler;}})};
vm.runInNewContext(itemSubmitSource,whitespaceContext,{filename:'whitespace-item-name-test.js'});
capturedItemSubmit?.({preventDefault(){},currentTarget:whitespaceForm});
if(!capturedItemSubmit||!whitespaceNameInput.validationMessage||whitespaceNameInput.reported!==1||whitespaceNameInput.focused!==1||whitespaceSubmitButton.disabled)fail('Ein Artikelname nur aus Leerzeichen wird nicht sauber abgewiesen oder blockiert den nächsten Versuch.');

const modalFunctions=extractBetween(app,'function dialogHasUnsavedWork',"$$('.close-btn')");
const modalHistory={state:null,pushes:[],backs:0,pushState(value){this.state=value;this.pushes.push(value);},back(){this.backs++;}};
const modalContext={history:modalHistory,navigationState:()=>({hp67Nav:true,page:'inventory'}),requestAnimationFrame:callback=>callback(),confirm:()=>true,serializeItemDraft:()=>'',serializeReceiveDraft:()=>''};
vm.runInNewContext(`let itemFormBaseline='',receiveFormBaseline='',pendingModalClose=null,suppressDialogCancelGuard=false;\n${modalFunctions}\nglobalThis.__modal={openDialog,requestDialogClose,dialogHasUnsavedWork,pending:()=>pendingModalClose};`,modalContext,{filename:'modal-history-test.js'});
const modalDialog={id:'transactionDialog',open:false,dataset:{},shown:0,closed:0,showModal(){this.open=true;this.shown++;},close(){this.open=false;this.closed++;}};
modalContext.__modal.openDialog(modalDialog);
if(modalDialog.shown!==1||modalHistory.state?.hp67Modal!=='transactionDialog')fail('openDialog legt keinen eindeutigen modalen History-Eintrag an.');
modalDialog.dataset.dirty='true';modalContext.confirm=()=>false;
if(modalContext.__modal.requestDialogClose(modalDialog)!==false||modalHistory.backs!==0||!modalDialog.open)fail('Ein Dirty-Dialog wird trotz verworfenem Bestätigungsdialog geschlossen.');
modalContext.confirm=()=>true;delete modalDialog.dataset.dirty;
if(!modalContext.__modal.requestDialogClose(modalDialog)||modalHistory.backs!==1||modalContext.__modal.pending()?.id!=='transactionDialog'||!modalDialog.open)fail('requestDialogClose synchronisiert einen modalen History-Eintrag nicht über history.back().');
modalContext.history.state={hp67Modal:'andererDialog'};const directDialog={...modalDialog,id:'directDialog',open:true,dataset:{},closed:0};let afterDirect=0;
modalContext.__modal.requestDialogClose(directDialog,()=>afterDirect++);
if(directDialog.open||directDialog.closed!==1||afterDirect!==1)fail('Ein Dialog ohne eigenen History-Eintrag wird nicht direkt samt Folgeaktion geschlossen.');
if(!/const\s+DIRTY_DIALOG_IDS\s*=\s*new Set\s*\(\s*\[[^\]]*['"]transactionDialog['"]/.test(app))fail('Der Buchungsdialog ist nicht in die Dirty-Dialog-Überwachung eingebunden.');
const transactionFlowSource=sourceSection(app,'function openTransaction','function itemDialogRecord')+' '+sourceSection(app,"$('#transactionForm').addEventListener('submit'","$$('[data-nav]')");
if(!/markDialogClean\(\s*\$\(\s*['"]#transactionDialog['"]\s*\)\s*\).*openDialog\(\s*\$\(\s*['"]#transactionDialog['"]/.test(transactionFlowSource)||!/markDialogClean\(\s*\$\(\s*['"]#transactionDialog['"]\s*\)\s*\).*requestDialogClose\(\s*\$\(\s*['"]#transactionDialog['"]/.test(transactionFlowSource))fail('Der Buchungsdialog wird beim Öffnen/Speichern nicht konsistent als sauber markiert.');

const popstateSource=extractBetween(app,"window.addEventListener('popstate'",'function openItem');
let popstateHandler=null,popDialog={id:'transactionDialog',open:true,dataset:{dirty:'true'}},popCloseCount=0,popRestoreState=null,popAfter=0,popConfirmCount=0;
const popHistory={pushes:0,pushState(){this.pushes++;}};
const popContext={window:{addEventListener:(type,handler)=>{if(type==='popstate')popstateHandler=handler;}},topOpenDialog:()=>popDialog,dialogHasUnsavedWork:dialog=>dialog.dataset.dirty==='true',dialogDiscardMessage:()=>'',confirm:()=>{popConfirmCount++;return false;},history:popHistory,navigationState:()=>({hp67Nav:true}),closeDialogDirect:()=>{popCloseCount++;},requestAnimationFrame:callback=>callback(),restoreNavigationSnapshot:state=>{popRestoreState=state;}};
vm.runInNewContext(`let pendingModalClose=null;\n${popstateSource}\nglobalThis.__setPending=value=>pendingModalClose=value;`,popContext,{filename:'modal-popstate-test.js'});
popstateHandler?.({state:{page:'dashboard'}});
if(!popstateHandler||popHistory.pushes!==1||popCloseCount!==0||popConfirmCount!==1)fail('popstate schützt einen Dirty-Dialog nicht vor unbeabsichtigtem Schließen.');
popContext.__setPending({id:'transactionDialog',after:()=>popAfter++,approved:true});popContext.confirm=()=>{throw Error('Bestätigung darf nach genehmigtem Schließen nicht erneut erscheinen');};
popstateHandler({state:{page:'dashboard'}});
if(popCloseCount!==1||popAfter!==1)fail('Ein genehmigtes modales Zurück navigiert nicht genau einmal weiter.');
popDialog=null;const restored={hp67Nav:true,page:'activity'};popstateHandler({state:restored});
if(popRestoreState!==restored)fail('popstate stellt ohne offenen Dialog den Navigationskontext nicht wieder her.');

const pendingSource=extractBetween(app,'function derivedState()','function sortTransactionsNewest');
if(!pendingSource.includes('function pendingIncomingQuantity'))fail('Berechnung offener Bestellmengen fehlt.');
const pendingContext={derivedStateCache:null,state:{items:[],orders:[{status:'ordered',lines:[{itemId:'hoodie',quantity:5,received:2}]},{status:'partial',lines:[{itemId:'hoodie',quantity:6,received:2}]},{status:'cancelled',lines:[{itemId:'hoodie',quantity:99,received:0}]}]},Map,Math};
vm.runInNewContext(`${pendingSource}\nglobalThis.__pending=pendingIncomingQuantity;`,pendingContext,{filename:'pending-order-test.js'});
if(pendingContext.__pending('hoodie')!==7)fail('Offene und teilweise erhaltene Bestellmengen werden nicht korrekt summiert.');
if(Math.max(0,5*2-3-pendingContext.__pending('hoodie'))!==0)fail('Bereits bestellte Ware verhindert keine doppelte Nachbestellung.');
const selectorLine=app.split(/\r?\n/).find(line=>line.startsWith('const $$ ='));
const selectorRoot={querySelectorAll:selector=>selector==='[data-row]'?[{id:'row'}]:[]},selectorContext={document:{querySelector:selector=>selector==='#rows'?selectorRoot:null}};
vm.runInNewContext(`${selectorLine}\nglobalThis.__all=$$;`,selectorContext,{filename:'dialog-selector-test.js'});
if(selectorContext.__all('[data-row]','#rows')[0]?.id!=='row')fail('Container-ID wird in Dialoglisten nicht in ein DOM-Element aufgelöst.');

const stocktakeSubmitSource=extractBetween(app,"$('#stocktakeForm').addEventListener('submit'","$('#undoLatest').onclick");
let capturedStocktakeSubmit=null,stocktakeRows=[],stocktakeSaveCount=0,stocktakeAlertCount=0,stocktakeFocusCount=0;
const stocktakeContext={
  state:{items:[{id:'shirt',name:'Shirt',stock:5,cost:4}],transactions:[]},
  $:(selector,rootElement)=>rootElement?.input||(selector==='#stocktakeForm'?{addEventListener:(type,handler)=>{if(type==='submit')capturedStocktakeSubmit=handler;}}:{}),
  $$:()=>stocktakeRows,
  uid:()=>`tx-${stocktakeContext.state.transactions.length+1}`,
  save:()=>{stocktakeSaveCount++;},markDialogClean(){},requestDialogClose(){},toast(){},
  alert:()=>{stocktakeAlertCount++;},Date,Number
};
vm.runInNewContext(stocktakeSubmitSource,stocktakeContext,{filename:'stocktake-validation-test.js'});
const stocktakeEvent={preventDefault(){}};
stocktakeRows=[{dataset:{stocktake:'shirt'},input:{value:'',focus(){stocktakeFocusCount++;}}}];
capturedStocktakeSubmit?.(stocktakeEvent);
if(!capturedStocktakeSubmit||stocktakeContext.state.items[0].stock!==5||stocktakeContext.state.transactions.length!==0)fail('Ein leeres Inventurfeld verändert weiterhin den Bestand.');
const savesAfterBlank=stocktakeSaveCount;
stocktakeRows=[{dataset:{stocktake:'shirt'},input:{value:'2.5',focus(){stocktakeFocusCount++;}}}];
capturedStocktakeSubmit(stocktakeEvent);
if(stocktakeAlertCount!==1||stocktakeFocusCount!==1||stocktakeSaveCount!==savesAfterBlank||stocktakeContext.state.items[0].stock!==5)fail('Ungültige Inventurwerte werden nicht vor jeder Mutation vollständig abgewiesen.');
stocktakeRows=[{dataset:{stocktake:'shirt'},input:{value:'0',focus(){stocktakeFocusCount++;}}}];
capturedStocktakeSubmit(stocktakeEvent);
const stocktakeTx=stocktakeContext.state.transactions.at(-1);
if(stocktakeContext.state.items[0].stock!==0||stocktakeTx?.stockBefore!==5||stocktakeTx?.stockAfter!==0)fail('Der gültige Inventurwert 0 wird nicht als nachvollziehbare Bestandskorrektur gespeichert.');

const transactionSubmitSource=extractBetween(app,"$('#transactionForm').addEventListener('submit'","$$('[data-nav]')");
let capturedTransactionSubmit=null,transactionMarkedClean=0,transactionAlert='';
class TestFormData{constructor(form){this.values=form.values;}get(name){return this.values[name];}}
const freePriceContext={
  state:{items:[{id:'shirt',name:'Shirt',stock:2,cost:5,salePrice:20}],transactions:[]},
  $:selector=>selector==='#transactionForm'?{addEventListener:(type,handler)=>{if(type==='submit')capturedTransactionSubmit=handler;}}:{},
  FormData:TestFormData,priceForItem:()=>20,priceTypeLabel:()=> 'Sonderpreis',uid:()=> 'tx-free',persistState:()=>true,
  markDialogClean:()=>{transactionMarkedClean++;},renderAll(){},requestDialogClose(){},toast(){},
  alert:message=>{transactionAlert=String(message);},Date,Number,String,Math
};
vm.runInNewContext(transactionSubmitSource,freePriceContext,{filename:'free-price-test.js'});
capturedTransactionSubmit?.({preventDefault(){},currentTarget:{values:{itemId:'shirt',type:'sale',quantity:'1',priceType:'special',unitPrice:'0',note:'Gratis',date:''}}});
if(!capturedTransactionSubmit||transactionAlert||freePriceContext.state.items[0].stock!==1||freePriceContext.state.transactions[0]?.unitPrice!==0||transactionMarkedClean!==1)fail('Ein ausdrücklich eingetragener kostenloser Stückpreis 0 wird nicht unverändert gebucht.');
if(!transactionSubmitSource.includes('if(!item||item.archived)'))fail('Der Buchungsdialog prüft den Archivstatus nicht unmittelbar vor der Mutation.');
for(const check of [
  ['Buchungsmenge',sourceSection(app,"$('#transactionForm').addEventListener('submit'","$$('[data-nav]')"),/Number\.isInteger\(qty\)/],
  ['Bestellmenge',sourceSection(app,'function reorderData',"$('#reorderForm').addEventListener('submit'"),/Number\.isInteger\(entry\.quantity\)/],
  ['Wareneingangsmenge',sourceSection(app,"$('#receiveForm').addEventListener('submit'","$('#cancelOrder').onclick"),/Number\.isInteger\(entry\.qty\)/],
  ['Sprachmenge',sourceSection(app,"$('#voiceForm').addEventListener('submit'",'function parseNumber'),/Number\.isInteger\(row\.quantity\)/],
  ['Belegmenge',sourceSection(app,"$('#scanForm').addEventListener('submit'",'async function stopBarcodeScanner'),/Number\.isInteger\(row\.quantity\)/]
])if(!check[2].test(check[1]))fail(`${check[0]} wird vor der Bestandsänderung nicht als ganze Zahl geprüft.`);

const sortTransactionsLine=app.split(/\r?\n/).find(line=>/^function\s+sortTransactionsNewest\s*\(/.test(line));
if(!sortTransactionsLine)fail('Stabile Buchungsreihenfolge fehlt.');
const sameDate='2026-08-12T10:00:00.000Z',transactionOrderContext={state:{transactions:[{id:'first',date:sameDate},{id:'second',date:sameDate}]}};
vm.runInNewContext(`${sortTransactionsLine}\nglobalThis.__sort=sortTransactionsNewest;`,transactionOrderContext,{filename:'transaction-order-test.js'});
if(transactionOrderContext.__sort(transactionOrderContext.state.transactions)[0]?.id!=='second')fail('Bei gleicher Zeit gewinnt nicht die zuletzt mutierte Buchung.');
const undoSource=extractBetween(app,"$('#undoLatest').onclick",'function inventoryItemDescriptor');
let capturedUndo=null,undoAlerts=0,undoSaves=0;
const undoContext={
  $:()=>({set onclick(handler){capturedUndo=handler;}}),state:{items:[],transactions:[],orders:[]},lastRenderedActivity:[],
  alert:()=>{undoAlerts++;},confirm:()=>true,fmtDate:value=>value,loadState:()=>undoContext.state,renderAll(){},save:()=>{undoSaves++;},toast(){},Date,Number,Math
};
vm.runInNewContext(undoSource,undoContext,{filename:'undo-guard-test.js'});
const guardedTx={id:'guarded',itemId:'shirt',itemName:'Shirt',type:'sale',quantity:1,stockBefore:7,stockAfter:6,date:sameDate};
undoContext.state={items:[{id:'shirt',stock:7,cost:5}],transactions:[guardedTx],orders:[]};undoContext.lastRenderedActivity=[guardedTx];
capturedUndo?.();
if(!capturedUndo||undoAlerts!==1||undoSaves!==0||undoContext.state.items[0].stock!==7||undoContext.state.transactions.length!==1)fail('Undo ignoriert einen vom protokollierten stockAfter abweichenden aktuellen Bestand.');
const olderTx={id:'older',itemId:'shirt',itemName:'Shirt',type:'purchase',quantity:1,stockBefore:5,stockAfter:6,date:sameDate},laterTx={id:'later',itemId:'shirt',itemName:'Shirt',type:'purchase',quantity:1,stockBefore:6,stockAfter:7,date:sameDate};
undoContext.state={items:[{id:'shirt',stock:6,cost:5}],transactions:[olderTx,laterTx],orders:[]};undoContext.lastRenderedActivity=[olderTx];
capturedUndo();
if(undoAlerts!==2||undoSaves!==0||undoContext.state.transactions.length!==2)fail('Undo übersieht eine später mutierte Buchung desselben Artikels.');

const stateHelpers=extractBetween(app,'function safeText','function loadState');
const stateContext={console,Date,Set,Map,Number,String,GROUP_BARCODE_FORMATS:new Set(['EAN13','CODE39','CODE128']),variantValues:value=>[...new Set(String(value||'').split(/[,;\n]+/).map(entry=>entry.trim()).filter(Boolean))],normalizedGroupBarcodeFormat:(value,fallback='EAN13')=>['EAN13','CODE39','CODE128'].includes(value)?value:fallback,validGroupCodeForFormat:(code,format)=>{code=String(code||'').trim();if(format==='EAN13'){if(!/^\d{13}$/.test(code))return false;const base=code.slice(0,-1),digit=String((10-[...base].reverse().reduce((sum,value,index)=>sum+Number(value)*(index%2?1:3),0)%10)%10);return digit===code.slice(-1);}if(format==='CODE39')return/^[0-9A-Z .\-$/+%]+$/.test(code);return!!code;}};
vm.runInNewContext(`${stateHelpers}\nglobalThis.__validBackupData=validBackupData;globalThis.__normalizeItemRecord=normalizeItemRecord;`,stateContext,{filename:'state-validation-test.js'});
if(stateContext.__validBackupData({items:[{}],transactions:[]}))fail('Kaputte JSON-Artikel würden weiterhin als Sicherung akzeptiert.');
if(!stateContext.__validBackupData({items:[{id:'1',name:'Hoodie',stock:'5',cost:'8.5'}],transactions:[]}))fail('Gültige ältere Sicherung wird abgelehnt.');
if(stateContext.__normalizeItemRecord({name:'Hoodie',stock:'5',cost:'8.5'}).stock!==5)fail('Zahlenstrings aus Sicherungen werden nicht normalisiert.');
if(stateContext.__validBackupData({items:[{id:'1',name:'A'},{id:'1',name:'B'}],transactions:[]}))fail('Doppelte Artikel-IDs werden beim JSON-Import nicht erkannt.');
const backupItem={id:'item-1',name:'Hoodie',stock:2,cost:8};
const backupTx={id:'tx-1',itemId:'item-1',itemName:'Hoodie',type:'purchase',quantity:1,unitPrice:8,date:'2026-08-12T10:00:00.000Z'};
const backupOrder={id:'order-1',supplier:'Textilhandel',date:'2026-08-12T10:00:00.000Z',status:'ordered',lines:[{id:'line-1',itemId:'item-1',itemName:'Hoodie',quantity:2,received:0,unitCost:8}]};
if(stateContext.__validBackupData({items:[backupItem],transactions:[backupTx,{...backupTx}]}))fail('Doppelte Buchungs-IDs werden beim Backup-Import nicht erkannt.');
if(stateContext.__validBackupData({items:[backupItem],transactions:[],orders:[backupOrder,{...backupOrder,lines:[{...backupOrder.lines[0],id:'line-2'}]}]}))fail('Doppelte Bestellungs-IDs werden beim Backup-Import nicht erkannt.');
if(stateContext.__validBackupData({items:[backupItem],transactions:[],orders:[{...backupOrder,lines:[backupOrder.lines[0],{...backupOrder.lines[0]}]}]}))fail('Doppelte Bestellzeilen-IDs werden beim Backup-Import nicht erkannt.');
if(stateContext.__validBackupData({items:[backupItem],transactions:[],orders:{}})||stateContext.__validBackupData({items:[backupItem],transactions:[],snapshots:{}}))fail('Backup-Felder mit falschem Typ werden statt sicherer Ablehnung stillschweigend ignoriert.');
for(const damaged of [
  {items:[backupItem],transactions:[{...backupTx,unitPrice:'kaputt'}]},
  {items:[backupItem],transactions:[{...backupTx,stockBefore:'kaputt'}]},
  {items:[{...backupItem,stock:''}],transactions:[]},
  {items:[backupItem],transactions:[{...backupTx,unitPrice:''}]},
  {items:[backupItem],transactions:[],orders:[{...backupOrder,date:'kaputt'}]},
  {items:[backupItem],transactions:[],orders:[{...backupOrder,lines:[{...backupOrder.lines[0],unitCost:'kaputt'}]}]},
  {items:[backupItem],transactions:[],orders:[{...backupOrder,lines:[{...backupOrder.lines[0],unitCost:''}]}]},
  {items:[backupItem],transactions:[],snapshots:[{id:'snap-1',date:'2026-08-12T10:00:00.000Z',itemCount:'',totalUnits:2,value:16}]},
  {items:[backupItem],transactions:[],snapshots:[{id:'snap-1',date:'2026-08-12T10:00:00.000Z',itemCount:'kaputt',totalUnits:2,value:16}]}
])if(stateContext.__validBackupData(damaged))fail('Beschädigte optionale Zahlen oder Datumswerte einer JSON-Sicherung werden still normalisiert.');
if(!stateContext.__validBackupData({items:[backupItem],transactions:[]}))fail('Eine ältere Sicherung ohne optionale Bestellungen/Momentaufnahmen ist nicht mehr kompatibel.');
const validEanGroup={id:'group-1',name:'Alle Größen',code:'2960799401472',barcodeFormat:'EAN13',itemIds:['item-1']};
if(!stateContext.__validBackupData({items:[backupItem],transactions:[],barcodeGroups:[validEanGroup]})||stateContext.__validBackupData({items:[backupItem],transactions:[],barcodeGroups:[{...validEanGroup,code:'2960799401473'}]})||stateContext.__validBackupData({items:[backupItem],transactions:[],barcodeGroups:[{...validEanGroup,barcodeFormat:'QR'}]}))fail('Gruppenbarcode-Art und EAN-Prüfziffer werden in Sicherungen nicht zuverlässig validiert.');

const importSource=extractBetween(app,'function normalizeImportRows','function showImportPreview');
const importContext={state:{items:[]},variantValues:value=>String(value||'').split(',').map(entry=>entry.trim()).filter(Boolean),safeText:value=>String(value??'').trim(),normalizedText:value=>String(value??'').trim().toLowerCase()};
vm.runInNewContext(`${importSource}\nglobalThis.__normalizeImportRows=normalizeImportRows;globalThis.__parseStrictImportNumber=parseStrictImportNumber;globalThis.__validateImportRows=validateImportRows;globalThis.__findImportMatch=findImportMatch;`,importContext,{filename:'roundtrip-import-test.js'});
const roundtrip=importContext.__normalizeImportRows([['Artikel','Farbe','Größe','VK Standard','VK Online','VK Markt','VK B2B','Sonderpreis Name','Sonderpreis'],['Hoodie','Schwarz','M','19,90','21,90','18,00','14,00','Verein','16,50']])[0];
if(roundtrip.salePrice!==19.9||roundtrip.onlinePrice!==21.9||roundtrip.marketPrice!==18||roundtrip.wholesalePrice!==14||roundtrip.specialPriceName!=='Verein'||roundtrip.specialPrice!==16.5)fail('Preisfelder überstehen CSV-/Excel-Roundtrip nicht.');
const blankImport=importContext.__normalizeImportRows([['Artikel','Bestand','Mindestbestand','EK'],['Shirt','','','']])[0];
if(blankImport.stock!==0||blankImport.minStock!==5||blankImport.cost!==0||blankImport._present.some(field=>['stock','minStock','cost'].includes(field)))fail('Leere numerische Importzellen erhalten keine sicheren Neuanlage-Defaults oder würden beim Merge vorhandene Werte überschreiben.');
const germanNumbers=importContext.__normalizeImportRows([['Artikel','Bestand','Mindestbestand','EK'],['Shirt','1.234','2.000','1.234,56 €']])[0];
if(germanNumbers.stock!==1234||germanNumbers.minStock!==2000||germanNumbers.cost!==1234.56)fail('Deutsche Tausender-/Dezimalzahlen werden beim Import falsch interpretiert.');
const malformedImport=importContext.__normalizeImportRows([['Artikel','Bestand'],['Shirt','12abc']])[0];
if(!Number.isNaN(malformedImport.stock)||!throws(()=>importContext.__validateImportRows([malformedImport])))fail('Ein teilweise numerischer Importwert wird weiterhin still in einen Bestand umgewandelt.');
if(throws(()=>importContext.__validateImportRows([blankImport])))fail('Leere numerische Importzellen werden zwar normalisiert, danach aber als ungültig abgewiesen.');
const importBase={name:'Hoodie',brand:'HP67',color:'Schwarz',size:'M',stock:0,minStock:0,cost:0,salePrice:0,onlinePrice:0,marketPrice:0,wholesalePrice:0,specialPrice:0};
if(throws(()=>importContext.__validateImportRows([{...importBase,sku:'HD-A',barcode:''},{...importBase,sku:'HD-B',barcode:''}])))fail('Gleiche Varianten mit unterschiedlichen Artikelnummern werden im Import fälschlich zusammengelegt.');
if(!throws(()=>importContext.__validateImportRows([{...importBase,sku:'',barcode:''},{...importBase,sku:'',barcode:''}])))fail('Doppelte Varianten ohne SKU/Barcode werden im Import nicht erkannt.');
if(!throws(()=>importContext.__validateImportRows([{...importBase,sku:'HD-A',barcode:''},{...importBase,sku:'HD-A',barcode:''}])))fail('Doppelte Import-SKUs werden nicht erkannt.');

const matchSource=extractBetween(app,'function importItemData','function validateImportRows');
const matchContext={state:{items:[{id:'s',name:'Hoodie Basic',color:'Schwarz',size:'S',sku:'HD-S',barcode:'12345670'},{id:'m',name:'Hoodie Basic',color:'Schwarz',size:'M',sku:'HD-M',barcode:'4006381333931'}]},safeText:value=>String(value||'').trim(),normalizedText:value=>String(value||'').toLowerCase()};
vm.runInNewContext(`${matchSource}\nglobalThis.__findImportMatch=findImportMatch;globalThis.__assertUniqueInventoryCodes=assertUniqueInventoryCodes;globalThis.__assertUniqueScanCodes=assertUniqueScanCodes;`,matchContext,{filename:'variant-match-test.js'});
if(matchContext.__findImportMatch({name:'Hoodie Basic',color:'Schwarz',size:'M'})?.id!=='m')fail('Import ordnet gleichnamige Größenvarianten nicht eindeutig zu.');
if(matchContext.__findImportMatch({name:'Hoodie Basic',color:'Schwarz',size:'M',sku:'HD-NEU'}))fail('Eine neue, unbekannte SKU wird fälschlich per Namen auf einen vorhandenen Artikel gemergt.');
let importConflict=false;try{matchContext.__findImportMatch({name:'Hoodie Basic',sku:'HD-S',barcode:'4006381333931'});}catch{importConflict=true;}
if(!importConflict)fail('Import akzeptiert eine SKU-/Barcode-Kollision zwischen zwei Artikeln.');
let duplicateCode=false;try{matchContext.__assertUniqueInventoryCodes([...matchContext.state.items,{id:'x',name:'Duplikat',sku:'HD-S'}]);}catch{duplicateCode=true;}
if(!duplicateCode)fail('Globale SKU-/Barcode-Eindeutigkeit wird vor dem Speichern nicht geprüft.');
if(!throws(()=>matchContext.__assertUniqueInventoryCodes([{id:'a',name:'A',sku:'HP67-A',barcode:''},{id:'b',name:'B',sku:'',barcode:'hp67-a'}])))fail('Eine SKU kann weiterhin mit dem Barcode eines anderen Artikels kollidieren.');
if(!throws(()=>matchContext.__assertUniqueScanCodes({items:[{id:'a',name:'A',sku:'LOC-A',barcode:''}],locations:[{id:'l',name:'Regal A',code:'loc-a'}],barcodeGroups:[]})))fail('Artikel- und Lagerplatzcodes werden nicht gegenseitig eindeutig gehalten.');
if(!throws(()=>matchContext.__assertUniqueScanCodes({items:[{id:'a',name:'A',sku:'A',barcode:'123'}],locations:[],barcodeGroups:[{id:'g',name:'Gruppe',code:'123'}]})))fail('Artikel- und Gruppencodes werden nicht gegenseitig eindeutig gehalten.');
if(!app.includes('scanCodeOwner(code,{items=state.items')||!app.includes("uniqueLocationCode(name,ignoreId='')")||!app.includes('codeOwner=scanCodeOwner(code,{ignoreLocationId:id})'))fail('Die Eingabemasken verhindern kollidierende Scancodes nicht durchgängig.');
matchContext.state.items=[{id:'a',name:'Hoodie Basic',brand:'Marke A',color:'Schwarz',size:'M',sku:'A-M'},{id:'b',name:'Hoodie Basic',brand:'Marke B',color:'Schwarz',size:'M',sku:'B-M'}];
if(matchContext.__findImportMatch({name:'Hoodie Basic',brand:'Marke B',color:'Schwarz',size:'M'})?.id!=='b')fail('Der identifierlose Import nutzt die Marke nicht zur eindeutigen Variantenzuordnung.');
if(!throws(()=>matchContext.__findImportMatch({name:'Hoodie Basic',color:'Schwarz',size:'M'})))fail('Ein mehrdeutiger Importtreffer ohne Identifier wird still einem beliebigen Artikel zugeordnet.');

const eanSource=extractBetween(app,'function eanCheckDigit','function createInternalEan');
const eanContext={};vm.runInNewContext(`${eanSource}\nglobalThis.__validEan=validEan;`,eanContext,{filename:'ean-test.js'});
if(!eanContext.__validEan('12345670')||!eanContext.__validEan('4006381333931')||eanContext.__validEan('12345671'))fail('EAN-8-/EAN-13-Prüfziffer ist fehlerhaft.');

const scannerSource=sourceSection(app,'async function openBarcodeScanner','function eanCheckDigit');
if(!/scannedArchivedItem\s*=\s*null/.test(scannerSource)||!/scannedArchivedItem\s*=\s*state\.items\.find\s*\(\s*item\s*=>\s*item\.archived/.test(scannerSource))fail('Der Scanner setzt oder ermittelt seinen separaten Zustand für archivierte Artikel nicht sicher.');
if(!/else\s+if\s*\(\s*scannedArchivedItem\s*\)/.test(scannerSource)||!/scannedArchivedItem[^;]*(?:openItem|scanEdit)|(?:openItem|scanEdit)[^;]*scannedArchivedItem/.test(scannerSource))fail('Ein archivierter Scan wird nicht als solcher angezeigt und gezielt zum Artikel weitergeleitet.');
if(!scannerSource.includes('if(!scannedItem||scannedItem.archived)'))fail('Der Scanner prüft den Archivstatus nicht unmittelbar vor einer Bestandsbuchung.');
const scannerStartSource=extractBetween(app,'async function startBarcodeScanner','async function handleScannedCode');
const startedCameras=[],handledCodes=[];let scannerInstanceCount=0,latestScanSuccess=null;
class IphoneScannerStub{constructor(){this.instance=++scannerInstanceCount;this.isScanning=false;}async start(camera,options,onSuccess){startedCameras.push(camera);if(this.instance===1)throw Error('constraint unsupported');this.isScanning=true;latestScanSuccess=onSuccess;}async clear(){}async stop(){this.isScanning=false;}static async getCameras(){return[{id:'front-1',label:'Front Camera'},{id:'rear-1',label:'Back Camera'}];}}
const scannerNodes={'#scannerDialog':{open:true},'#scannerStatus':{textContent:''},'#restartBarcodeScanner':{hidden:true},'#manualBarcode':{value:''}};
const scannerStartContext={barcodeScannerGeneration:7,barcodeScanner:null,barcodeScanHandling:false,barcodeCandidateCode:'',barcodeCandidateHits:0,barcodeCandidateAt:0,Html5Qrcode:IphoneScannerStub,$:selector=>scannerNodes[selector]||{},stopBarcodeScanner:async()=>{},handleScannedCode:async code=>handledCodes.push(code),console,String,Date};
vm.runInNewContext(`${scannerStartSource}\nglobalThis.__startScanner=startBarcodeScanner;`,scannerStartContext,{filename:'iphone-camera-start-test.js'});
await scannerStartContext.__startScanner(7);
if(startedCameras[0]?.facingMode!=='environment'||startedCameras[1]!=='rear-1'||!scannerNodes['#scannerStatus'].textContent.includes('Barcode vollständig'))fail('Der Scanner startet nicht zuerst iPhone-kompatibel und fällt danach nicht auf die erkannte Rückkamera zurück.');
latestScanSuccess?.('2960799401472');if(handledCodes.length||!scannerNodes['#scannerStatus'].textContent.includes('ruhig halten'))fail('Ein einzelnes unsicheres Kamera-Leseergebnis wird nicht zur Bestätigung zurückgehalten.');
latestScanSuccess?.('2960799401472');await Promise.resolve();if(handledCodes[0]!=='2960799401472'||!scannerNodes['#scannerStatus'].textContent.includes('Bestätigt'))fail('Zwei übereinstimmende Kamera-Leseergebnisse öffnen den sicheren Treffer nicht.');

const printBarcodeSource=extractBetween(app,"$('#printItemBarcode').onclick","$('#generateMissingBarcodes').onclick");
let capturedBarcodePrint=null,printedBarcodeHtml='';
const barcodePrintPopup={document:{write:value=>{printedBarcodeHtml+=value;},close(){}}};
const barcodePrintContext={
  $:selector=>selector==='#printItemBarcode'?{set onclick(handler){capturedBarcodePrint=handler;}}:{},
  barcodeLabelConfig:()=>({width:50,height:25,dpi:300}),buildItemBarcodeLabelSvg:()=>'<svg aria-label="Test"></svg>',
  currentItemBarcodeExport:()=>({value:'4006381333931',svg:'<svg aria-label="Test"></svg>'}),xmlEscape:value=>String(value),printViewToolbarCss:()=>'',printViewToolbar:()=>'<header>Zurück zur App</header>',printPopupWhenReady(){},window:{open:()=>barcodePrintPopup},alert:message=>fail(String(message)),Math,Number
};
vm.runInNewContext(printBarcodeSource,barcodePrintContext,{filename:'dynamic-barcode-print-test.js'});
capturedBarcodePrint?.();
if(!capturedBarcodePrint||!/@page\s*\{\s*size\s*:\s*50mm\s+25mm/.test(printedBarcodeHtml)||!/width\s*:\s*50mm/.test(printedBarcodeHtml)||!/height\s*:\s*25mm/.test(printedBarcodeHtml))fail('Barcode-Druck übernimmt die aktuell gewählte Nelko-Etikettengröße nicht dynamisch.');

const labelConfigSource=extractBetween(app,'function labelConfig','function selectedLabelItems');
const labelElements={preset:{value:'62x29'},width:{value:'62'},height:{value:'29'},startAt:{value:'100'},copies:{value:'100'},barcodeFormat:{value:'auto'},dpi:{value:'300'},nameFontScale:{value:'200'},metaFontScale:{value:'60'},barcodeFontScale:{value:'150'},background:{value:'#ffffff'},textColor:{value:'#101827'},showName:{checked:true},showPrice:{checked:true},labelPriceType:{value:'standard'},showSku:{checked:true},showVariant:{checked:true},showLocation:{checked:false},showBrand:{checked:false},showMaterial:{checked:false}};
const labelLimitContext={$:selector=>selector==='#labelForm'?{elements:labelElements}:selector.includes('nameFontScale')?labelElements.nameFontScale:selector.includes('metaFontScale')?labelElements.metaFontScale:labelElements.barcodeFontScale,fontPercentValue:selector=>Number(labelLimitContext.$(selector).value),labelDimension:(value,min,max,fallback)=>Math.round(Math.min(max,Math.max(min,Number.isFinite(+value)?+value:fallback))*10)/10,selectedLabelItems:()=>Array.from({length:10},(_,index)=>({id:String(index)})),state:{settings:{}},Math,Number};
vm.runInNewContext(`${labelConfigSource}\nglobalThis.__labelConfig=labelConfig;`,labelLimitContext,{filename:'label-job-limit-test.js'});
const limitedLabelConfig=labelLimitContext.__labelConfig();
if(limitedLabelConfig.nameFontScale!==2||limitedLabelConfig.metaFontScale!==.6||limitedLabelConfig.barcodeFontScale!==1.5)fail('Frei gewählte Schriftgrößen werden nicht in die Etikettenkonfiguration übernommen.');
if(limitedLabelConfig.copies!==100||limitedLabelConfig.startAt!==100)fail('Gültige Etikettenparameter werden bereits vor der Jobprüfung unerwartet verändert.');
const labelJobSource=extractBetween(app,"for(const id of ['#exportLabelsZip'",'function locationLabelConfig');
const labelJobHandlers=new Map();let labelJobCount=10,labelJobPrevented=0,labelJobStopped=0;
const labelJobContext={
  $:selector=>({addEventListener:(type,handler,capture)=>{if(type==='click'&&capture===true)labelJobHandlers.set(selector,handler);}}),
  selectedLabelItems:()=>Array.from({length:labelJobCount},(_,index)=>({id:String(index)})),labelConfig:()=>({copies:100,startAt:100,logo:''}),alert(){},
};
vm.runInNewContext(labelJobSource,labelJobContext,{filename:'label-job-guard-test.js'});
const oversizedJobEvent={preventDefault(){labelJobPrevented++;},stopImmediatePropagation(){labelJobStopped++;}};
labelJobHandlers.get('#exportLabelsPdf')?.(oversizedJobEvent);
if(labelJobHandlers.size!==6||labelJobPrevented!==1||labelJobStopped!==1)fail('Ein Etikettenjob über 500 Ausgaben wird nicht vor PDF/Druck/ZIP-Erzeugung gestoppt.');
labelJobCount=2;labelJobPrevented=0;labelJobStopped=0;labelJobHandlers.get('#printLabels')?.(oversizedJobEvent);
if(labelJobPrevented||labelJobStopped)fail('Ein zulässiger Etikettenjob wird vom Joblimit fälschlich blockiert.');
const locationJobSource=extractBetween(app,"for(const id of ['#exportLocationLabelsSvg'",'function safeFileName');
const locationJobHandlers=new Map();let locationJobCount=301,locationJobPrevented=0,locationJobStopped=0;
const locationJobContext={$:selector=>({addEventListener:(type,handler,capture)=>{if(type==='click'&&capture===true)locationJobHandlers.set(selector,handler);}}),selectedLocationsForLabels:()=>Array.from({length:locationJobCount},(_,index)=>({id:String(index)})),alert(){}};
vm.runInNewContext(locationJobSource,locationJobContext,{filename:'location-label-job-guard-test.js'});
const oversizedLocationEvent={preventDefault(){locationJobPrevented++;},stopImmediatePropagation(){locationJobStopped++;}};
locationJobHandlers.get('#exportLocationLabelsPdf')?.(oversizedLocationEvent);
if(locationJobHandlers.size!==3||locationJobPrevented!==1||locationJobStopped!==1)fail('Ein großer Lagerplatz-Aufkleberjob wird nicht vor SVG/PDF/Druck gestoppt.');
locationJobCount=20;locationJobPrevented=0;locationJobStopped=0;locationJobHandlers.get('#printLocationLabels')?.(oversizedLocationEvent);
if(locationJobPrevented||locationJobStopped)fail('Ein zulässiger Lagerplatz-Aufkleberjob wird fälschlich blockiert.');

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

const exportElements=new Map(),exportDownloads=[],exportSheets=[];
const exportElement=selector=>{if(!exportElements.has(selector))exportElements.set(selector,{});return exportElements.get(selector);};
const exportXlsx={utils:{book_new:()=>({sheets:[]}),json_to_sheet:data=>{exportSheets.push(data);return{data};},book_append_sheet:(book,sheet,name)=>book.sheets.push({sheet,name})},writeFile(){}};
const exportContext={
  $:exportElement,XLSX:exportXlsx,Date,Math,String,
  state:{
    items:[{id:'formula',name:' =2+2',sku:'SKU-1',category:'T-Shirts',color:'Schwarz',size:'M',brand:'HP67',material:'Baumwolle',season:'',unit:'Stück',tags:'',description:'@Befehl',salesOptions:[],supplier:'',location:'A1',barcode:'4006381333931',stock:1,minStock:0,cost:5,salePrice:0,onlinePrice:0,marketPrice:0,wholesalePrice:0,specialPriceName:'',specialPrice:0,archived:false}],
    transactions:[{date:'2026-08-12T10:00:00.000Z',type:'sale',itemName:'=2+2',quantity:1,unitPrice:0,unitCost:5,priceType:'special',note:'+Befehl'}],orders:[],locations:[],snapshots:[]
  },
  fmtDate:value=>value,orderStatusLabel:value=>value,xmlEscape:value=>String(value),
  Blob:class{},URL:{createObjectURL:()=>'',revokeObjectURL(){}},document:{createElement:()=>({style:{},click(){},remove(){}}),body:{append(){}}},setTimeout
};
const spreadsheetExportSource=extractBetween(app,'function safeFileName',"$('#exportPdf').onclick");
vm.runInNewContext(`${spreadsheetExportSource}\nglobalThis.__captureDownload=fn=>{download=fn;};`,exportContext,{filename:'spreadsheet-formula-test.js'});
exportContext.__captureDownload((name,type,content)=>exportDownloads.push({name,type,content:String(content)}));
exportElements.get('#exportCsv')?.onclick();exportElements.get('#exportTsv')?.onclick();exportElements.get('#exportTransactions')?.onclick();exportElements.get('#exportXlsx')?.onclick();
const inventoryCsv=exportDownloads.find(entry=>entry.name.includes('Inventar-')&&entry.name.endsWith('.csv'))?.content||'',inventoryTsv=exportDownloads.find(entry=>entry.name.endsWith('.tsv'))?.content||'',transactionCsv=exportDownloads.find(entry=>entry.name.includes('Buchungen-'))?.content||'';
if(!inventoryCsv.includes("' =2+2")||!inventoryCsv.includes("'@Befehl")||!inventoryTsv.includes("' =2+2")||!inventoryTsv.includes("'@Befehl")||!transactionCsv.includes("'+Befehl"))fail('CSV-/TSV-Exporte neutralisieren Formeln aus Artikel- und Buchungstexten nicht vollständig.');
const unsafeSpreadsheetValue=value=>/^[\s\u0000-\u0020]*[=+\-@]/.test(String(value??''));
if(!exportSheets.length||unsafeSpreadsheetValue(exportSheets[0]?.[0]?.Artikel)||unsafeSpreadsheetValue(exportSheets[0]?.[0]?.Beschreibung)||unsafeSpreadsheetValue(exportSheets[2]?.[0]?.Artikel)||unsafeSpreadsheetValue(exportSheets[2]?.[0]?.Notiz))fail('Excel-Exporte enthalten weiterhin direkt ausführbare Formelpräfixe.');

let capturedPdfExport=null,pdfTable=null,pdfSaved='',pdfTexts=[];
class PdfStub{setFontSize(){}text(...args){pdfTexts.push(args);}autoTable(options){pdfTable=options;}save(name){pdfSaved=name;}internal={getNumberOfPages:()=>1};}
const pdfContext={
  $:()=>({set onclick(handler){capturedPdfExport=handler;}}),window:{jspdf:{jsPDF:PdfStub}},Intl,Date,
  state:{items:[{id:'active',name:'Aktiv',sku:'A',color:'',size:'',location:'A1',stock:2,minStock:1,cost:10,salePrice:20,archived:false},{id:'archived',name:'Archiviert',sku:'X',color:'',size:'',location:'Alt',stock:99,minStock:0,cost:10,salePrice:20,archived:true}]},
  money:value=>`EUR:${Number(value)}`,alert:message=>fail(String(message))
};
const pdfExportSource=extractBetween(app,"$('#exportPdf').onclick","$('#importJson').onchange");
vm.runInNewContext(pdfExportSource,pdfContext,{filename:'active-pdf-report-test.js'});
capturedPdfExport?.();
if(!capturedPdfExport||pdfTable?.body?.length!==1||pdfTable.body[0]?.[0]!=='Aktiv'||!pdfTexts.some(args=>String(args[0]).includes('1 Artikel'))||!pdfTexts.some(args=>String(args[0]).includes('EUR:20'))||!pdfSaved.endsWith('.pdf'))fail('Der Inventar-PDF-Bericht enthält archivierte Artikel oder berechnet seine aktive Zusammenfassung falsch.');

if(!sw.includes("CACHE_PREFIX='hp67-inventar-'")||!sw.includes('k.startsWith(CACHE_PREFIX)'))fail('Service Worker löscht Caches nicht app-spezifisch.');
if(!sw.includes("isShell?'./index.html':e.request"))fail('Fremde Navigationen können weiterhin den Offline-App-Shell überschreiben.');
if(!sw.includes("requestUrl.pathname.startsWith(`${scopeUrl.pathname}v329/`)"))fail('Versionsgebundene Kern-Dateien werden nicht network-first geladen.');
for(const releaseAsset of ['./v329/app.css','./v329/app.js','./v329/smart-camera.js'])if(!sw.includes(`'${releaseAsset}'`))fail(`Versionsgebundene Offline-Datei fehlt im Service Worker: ${releaseAsset}`);
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
if(!html.includes('Content-Security-Policy')||!html.includes("connect-src 'self'")||!html.includes("script-src 'self' 'wasm-unsafe-eval'"))fail('Die App sperrt fremde Laufzeitskripte/Netzwerkziele nicht per CSP oder kann ihr lokales OCR-WASM nicht starten.');
const runtimeNetworkTargets=`${app}\n${smart}`.replaceAll('http://www.w3.org/2000/svg','');
if(/https?:\/\//i.test(runtimeNetworkTargets))fail('App-Code enthält weiterhin externe Laufzeit-Netzwerkziele.');
for(const localOcrPath of ['./vendor/tesseract/tesseract.min.js','worker.min.js','core/','lang'])if(!smart.includes(localOcrPath))fail(`Lokaler OCR-Pfad fehlt: ${localOcrPath}`);

const updatePage=read('update.html');
if(!updatePage.includes("registration.unregister()")||!updatePage.includes("registration.scope===scope")||!updatePage.includes("name.startsWith('hp67-inventar-')")||updatePage.includes('localStorage'))fail('Sichere Rettungsseite für alte PWA-Caches fehlt oder verändert Inventardaten.');
const pagesWorkflow=read('.github/workflows/pages.yml');
for(const deployedFile of ['index.html','update.html','app.css','app.js','smart-camera.js','icon.svg','manifest.webmanifest','sw.js'])if(!pagesWorkflow.includes(deployedFile))fail(`GitHub-Pages-Paket enthält ${deployedFile} nicht.`);
for(const releaseAsset of ['v329/app.css','v329/app.js','v329/smart-camera.js'])if(!pagesWorkflow.includes(releaseAsset.split('/')[1])||!pagesWorkflow.includes('public/v329'))fail(`Versionsgebundene Pages-Datei fehlt: ${releaseAsset}`);
if(!pagesWorkflow.includes("sed -i 's|app.css?v=329|v329/app.css|g; s|app.js?v=329|v329/app.js|g; s|smart-camera.js?v=329|v329/smart-camera.js|g'"))fail('GitHub Pages verweist nicht garantiert auf frische v329-Kern-Dateien.');

console.log(`HP67 Smoke-Test bestanden: ${required.length} Dateien, ${ids.length} HTML-IDs, PWA-Manifest und Datenschutzprüfung.`);
