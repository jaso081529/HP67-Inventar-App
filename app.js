const STORAGE_KEY = 'hp67-inventory-v1';
const DEFAULT_CATEGORIES=[['tshirts','T-Shirts','TS','#2563eb'],['hoodies','Hoodies','HD','#7c3aed'],['sweatshirts','Sweatshirts','SW','#9333ea'],['jacken','Jacken','JK','#0891b2'],['hosen','Hosen','HS','#0f766e'],['shorts','Shorts','SH','#059669'],['polos','Poloshirts','PO','#65a30d'],['hemden','Hemden','HM','#ca8a04'],['kleider','Kleider','KL','#db2777'],['roecke','Röcke','RO','#e11d48'],['muetzen','Mützen & Caps','MU','#ea580c'],['anglerhuete','Anglerhüte','AH','#15803d'],['socken','Socken','SO','#4f46e5'],['unterwaesche','Unterwäsche','UW','#be123c'],['accessoires','Accessoires','AC','#475569']].map(([id,name,prefix,color])=>({id:`cat-${id}`,name,prefix,color}));
const DEFAULT_BRANDS=['B&C Collection','Russell Athletic','Beechfield','HP67'];
const DEFAULT_MATERIALS=['100 % Baumwolle','Bio-Baumwolle','Baumwolle / Polyester','80 % Baumwolle / 20 % Polyester','50 % Baumwolle / 50 % Polyester','100 % Polyester','Recyceltes Polyester','Polyester / Elasthan','Baumwolle / Elasthan','Jersey','Single Jersey','Fleece','Microfleece','Softshell','Nylon / Polyamid','Acryl','Wolle','Merinowolle','Viskose','Leinen','Canvas','Twill','Mesh','Ripstop'];
const STANDARD_SALES_OPTIONS=['Einzelverkauf','Onlineshop','Markt / Veranstaltung','Großhandel / B2B','Abholung','Versand','Personalisiert','Nicht zum Verkauf'];
const pageTitles = {dashboard:'Übersicht',inventory:'Inventar',scan:'Erfassen',activity:'Verlauf',settings:'Mehr'};
let state = loadState();
let inventoryFilter = 'all';
let inventorySort = 'name';
let activityFilter = 'all';
let deferredInstall;
let pendingItemPhoto = '';
let pendingItemVisualSamples = [];
let pendingLocationVisualSamples = [];
let voiceRecognition = null;
let voiceListening = false;
let voiceBaseText = '';
let voiceFinalText = '';
let barcodeScanner = null;
let barcodeStartTimer = null;
let barcodeScannerGeneration = 0;
let scannerTarget = 'lookup';
let scannedItem = null;
let scannedLocation = null;
let pendingImportRows = [];
let inventoryLimit = 100;
let activityLimit = 150;
let receiptAnalysisRun = 0;

normalizeVisualState(state);

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);
const money = n => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(n)||0);
const number = n => new Intl.NumberFormat('de-DE').format(Number(n)||0);
const fmtDate = iso => new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
const esc = v => String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function defaultLocationCode(name){return `LOC-${skuPart(name,10)||'PLATZ'}`;}
function locationIdFromName(name,index=0){return `loc-${(skuPart(name,14)||'platz').toLowerCase()}-${index}`;}

function safeText(value){return typeof value==='string'||typeof value==='number'?String(value).trim():'';}
function nonNegativeNumber(value,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?Math.max(0,parsed):fallback;}
function validIsoDate(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():new Date().toISOString();}
function normalizeItemRecord(item,index=0){
  if(!item||typeof item!=='object'||!safeText(item.name))return null;
  const normalized={...item,id:safeText(item.id)||`item-${Date.now()}-${index}`,name:safeText(item.name)};
  for(const field of ['sku','category','color','size','supplier','location','brand','material','season','unit','tags','description','barcode','specialPriceName'])normalized[field]=safeText(item[field]);
  normalized.unit=normalized.unit||'Stück';
  normalized.stock=nonNegativeNumber(item.stock);
  normalized.minStock=nonNegativeNumber(item.minStock,5);
  for(const field of ['cost','salePrice','onlinePrice','marketPrice','wholesalePrice','specialPrice'])normalized[field]=nonNegativeNumber(item[field]);
  normalized.salesOptions=Array.isArray(item.salesOptions)?variantValues(item.salesOptions):variantValues(item.salesOptions);
  normalized.photo=typeof item.photo==='string'?item.photo:'';
  normalized.visualSamples=Array.isArray(item.visualSamples)?item.visualSamples.filter(sample=>sample&&sample.version===1).slice(-6):[];
  normalized.archived=item.archived===true;
  return normalized;
}
function normalizeTransactionRecord(transaction,index=0){
  if(!transaction||typeof transaction!=='object'||!safeText(transaction.itemName)||!safeText(transaction.type)||nonNegativeNumber(transaction.quantity)<=0)return null;
  const normalized={...transaction,id:safeText(transaction.id)||`tx-${Date.now()}-${index}`,itemId:safeText(transaction.itemId),itemName:safeText(transaction.itemName),type:safeText(transaction.type),quantity:nonNegativeNumber(transaction.quantity),unitPrice:nonNegativeNumber(transaction.unitPrice),priceType:safeText(transaction.priceType),note:safeText(transaction.note),date:validIsoDate(transaction.date)};
  if(transaction.unitCost!==undefined&&transaction.unitCost!==null&&safeText(transaction.unitCost)!==''&&Number.isFinite(Number(transaction.unitCost)))normalized.unitCost=nonNegativeNumber(transaction.unitCost);else delete normalized.unitCost;
  if(Number.isFinite(Number(transaction.stockBefore)))normalized.stockBefore=nonNegativeNumber(transaction.stockBefore);
  if(Number.isFinite(Number(transaction.stockAfter)))normalized.stockAfter=nonNegativeNumber(transaction.stockAfter);
  if(Number.isFinite(Number(transaction.costBefore)))normalized.costBefore=nonNegativeNumber(transaction.costBefore);
  if(transaction.orderId)normalized.orderId=safeText(transaction.orderId);
  if(transaction.orderLineItemId)normalized.orderLineItemId=safeText(transaction.orderLineItemId);
  return normalized;
}
function normalizeOrderRecord(order,index=0){
  if(!order||typeof order!=='object'||!Array.isArray(order.lines))return null;
  const lines=order.lines.map(line=>line&&typeof line==='object'&&safeText(line.itemName)&&nonNegativeNumber(line.quantity)>0?{...line,itemId:safeText(line.itemId),itemName:safeText(line.itemName),quantity:nonNegativeNumber(line.quantity),received:Math.min(nonNegativeNumber(line.received),nonNegativeNumber(line.quantity)),unitCost:nonNegativeNumber(line.unitCost)}:null).filter(Boolean);
  if(!lines.length)return null;
  const allowed=new Set(['ordered','partial','received','cancelled']);
  return{...order,id:safeText(order.id)||`order-${Date.now()}-${index}`,supplier:safeText(order.supplier)||'Ohne Lieferant',date:validIsoDate(order.date),status:allowed.has(order.status)?order.status:'ordered',lines};
}
function normalizeSnapshotRecord(snapshot,index=0){
  if(!snapshot||typeof snapshot!=='object')return null;
  return{...snapshot,id:safeText(snapshot.id)||`snapshot-${Date.now()}-${index}`,date:validIsoDate(snapshot.date),itemCount:nonNegativeNumber(snapshot.itemCount),totalUnits:nonNegativeNumber(snapshot.totalUnits),value:nonNegativeNumber(snapshot.value),items:Array.isArray(snapshot.items)?snapshot.items:[]};
}
function validBackupData(data){
  if(!data||typeof data!=='object'||!Array.isArray(data.items)||!Array.isArray(data.transactions))return false;
  const items=data.items.map(normalizeItemRecord);if(items.some(item=>!item))return false;
  const duplicated=field=>{const values=items.map(item=>safeText(item[field]).toLowerCase()).filter(Boolean);return new Set(values).size!==values.length;};
  if(duplicated('id')||duplicated('sku')||duplicated('barcode'))return false;
  if(data.transactions.some((transaction,index)=>!normalizeTransactionRecord(transaction,index)))return false;
  if(Array.isArray(data.orders)&&data.orders.some((order,index)=>!normalizeOrderRecord(order,index)))return false;
  return !Array.isArray(data.snapshots)||!data.snapshots.some((snapshot,index)=>!normalizeSnapshotRecord(snapshot,index));
}

function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(saved&&Array.isArray(saved.items)&&Array.isArray(saved.transactions)){
      saved.items=saved.items.map(normalizeItemRecord).filter(Boolean);
      const usedIds=new Set(),usedSkus=new Set(),usedBarcodes=new Set();saved.items.forEach((item,index)=>{if(usedIds.has(item.id))item.id=`item-${Date.now()}-${index}`;usedIds.add(item.id);const sku=item.sku.toLowerCase(),barcode=item.barcode.toLowerCase();if(sku&&usedSkus.has(sku))item.sku='';else if(sku)usedSkus.add(sku);if(barcode&&usedBarcodes.has(barcode))item.barcode='';else if(barcode)usedBarcodes.add(barcode);});
      saved.transactions=saved.transactions.map(normalizeTransactionRecord).filter(Boolean);
      saved.orders=Array.isArray(saved.orders)?saved.orders.map(normalizeOrderRecord).filter(Boolean):[];
      saved.snapshots=Array.isArray(saved.snapshots)?saved.snapshots.map(normalizeSnapshotRecord).filter(Boolean):[];
      saved.settings=saved.settings&&typeof saved.settings==='object'?saved.settings:{};
      saved.locations=Array.isArray(saved.locations)?saved.locations.filter(location=>location&&safeText(location.name)).map((location,index)=>({id:safeText(location.id)||locationIdFromName(location.name,index),name:safeText(location.name),code:safeText(location.code)||defaultLocationCode(location.name),color:safeText(location.color)||'#2563eb',note:safeText(location.note),visualSamples:Array.isArray(location.visualSamples)?location.visualSamples.filter(sample=>sample&&sample.version===1).slice(-4):[]})):[];
      saved.categories=Array.isArray(saved.categories)?saved.categories.filter(category=>category&&safeText(category.name)).map((category,index)=>({id:safeText(category.id)||`cat-${Date.now()}-${index}`,name:safeText(category.name),prefix:skuPart(category.prefix||category.name,5),color:safeText(category.color)||'#64748b'})):DEFAULT_CATEGORIES.map(c=>({...c}));
      const known=new Set(saved.categories.map(c=>c.name.toLowerCase()));
      saved.items.map(i=>i.category).filter(Boolean).forEach(name=>{if(!known.has(name.toLowerCase())){saved.categories.push({id:`cat-${Date.now()}-${saved.categories.length}`,name,prefix:skuPart(name,5)||'ART',color:'#64748b'});known.add(name.toLowerCase());}});
      saved.brands=Array.isArray(saved.brands)?saved.brands.map(safeText).filter(Boolean):DEFAULT_BRANDS.slice();
      DEFAULT_BRANDS.forEach(brand=>{if(!saved.brands.some(b=>b.toLowerCase()===brand.toLowerCase()))saved.brands.push(brand);});
      saved.items.map(i=>i.brand).filter(Boolean).forEach(brand=>{if(!saved.brands.some(b=>b.toLowerCase()===brand.toLowerCase()))saved.brands.push(brand);});
      saved.materials=Array.isArray(saved.materials)?saved.materials.map(safeText).filter(Boolean):DEFAULT_MATERIALS.slice();
      DEFAULT_MATERIALS.forEach(material=>{if(!saved.materials.some(m=>m.toLowerCase()===material.toLowerCase()))saved.materials.push(material);});
      saved.items.map(i=>i.material).filter(Boolean).forEach(material=>{if(!saved.materials.some(m=>m.toLowerCase()===material.toLowerCase()))saved.materials.push(material);});
      const knownLocations=new Set(saved.locations.map(location=>location.name.toLowerCase())),usedLocationCodes=new Set();
      saved.locations.forEach(location=>{const base=cleanLocationCode(location.code)||defaultLocationCode(location.name);let code=base,index=2;while(usedLocationCodes.has(code.toLowerCase()))code=`${base}-${index++}`;location.code=code;usedLocationCodes.add(code.toLowerCase());});
      saved.items.map(i=>i.location).filter(Boolean).forEach((name,index)=>{if(!knownLocations.has(name.toLowerCase())){const base=defaultLocationCode(name);let code=base,suffix=2;while(usedLocationCodes.has(code.toLowerCase()))code=`${base}-${suffix++}`;saved.locations.push({id:locationIdFromName(name,index),name,code,color:'#2563eb',note:'',visualSamples:[]});knownLocations.add(name.toLowerCase());usedLocationCodes.add(code.toLowerCase());}});
      return saved;
    }
  }catch(e){ console.warn(e); }
  return {items:[],transactions:[],orders:[],snapshots:[],categories:DEFAULT_CATEGORIES.map(c=>({...c})),brands:DEFAULT_BRANDS.slice(),materials:DEFAULT_MATERIALS.slice(),locations:[],settings:{}};
}
function normalizeVisualState(data){
  if(!data||typeof data!=='object')return;
  (data.items||[]).forEach(item=>{item.visualSamples=Array.isArray(item.visualSamples)?item.visualSamples.filter(sample=>sample&&sample.version===1).slice(-6):[];});
  (data.locations||[]).forEach(location=>{location.visualSamples=Array.isArray(location.visualSamples)?location.visualSamples.filter(sample=>sample&&sample.version===1).slice(-4):[];});
}
function persistState(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));return true;}
  catch(err){console.error('Inventar konnte nicht lokal gespeichert werden:',err);alert('Der lokale Speicher ist voll. Bitte zuerst unter Mehr eine Sicherung exportieren und nicht benötigte Artikelfotos entfernen. Deine letzte Eingabe wurde nicht gespeichert.');return false;}
}
function save(){if(!persistState()){state=loadState();scannedItem=null;scannedLocation=null;renderAll();const error=new Error('HP67_SAVE_ABORTED');error.hp67Handled=true;throw error;}renderAll();return true;}
window.addEventListener('error',event=>{if(event.error?.hp67Handled)event.preventDefault();});
function statusOf(item){ return item.stock<=0?'out':item.stock<=item.minStock?'low':'ok'; }
function statusLabel(status){ return {ok:'Bestand gut',low:'Nachkaufen',out:'Ausverkauft'}[status]; }
function initials(name){ return name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'TX'; }
function empty(message){ return `<div class="empty">${esc(message)}</div>`; }
function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(el.timer); el.timer=setTimeout(()=>el.classList.remove('show'),2500); }
$$('.close-btn').forEach(button=>button.addEventListener('click',()=>button.closest('dialog')?.close('cancel')));

function renderAll(){
  renderDashboard(); renderInventory(); renderTransactions(); fillItemSelect(); renderSnapshotInfo();renderCategoryOptions();renderBrandOptions();renderMaterialOptions();renderLocationOptions();
}
function renderCategoryOptions(){const list=$('#categoryOptions');if(list)list.innerHTML=(state.categories||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'de')).map(c=>`<option value="${esc(c.name)}">${esc(c.prefix||'')}</option>`).join('');}
function renderBrandOptions(){const list=$('#brandOptions');if(list)list.innerHTML=(state.brands||[]).slice().sort((a,b)=>a.localeCompare(b,'de')).map(brand=>`<option value="${esc(brand)}"></option>`).join('');}
function ensureBrand(name){name=String(name||'').trim();if(name&&!(state.brands||=[]).some(b=>b.toLowerCase()===name.toLowerCase()))state.brands.push(name);}
function renderMaterialOptions(){const materials=(state.materials||[]).slice().sort((a,b)=>a.localeCompare(b,'de')),list=$('#materialOptions'),select=$('#materialPreset');if(list)list.innerHTML=materials.map(material=>`<option value="${esc(material)}"></option>`).join('');if(select){const current=select.value;select.innerHTML='<option value="">Bitte auswählen …</option>'+materials.map(material=>`<option value="${esc(material)}">${esc(material)}</option>`).join('');if(materials.includes(current))select.value=current;}}
function ensureMaterial(name){name=String(name||'').trim();if(name&&!(state.materials||=[]).some(m=>m.toLowerCase()===name.toLowerCase()))state.materials.push(name);}
function uniqueLocationCode(name,ignoreId=''){const base=defaultLocationCode(name),used=new Set((state.locations||[]).filter(location=>location.id!==ignoreId).map(location=>String(location.code||'').toUpperCase()));let code=base,index=2;while(used.has(code.toUpperCase()))code=`${base}-${index++}`;return code;}
function ensureLocation(name){name=String(name||'').trim();if(!name)return null;let location=(state.locations||=[]).find(entry=>entry.name.toLowerCase()===name.toLowerCase());if(!location){location={id:uid(),name,code:uniqueLocationCode(name),color:'#2563eb',note:''};state.locations.push(location);}return location;}
function renderLocationOptions(){const list=$('#locationOptions');if(list)list.innerHTML=(state.locations||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'de')).map(location=>`<option value="${esc(location.name)}">${esc(location.code)}</option>`).join('');}
$('#materialPreset').onchange=e=>{if(e.currentTarget.value)$('#itemForm').elements.material.value=e.currentTarget.value;};
function ensureCategory(name){name=String(name||'').trim();if(!name)return null;let category=(state.categories||=[]).find(c=>c.name.toLowerCase()===name.toLowerCase());if(!category){category={id:uid(),name,prefix:skuPart(name,3)||'ART',color:'#64748b'};state.categories.push(category);}return category;}
function resetCategoryForm(){const f=$('#categoryForm');f.reset();f.elements.id.value='';f.elements.color.value='#2563eb';$('#saveCategory').textContent='Kategorie hinzufügen';$('#cancelCategoryEdit').hidden=true;}
function renderCategoryManager(){const rows=(state.categories||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'de'));$('#categoryList').innerHTML=rows.length?rows.map(c=>{const count=state.items.filter(i=>String(i.category||'').toLowerCase()===c.name.toLowerCase()).length;return `<div class="category-row"><i style="background:${esc(c.color||'#64748b')}"></i><div><b>${esc(c.name)}</b><small>${esc(c.prefix||'–')} · ${count} Artikel</small></div><button type="button" data-category-edit="${esc(c.id)}">Bearbeiten</button><button type="button" class="category-delete" data-category-delete="${esc(c.id)}">Löschen</button></div>`;}).join(''):empty('Noch keine Kategorien angelegt.');renderCategoryOptions();}
$('#manageCategories').onclick=()=>{resetCategoryForm();renderCategoryManager();$('#categoryDialog').showModal();};
$('#cancelCategoryEdit').onclick=resetCategoryForm;
$('#categoryForm').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget,id=f.elements.id.value,name=f.elements.name.value.trim(),prefix=skuPart(f.elements.prefix.value,5),color=f.elements.color.value;if(!name||!prefix)return;const duplicate=state.categories.find(c=>c.id!==id&&c.name.toLowerCase()===name.toLowerCase());if(duplicate){alert('Diese Kategorie existiert bereits.');return;}const existing=state.categories.find(c=>c.id===id),oldName=existing?.name;if(existing){Object.assign(existing,{name,prefix,color});state.items.forEach(item=>{if(String(item.category||'').toLowerCase()===String(oldName).toLowerCase())item.category=name;});}else state.categories.push({id:uid(),name,prefix,color});save();resetCategoryForm();renderCategoryManager();toast(existing?'Kategorie aktualisiert':'Kategorie hinzugefügt');});
$('#categoryList').onclick=e=>{const edit=e.target.closest('[data-category-edit]'),remove=e.target.closest('[data-category-delete]');if(edit){const category=state.categories.find(c=>c.id===edit.dataset.categoryEdit);if(!category)return;const f=$('#categoryForm');f.elements.id.value=category.id;f.elements.name.value=category.name;f.elements.prefix.value=category.prefix;f.elements.color.value=category.color||'#64748b';$('#saveCategory').textContent='Änderungen speichern';$('#cancelCategoryEdit').hidden=false;f.elements.name.focus();}if(remove){const category=state.categories.find(c=>c.id===remove.dataset.categoryDelete);if(!category)return;const count=state.items.filter(i=>String(i.category||'').toLowerCase()===category.name.toLowerCase()).length;if(!confirm(count?`Kategorie „${category.name}“ löschen und die Zuordnung bei ${count} Artikel(n) entfernen?`:`Kategorie „${category.name}“ löschen?`))return;state.items.forEach(i=>{if(String(i.category||'').toLowerCase()===category.name.toLowerCase())i.category='';});state.categories=state.categories.filter(c=>c.id!==category.id);save();resetCategoryForm();renderCategoryManager();toast('Kategorie gelöscht');}};
function cleanLocationCode(value){return String(value||'').trim().toUpperCase().replace(/[^A-Z0-9._/-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');}
function resetLocationForm(){const f=$('#locationForm');f.reset();f.elements.id.value='';f.elements.color.value='#2563eb';pendingLocationVisualSamples=[];updateVisualTrainingStatus('location');$('#saveLocation').textContent='Lagerplatz hinzufügen';$('#cancelLocationEdit').hidden=true;}
function renderLocationManager(){const rows=(state.locations||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'de'));$('#locationList').innerHTML=rows.length?rows.map(location=>{const items=state.items.filter(item=>String(item.location||'').toLowerCase()===location.name.toLowerCase()&&!item.archived),units=items.reduce((sum,item)=>sum+(+item.stock||0),0),learned=Array.isArray(location.visualSamples)?location.visualSamples.length:0;return `<div class="location-row"><input type="checkbox" data-location-select="${esc(location.id)}" checked aria-label="${esc(location.name)} auswählen"><i style="background:${esc(location.color||'#2563eb')}"></i><div><b>${esc(location.name)}</b><small><span class="location-code">${esc(location.code)}</span> · ${items.length} Variante(n) · ${number(units)} Teile${learned?` · ${learned} Fotoansicht(en)`:''}${location.note?` · ${esc(location.note)}`:''}</small></div><button type="button" data-location-svg="${esc(location.id)}">SVG</button><button type="button" data-location-edit="${esc(location.id)}">Bearbeiten</button><button type="button" class="location-delete" data-location-delete="${esc(location.id)}">Löschen</button></div>`;}).join(''):empty('Noch keine Lagerplätze angelegt.');renderLocationOptions();}
$('#manageLocations').onclick=()=>{resetLocationForm();renderLocationManager();$('#locationDialog').showModal();};
$('#cancelLocationEdit').onclick=resetLocationForm;
$('#generateLocationCode').onclick=()=>{const f=$('#locationForm'),name=f.elements.name.value.trim();if(!name){toast('Bitte zuerst eine Bezeichnung eintragen');f.elements.name.focus();return;}f.elements.code.value=uniqueLocationCode(name,f.elements.id.value);};
$('#locationForm').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget,id=f.elements.id.value,name=f.elements.name.value.trim(),code=cleanLocationCode(f.elements.code.value)||uniqueLocationCode(name,id),color=f.elements.color.value,note=f.elements.note.value.trim(),visualSamples=pendingLocationVisualSamples.slice(-4);if(!name)return;const duplicateName=(state.locations||[]).find(location=>location.id!==id&&location.name.toLowerCase()===name.toLowerCase()),duplicateCode=(state.locations||[]).find(location=>location.id!==id&&String(location.code).toLowerCase()===code.toLowerCase());if(duplicateName){alert('Diese Lagerplatz-Bezeichnung existiert bereits.');return;}if(duplicateCode){alert('Dieser Lagercode ist bereits vergeben.');return;}const existing=(state.locations||[]).find(location=>location.id===id),oldName=existing?.name;if(existing){Object.assign(existing,{name,code,color,note,visualSamples});state.items.forEach(item=>{if(String(item.location||'').toLowerCase()===String(oldName).toLowerCase())item.location=name;});}else(state.locations||=[]).push({id:uid(),name,code,color,note,visualSamples});save();resetLocationForm();renderLocationManager();toast(existing?'Lagerplatz aktualisiert':'Lagerplatz hinzugefügt');});
$('#locationList').onclick=e=>{const edit=e.target.closest('[data-location-edit]'),remove=e.target.closest('[data-location-delete]'),svgButton=e.target.closest('[data-location-svg]');if(svgButton){const location=(state.locations||[]).find(entry=>entry.id===svgButton.dataset.locationSvg);if(location)download(`Lagerplatz-${safeFileName(location.code||location.name)}.svg`,'image/svg+xml;charset=utf-8',buildLocationLabelSvg(location,locationLabelConfig()).svg);}if(edit){const location=(state.locations||[]).find(entry=>entry.id===edit.dataset.locationEdit);if(!location)return;const f=$('#locationForm');f.elements.id.value=location.id;f.elements.name.value=location.name;f.elements.code.value=location.code;f.elements.color.value=location.color||'#2563eb';f.elements.note.value=location.note||'';pendingLocationVisualSamples=Array.isArray(location.visualSamples)?location.visualSamples.map(sample=>({...sample})):[];updateVisualTrainingStatus('location');$('#saveLocation').textContent='Änderungen speichern';$('#cancelLocationEdit').hidden=false;f.elements.name.focus();}if(remove){const location=(state.locations||[]).find(entry=>entry.id===remove.dataset.locationDelete);if(!location)return;const assigned=state.items.filter(item=>String(item.location||'').toLowerCase()===location.name.toLowerCase()).length;if(!confirm(assigned?`Lagerplatz „${location.name}“ löschen und die Zuordnung bei ${assigned} Artikel(n) entfernen?`:`Lagerplatz „${location.name}“ löschen?`))return;state.items.forEach(item=>{if(String(item.location||'').toLowerCase()===location.name.toLowerCase())item.location='';});state.locations=state.locations.filter(entry=>entry.id!==location.id);save();resetLocationForm();renderLocationManager();toast('Lagerplatz gelöscht');}};
function renderDashboard(){
  const activeItems=state.items.filter(i=>!i.archived),totalValue=activeItems.reduce((s,i)=>s+i.stock*i.cost,0);
  const lows=activeItems.filter(i=>statusOf(i)==='low');
  const outs=activeItems.filter(i=>statusOf(i)==='out');
  const now=new Date(),month=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthTx=state.transactions.filter(t=>(t.type==='sale'||t.type==='return')&&t.date.startsWith(month));
  const sales=monthTx.reduce((s,t)=>s+(t.type==='return'?-1:1)*t.quantity*t.unitPrice,0);
  const profit=monthTx.reduce((s,t)=>s+(t.type==='return'?-1:1)*t.quantity*(t.unitPrice-(t.unitCost??state.items.find(i=>i.id===t.itemId)?.cost??0)),0);
  $('#stockValue').textContent=money(totalValue); $('#lowCount').textContent=lows.length; $('#outCount').textContent=outs.length;
  $('#totalUnits').textContent=number(activeItems.reduce((s,i)=>s+i.stock,0)); $('#monthSales').textContent=money(sales); $('#monthProfit').textContent=money(profit); $('#skuCount').textContent=number(activeItems.length);
  renderSalesChart();
  const alerts=[...outs,...lows].slice(0,5);
  $('#alerts').innerHTML=alerts.length?alerts.map(itemCard).join(''):empty('Alles im grünen Bereich. Keine Artikel müssen nachgekauft werden.');
  const tx=state.transactions.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  $('#recentTransactions').innerHTML=tx.length?tx.map(transactionCard).join(''):empty('Noch keine Ein- oder Verkäufe erfasst.');
  bindItemCards($('#alerts'));
  renderOrdersPreview();
}
function orderStatusLabel(status){return {ordered:'Bestellt',partial:'Teilweise da',received:'Erhalten',cancelled:'Storniert'}[status]||status;}
function orderCard(order){
  const total=order.lines.reduce((s,l)=>s+l.quantity,0),received=order.lines.reduce((s,l)=>s+(l.received||0),0);
  return `<button class="order-card" data-order="${esc(order.id)}"><span class="order-icon">▤</span><span class="order-main"><b>${esc(order.supplier||'Ohne Lieferant')}</b><small>${order.lines.length} Positionen · ${received}/${total} Teile erhalten · ${fmtDate(order.date)}</small></span><span class="order-status ${esc(order.status)}">${esc(orderStatusLabel(order.status))}</span></button>`;
}
function renderOrdersPreview(){
  const open=state.orders.filter(o=>o.status==='ordered'||o.status==='partial').sort((a,b)=>b.date.localeCompare(a.date));
  $('#openOrders').innerHTML=open.length?open.slice(0,4).map(orderCard).join(''):empty('Keine offenen Lieferantenbestellungen.');
  bindOrderCards($('#openOrders'));
}
function bindOrderCards(root){$$('[data-order]',root).forEach(el=>el.onclick=()=>openReceive(el.dataset.order));}
function renderSalesChart(){
  const months=[];
  for(let offset=5;offset>=0;offset--){
    const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-offset);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const tx=state.transactions.filter(t=>(t.type==='sale'||t.type==='return')&&t.date.startsWith(key));
    const sales=tx.reduce((s,t)=>s+(t.type==='return'?-1:1)*t.quantity*t.unitPrice,0);
    const profit=tx.reduce((s,t)=>s+(t.type==='return'?-1:1)*t.quantity*(t.unitPrice-(t.unitCost??state.items.find(i=>i.id===t.itemId)?.cost??0)),0);
    months.push({label:new Intl.DateTimeFormat('de-DE',{month:'short'}).format(d),sales,profit:Math.max(0,profit)});
  }
  const root=$('#salesChart'),hasData=months.some(month=>month.sales!==0||month.profit!==0),max=Math.max(1,...months.map(m=>Math.max(Math.abs(m.sales),Math.abs(m.profit))));
  root.classList.toggle('empty-chart',!hasData);
  root.innerHTML=hasData?months.map(m=>`<div class="chart-month" title="${esc(m.label)}: ${money(m.sales)} Umsatz, ${money(m.profit)} Rohertrag"><div class="chart-bars"><span class="chart-bar" style="height:${Math.max(3,Math.abs(m.sales)/max*100)}%"></span><span class="chart-bar profit" style="height:${Math.max(3,Math.abs(m.profit)/max*100)}%"></span></div><small>${esc(m.label)}</small></div>`).join(''):'<div class="chart-empty"><b>Noch keine Verkäufe</b><span>Nach der ersten Verkaufsbuchung erscheint hier automatisch der Monatsvergleich.</span></div>';
}
function itemCard(i){
  const st=statusOf(i); const detail=[i.sku,i.color,i.size].filter(Boolean).join(' · ')||i.category||'Textil';
  const place=[i.location,i.supplier].filter(Boolean).join(' · ');
  const avatar=i.photo?`<span class="avatar photo"><img src="${esc(i.photo)}" alt="" loading="lazy" decoding="async"></span>`:`<span class="avatar ${st}">${esc(initials(i.name))}</span>`;
  return `<button class="item-card ${i.archived?'archived-card':''}" data-item="${esc(i.id)}">${avatar}<span class="item-main"><b>${esc(i.name)} ${i.archived?'<span class="archive-badge">Archiv</span>':''}</b><small>${esc(detail)} · Min. ${number(i.minStock)}</small><span class="value-note">EK ${money(i.cost)} · Warenwert ${money(i.stock*i.cost)}</span>${place?`<span class="value-note">${esc(place)}</span>`:''}${i.tags?`<span class="value-note">${esc(i.tags)}</span>`:''}</span><span class="stock-pill ${st}">${number(i.stock)} Stk.</span></button>`;
}
function transactionCard(t){
  const type={purchase:['＋','Einkauf'],sale:['−','Verkauf'],return:['↩','Retoure'],damage:['!','Schaden'],adjustment:['±','Korrektur']}[t.type]||['±','Buchung'];
  const sign=t.type==='purchase'||t.type==='return'?'+':t.type==='sale'||t.type==='damage'?'-':'±';
  return `<div class="transaction-card"><span class="tx-icon ${esc(t.type)}">${type[0]}</span><span class="tx-main"><b>${esc(t.itemName)}</b><small>${type[1]} · ${fmtDate(t.date)}${t.note?' · '+esc(t.note):''}</small></span><span class="tx-value">${sign}${number(t.quantity)}<small>${money(t.quantity*t.unitPrice)}</small></span></div>`;
}
function renderInventory(){
  const q=$('#search').value.trim().toLowerCase();
  const matchesFilter=i=>inventoryFilter==='archived'?i.archived:!i.archived&&(inventoryFilter==='all'||statusOf(i)===inventoryFilter);
  const items=state.items.filter(i=>matchesFilter(i)&&(!q||[i.name,i.sku,i.category,i.color,i.size,i.barcode,i.supplier,i.location,i.brand,i.material,i.season,i.tags,i.description,(i.salesOptions||[]).join(' ')].join(' ').toLowerCase().includes(q))).sort((a,b)=>inventorySort==='stock-asc'?a.stock-b.stock:inventorySort==='stock-desc'?b.stock-a.stock:inventorySort==='value-desc'?(b.stock*b.cost)-(a.stock*a.cost):a.name.localeCompare(b.name,'de'));
  const visible=items.slice(0,inventoryLimit);$('#itemCount').textContent=`${items.length} Artikel`; $('#inventoryUnits').textContent=`${number(items.reduce((s,i)=>s+i.stock,0))} Teile`;
  $('#inventoryList').innerHTML=visible.length?visible.map(itemCard).join(''):empty(state.items.length?'Keine Artikel für diesen Filter.':'Noch kein Inventar. Lege deinen ersten Artikel an oder scanne eine Rechnung.');
  $('#loadMoreInventory').hidden=visible.length>=items.length;$('#loadMoreInventory').textContent=`Weitere laden (${items.length-visible.length})`;
  bindItemCards($('#inventoryList'));
}
function bindItemCards(root){ $$('[data-item]',root).forEach(el=>el.onclick=()=>openItem(el.dataset.item)); }
function renderTransactions(){
  const list=state.transactions.filter(t=>activityFilter==='all'||t.type===activityFilter).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const visible=list.slice(0,activityLimit);$('#activityList').innerHTML=visible.length?visible.map(transactionCard).join(''):empty('Für diesen Filter gibt es noch keine Buchungen.');$('#loadMoreActivity').hidden=visible.length>=list.length;$('#loadMoreActivity').textContent=`Weitere laden (${list.length-visible.length})`;
  const purchases=state.transactions.filter(t=>t.type==='purchase').reduce((s,t)=>s+t.quantity*t.unitPrice,0);
  const sales=state.transactions.filter(t=>t.type==='sale'||t.type==='return').reduce((s,t)=>s+(t.type==='return'?-1:1)*t.quantity*t.unitPrice,0);
  const profit=state.transactions.filter(t=>t.type==='sale'||t.type==='return').reduce((s,t)=>s+(t.type==='return'?-1:1)*t.quantity*(t.unitPrice-(t.unitCost??state.items.find(i=>i.id===t.itemId)?.cost??0)),0);
  $('#activitySummary').innerHTML=`<div><b>${money(purchases)}</b><small>Einkäufe gesamt</small></div><div><b>${money(sales)}</b><small>Verkäufe gesamt</small></div><div><b>${money(profit)}</b><small>Rohertrag</small></div>`;
  $('#undoLatest').hidden=!state.transactions.length;
  renderAbcAnalysis();
}
function renderAbcAnalysis(){const cutoff=Date.now()-90*86400000,revenue=new Map();state.transactions.filter(t=>(t.type==='sale'||t.type==='return')&&new Date(t.date).getTime()>=cutoff).forEach(t=>revenue.set(t.itemId,(revenue.get(t.itemId)||0)+(t.type==='return'?-1:1)*t.quantity*t.unitPrice));const ranked=[...revenue.entries()].map(([id,value])=>({id,value:Math.max(0,value)})).sort((a,b)=>b.value-a.value),total=ranked.reduce((s,x)=>s+x.value,0);let cumulative=0;const groups={A:[],B:[],C:[]};ranked.forEach(x=>{const before=total?cumulative/total:1,grade=before<.8?'A':before<.95?'B':'C';groups[grade].push(x);cumulative+=x.value;});const unsold=state.items.filter(i=>!i.archived&&!revenue.has(i.id)).length;$('#abcAnalysis').innerHTML=['A','B','C'].map(g=>{const value=groups[g].reduce((s,x)=>s+x.value,0),extra=g==='C'&&unsold?` · ${unsold} ohne Verkauf`:'';return `<div class="abc-group ${g.toLowerCase()}"><strong>${g}</strong><b>${groups[g].length} Artikel</b><small>${money(value)}${extra}</small></div>`;}).join('');}
function renderSnapshotInfo(){const latest=state.snapshots?.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];$('#snapshotInfo').textContent=latest?`Letzte Momentaufnahme: ${fmtDate(latest.date)} · ${number(latest.totalUnits)} Teile · ${money(latest.value)}`:'Noch keine Momentaufnahme gespeichert.';}
$('#createSnapshot').onclick=()=>{const active=state.items.filter(i=>!i.archived),snapshot={id:uid(),date:new Date().toISOString(),itemCount:active.length,totalUnits:active.reduce((s,i)=>s+i.stock,0),value:active.reduce((s,i)=>s+i.stock*i.cost,0)};state.snapshots.push(snapshot);if(state.snapshots.length>24)state.snapshots=state.snapshots.slice(-24);save();toast('Speichersparende Inventar-Momentaufnahme gespeichert');};
function fillItemSelect(){
  const select=$('#transactionItem'),current=select.value;
  const active=state.items.filter(i=>!i.archived);select.innerHTML=active.length?active.slice().sort((a,b)=>a.name.localeCompare(b.name,'de')||String(a.color||'').localeCompare(String(b.color||''),'de')||String(a.size||'').localeCompare(String(b.size||''),'de')).map(i=>`<option value="${esc(i.id)}">${esc([i.name,i.color,i.size,i.sku].filter(Boolean).join(' · '))} · Bestand ${number(i.stock)}</option>`).join(''):'<option value="">Zuerst Artikel anlegen</option>';
  if(state.items.some(i=>i.id===current)) select.value=current;
}

function navigate(page){
  $$('.page').forEach(p=>p.classList.toggle('active',p.dataset.page===page));
  $$('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===page));
  $('#pageTitle').textContent=pageTitles[page]; window.scrollTo({top:0,behavior:'smooth'});
}
function openItem(id){
  const f=$('#itemForm'),item=state.items.find(i=>i.id===id);
  f.reset();f.querySelector('[type="submit"]').disabled=false; f.elements.id.value=item?.id||''; f.elements.name.value=item?.name||''; f.elements.sku.value=item?.sku||''; f.elements.category.value=item?.category||'';
  f.elements.color.value=item?.color||''; f.elements.size.value=item?.size||''; f.elements.supplier.value=item?.supplier||''; f.elements.location.value=item?.location||''; f.elements.barcode.value=item?.barcode||''; f.elements.stock.value=item?.stock??0; f.elements.minStock.value=item?.minStock??5; f.elements.cost.value=item?.cost??0; f.elements.salePrice.value=item?.salePrice??0;f.elements.onlinePrice.value=item?.onlinePrice??0;f.elements.marketPrice.value=item?.marketPrice??0;f.elements.wholesalePrice.value=item?.wholesalePrice??0;f.elements.specialPriceName.value=item?.specialPriceName||'';f.elements.specialPrice.value=item?.specialPrice??0;
  f.elements.brand.value=item?.brand||'';f.elements.material.value=item?.material||'';$('#materialPreset').value=(state.materials||[]).includes(item?.material)?item.material:'';f.elements.season.value=item?.season||'';f.elements.unit.value=item?.unit||'Stück';f.elements.tags.value=item?.tags||'';f.elements.description.value=item?.description||'';
  const salesOptions=Array.isArray(item?.salesOptions)?item.salesOptions:[];$$('[name="salesOption"]',f).forEach(input=>input.checked=salesOptions.includes(input.value));f.elements.salesOptionsCustom.value=salesOptions.filter(option=>!STANDARD_SALES_OPTIONS.includes(option)).join(', ');
  pendingItemPhoto=item?.photo||'';pendingItemVisualSamples=Array.isArray(item?.visualSamples)?item.visualSamples.map(sample=>({...sample})):[]; $('#itemPhotoPreview').src=pendingItemPhoto||'icon.svg'; $('#removeItemPhoto').hidden=!pendingItemPhoto; $('#itemPhoto').value='';updateVisualTrainingStatus('item');
  $('#variantBuilder').hidden=!!item;$('#variantBuilder').open=false;updateVariantCount();
  $('#itemDialogTitle').textContent=item?'Artikel bearbeiten':'Neuer Artikel'; $('#deleteItem').hidden=!item;$('#archiveItem').hidden=!item;$('#archiveItem').textContent=item?.archived?'Artikel reaktivieren':'Artikel archivieren'; $('#itemDialog').showModal();updateItemBarcodePreview();updateItemCostValue();
}
function openTransaction(itemId=''){
  if(!state.items.some(i=>!i.archived)){ openItem(); toast('Lege zuerst einen aktiven Artikel an'); return; }
  const f=$('#transactionForm'); f.reset(); fillItemSelect(); if(itemId) f.elements.itemId.value=itemId; const now=new Date(); f.elements.date.value=new Date(now-now.getTimezoneOffset()*60000).toISOString().slice(0,16);updateTransactionPrice(); $('#transactionDialog').showModal();
}
function priceForItem(item,type='standard'){if(!item)return 0;const values={standard:+item.salePrice||0,online:+item.onlinePrice||0,market:+item.marketPrice||0,wholesale:+item.wholesalePrice||0,special:+item.specialPrice||0};return values[type]||values.standard||0;}
function updateTransactionPrice(){const f=$('#transactionForm'),item=state.items.find(i=>i.id===f.elements.itemId.value),type=f.elements.type.value,select=$('#transactionPriceType'),current=select.value||'standard',options=[['standard','Standard-/Ladenpreis',item?.salePrice],['online','Onlineshoppreis',item?.onlinePrice],['market','Markt-/Eventpreis',item?.marketPrice],['wholesale','Großhandel/B2B',item?.wholesalePrice],['special',item?.specialPriceName||'Sonderpreis',item?.specialPrice]].filter(([key,,price])=>key==='standard'||+price>0);select.innerHTML=options.map(([key,label,price])=>`<option value="${key}">${esc(label)} · ${money(price||item?.salePrice||0)}</option>`).join('');select.value=options.some(([key])=>key===current)?current:'standard';const selling=type==='sale'||type==='return',adjustment=type==='adjustment';$('#transactionPriceTypeWrap').hidden=!selling;f.elements.quantity.min=adjustment?'0':'1';$('#transactionQuantityLabel').textContent=adjustment?'Neuer Gesamtbestand':'Menge';f.elements.unitPrice.value=selling?priceForItem(item,select.value):type==='purchase'?(+item?.cost||0):0;$('#transactionPriceHelp').textContent=adjustment?'Die Zahl ersetzt den aktuellen Bestand; auch 0 ist möglich.':selling?`Automatisch: ${money(f.elements.unitPrice.value)}. Der Betrag kann manuell geändert werden.`:'Bei Einkauf wird automatisch der Einkaufspreis vorgeschlagen.';}
$('#transactionItem').addEventListener('change',updateTransactionPrice);$('#transactionForm').elements.type.addEventListener('change',updateTransactionPrice);$('#transactionPriceType').addEventListener('change',updateTransactionPrice);
function updateItemCostValue(){const f=$('#itemForm'),stock=Number(f.elements.stock.value)||0,cost=Number(f.elements.cost.value)||0;$('#itemCostValue').textContent=money(stock*cost);}
$('#itemForm').elements.stock.addEventListener('input',updateItemCostValue);$('#itemForm').elements.cost.addEventListener('input',updateItemCostValue);
function variantValues(value){return [...new Set(String(value||'').split(/[,;\n]+/).map(v=>v.trim()).filter(Boolean))];}
function updateVariantCount(){const colors=variantValues($('#variantColors').value),sizes=variantValues($('#variantSizes').value),count=(colors.length||1)*(sizes.length||1);$('#variantCount').textContent=colors.length||sizes.length?`${count} Variante(n) werden angelegt. Bestand und Preise gelten jeweils pro Variante.`:'Keine Variantenliste eingegeben.';}
$('#variantColors').addEventListener('input',updateVariantCount);$('#variantSizes').addEventListener('input',updateVariantCount);
const SIZE_SCALE=['XXS','XS','S','M','L','XL','XXL','3XL','4XL','5XL'];
function setVariantSizes(values){$('#variantSizes').value=variantValues(values).join(', ');updateVariantCount();}
$('#applySizeRange').onclick=()=>{const from=SIZE_SCALE.indexOf($('#sizeRangeFrom').value),to=SIZE_SCALE.indexOf($('#sizeRangeTo').value);if(from<0||to<0)return;const start=Math.min(from,to),end=Math.max(from,to);setVariantSizes(SIZE_SCALE.slice(start,end+1));toast(`${end-start+1} Größen übernommen`);};
$$('[data-size-preset]').forEach(button=>button.onclick=()=>{setVariantSizes(button.dataset.sizePreset);toast('Größenvorlage übernommen');});

function skuPart(value,length=3){return String(value||'').trim().toUpperCase().replace(/\u00c4/g,'AE').replace(/\u00d6/g,'OE').replace(/\u00dc/g,'UE').replace(/\u00df/g,'SS').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,'').slice(0,length);}
const TEXTILE_TYPES=[
  {code:'HM',label:'Hemden',match:/\b(hemd|businesshemd|button[ -]?down|dress[ -]?shirt)\b/i},{code:'TS',label:'T-Shirts',match:/\b(t[ -]?shirt|tee|shirt)\b/i},{code:'HD',label:'Hoodies',match:/\b(hoodie|kapuzenpullover|kapuzenjacke)\b/i},
  {code:'SW',label:'Sweatshirts',match:/\b(sweatshirt|sweater|pullover)\b/i},{code:'JK',label:'Jacken',match:/\b(jacke|jacket|blouson|parka)\b/i},
  {code:'HS',label:'Hosen',match:/\b(hose|pants|jogger|jogginghose|jeans)\b/i},{code:'SH',label:'Shorts',match:/\b(shorts|short)\b/i},
  {code:'PO',label:'Poloshirts',match:/\b(polo|poloshirt)\b/i},
  {code:'KL',label:'Kleider',match:/\b(kleid|dress)\b/i},{code:'RO',label:'Röcke',match:/\b(rock|skirt)\b/i},
  {code:'MU',label:'Mützen',match:/\b(muetze|mutze|beanie|cap|kappe)\b/i},{code:'SO',label:'Socken',match:/\b(socken|sock)\b/i},
  {code:'UW',label:'Unterwäsche',match:/\b(unterwaesche|unterwasche|boxer|slip|bh)\b/i},{code:'AC',label:'Accessoires',match:/\b(accessoire|tasche|guertel|gurtel|schal)\b/i}
];
function normalizedText(value){return String(value||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function detectTextileType(values={}){const text=normalizedText(`${values.category||''} ${values.name||''}`),managed=(state.categories||[]).find(c=>normalizedText(c.name)===normalizedText(values.category));if(managed){const known=TEXTILE_TYPES.find(type=>type.code===skuPart(managed.prefix,5)||normalizedText(type.label)===normalizedText(managed.name));return{code:skuPart(managed.prefix,5)||skuPart(managed.name),label:managed.name,match:known?.match||null};}return TEXTILE_TYPES.find(type=>type.match.test(text))||{code:skuPart(values.category||values.name)||'ART',label:String(values.category||'Textilien').trim()||'Textilien',match:null};}
function textileModelPart(name,type){let text=normalizedText(name);if(type.match)text=text.replace(type.match,' ');const words=text.match(/[a-z0-9]+/g)||[];return skuPart(words.find(word=>word.length>1)||name);}
function createTextileSku(values={},ignoreId=''){const type=detectTextileType(values),model=textileModelPart(values.name,type),color=skuPart(values.color),size=skuPart(values.size,4),base=[type.code,model,color,size].filter(Boolean).join('-')||'ART',used=new Set(state.items.filter(i=>i.id!==ignoreId).map(i=>String(i.sku||'').toUpperCase()));let sequence=1,candidate;do{candidate=`${base}-${String(sequence++).padStart(3,'0')}`;}while(used.has(candidate));return candidate;}
function textileSkuFromForm(){const f=$('#itemForm'),values={name:f.elements.name.value,category:f.elements.category.value,color:f.elements.color.value,size:f.elements.size.value},type=detectTextileType(values);if(!f.elements.category.value.trim())f.elements.category.value=type.label;return createTextileSku({...values,category:f.elements.category.value},f.elements.id.value);}
$('#generateSku').onclick=()=>{const f=$('#itemForm'),input=f.elements.sku;if(!f.elements.name.value.trim()&&!f.elements.category.value.trim()){toast('Bitte zuerst Artikelname oder Kategorie eintragen');f.elements.name.focus();return;}if(input.value.trim()&&!confirm('Vorhandene Artikelnummer ersetzen?'))return;input.value=textileSkuFromForm();toast('Eindeutige Artikelnummer erzeugt');};

$('#itemForm').addEventListener('submit',e=>{
  e.preventDefault();const f=e.currentTarget,submit=f.querySelector('[type="submit"]');if(submit.disabled)return;submit.disabled=true;if(!f.elements.sku.value.trim())f.elements.sku.value=textileSkuFromForm();const fd=new FormData(f),id=fd.get('id')||uid(); const existing=state.items.find(i=>i.id===id);
  const salesOptions=[...new Set([...fd.getAll('salesOption').map(String),...variantValues(fd.get('salesOptionsCustom'))])],onlinePrice=+fd.get('onlinePrice')||0,marketPrice=+fd.get('marketPrice')||0,wholesalePrice=+fd.get('wholesalePrice')||0,specialPrice=+fd.get('specialPrice')||0,specialPriceName=String(fd.get('specialPriceName')||'').trim();if(onlinePrice&&!salesOptions.includes('Onlineshop'))salesOptions.push('Onlineshop');if(marketPrice&&!salesOptions.includes('Markt / Veranstaltung'))salesOptions.push('Markt / Veranstaltung');if(wholesalePrice&&!salesOptions.includes('Großhandel / B2B'))salesOptions.push('Großhandel / B2B');
  const item={id,name:fd.get('name').trim(),sku:fd.get('sku').trim(),category:fd.get('category').trim(),color:fd.get('color').trim(),size:fd.get('size').trim(),supplier:fd.get('supplier').trim(),location:fd.get('location').trim(),brand:fd.get('brand').trim(),material:fd.get('material').trim(),season:fd.get('season').trim(),unit:fd.get('unit').trim()||'Stück',tags:fd.get('tags').trim(),description:fd.get('description').trim(),salesOptions,barcode:fd.get('barcode').trim(),photo:pendingItemPhoto,visualSamples:pendingItemVisualSamples.slice(-6),archived:existing?.archived||false,stock:+fd.get('stock'),minStock:+fd.get('minStock'),cost:+fd.get('cost'),salePrice:+fd.get('salePrice'),onlinePrice,marketPrice,wholesalePrice,specialPriceName,specialPrice};
  const enteredColors=variantValues($('#variantColors').value),enteredSizes=variantValues($('#variantSizes').value),batchMode=!existing&&(enteredColors.length||enteredSizes.length),colors=enteredColors.length?enteredColors:[item.color],sizes=enteredSizes.length?enteredSizes:[item.size],variantCount=colors.length*sizes.length;
  if(batchMode&&variantCount>60){submit.disabled=false;alert(`Das wären ${variantCount} Varianten. Bitte höchstens 60 Varianten auf einmal anlegen.`);return;}
  if(batchMode){const duplicateVariant=state.items.find(saved=>saved.name.toLowerCase()===item.name.toLowerCase()&&colors.some(color=>color.toLowerCase()===String(saved.color||'').toLowerCase())&&sizes.some(size=>size.toLowerCase()===String(saved.size||'').toLowerCase()));if(duplicateVariant){submit.disabled=false;alert(`Die Variante ${duplicateVariant.color||'ohne Farbe'} / ${duplicateVariant.size||'ohne Größe'} existiert bereits.`);return;}}
  if(!batchMode&&!item.barcode)item.barcode=createInternalEan();
  const duplicateBarcode=item.barcode&&state.items.find(i=>i.id!==id&&i.barcode===item.barcode),duplicateSku=item.sku&&state.items.find(i=>i.id!==id&&String(i.sku||'').toLowerCase()===item.sku.toLowerCase());if(duplicateBarcode){submit.disabled=false;alert(`Dieser Barcode ist bereits „${duplicateBarcode.name}“ zugeordnet.`);return;}if(duplicateSku){submit.disabled=false;alert(`Diese SKU wird bereits für „${duplicateSku.name}“ verwendet.`);return;}
  const oldItem=existing?{...existing}:null,oldItems=state.items.slice(),oldTransactions=state.transactions.slice(),oldCategories=state.categories.slice(),oldBrands=state.brands.slice(),oldMaterials=state.materials.slice(),oldLocations=(state.locations||[]).map(location=>({...location}));
  ensureCategory(item.category);
  ensureBrand(item.brand);
  ensureMaterial(item.material);
  ensureLocation(item.location);
  let created=1;
  const recordInitialStock=variant=>{if(variant.stock>0)state.transactions.push({id:uid(),itemId:variant.id,itemName:variant.name,type:'adjustment',quantity:variant.stock,unitPrice:0,unitCost:variant.cost,stockBefore:0,stockAfter:variant.stock,note:'Anfangsbestand beim Anlegen',date:new Date().toISOString()});};
  if(existing){Object.assign(existing,item);if(oldItem.stock!==item.stock)state.transactions.push({id:uid(),itemId:item.id,itemName:item.name,type:'adjustment',quantity:Math.abs(item.stock-oldItem.stock),unitPrice:0,unitCost:item.cost,stockBefore:oldItem.stock,stockAfter:item.stock,note:'Bestand im Artikel geändert',date:new Date().toISOString()});}
  else if(batchMode){created=variantCount;for(const color of colors)for(const size of sizes){const variant={...item,id:uid(),color,size,sku:'',barcode:'',photo:'',visualSamples:[]};variant.sku=createTextileSku(variant);variant.barcode=createInternalEan();state.items.push(variant);recordInitialStock(variant);}}
  else{state.items.push(item);recordInitialStock(item);}
  if(!persistState()){
    state.items=oldItems;state.transactions=oldTransactions;if(existing)Object.assign(existing,oldItem);
    state.categories=oldCategories;state.brands=oldBrands;state.materials=oldMaterials;state.locations=oldLocations;submit.disabled=false;return;
  }
  $('#itemDialog').close();submit.disabled=false;toast(existing?'Artikel aktualisiert':created>1?`${created} Varianten angelegt`:'Artikel angelegt');requestAnimationFrame(renderAll);
});
$('#itemPhoto').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{pendingItemPhoto=await compressImage(file);$('#itemPhotoPreview').src=pendingItemPhoto;$('#removeItemPhoto').hidden=false;const sample=await createVisualFingerprint(file);pendingItemVisualSamples=appendUniqueVisualSample(pendingItemVisualSamples,sample,6);updateVisualTrainingStatus('item');}catch{alert('Das Foto konnte nicht verarbeitet werden.');}};
$('#removeItemPhoto').onclick=()=>{pendingItemPhoto='';$('#itemPhotoPreview').src='icon.svg';$('#removeItemPhoto').hidden=true;};
function compressImage(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const max=420,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.72));};img.onerror=()=>{URL.revokeObjectURL(url);reject();};img.src=url;});}
$('#deleteItem').onclick=()=>{
  const id=$('#itemForm').elements.id.value,item=state.items.find(i=>i.id===id); if(!item||!confirm(`„${item.name}“ wirklich löschen? Der Buchungsverlauf bleibt erhalten.`)) return;
  state.items=state.items.filter(i=>i.id!==id); save(); $('#itemDialog').close(); toast('Artikel gelöscht');
};
$('#archiveItem').onclick=()=>{const id=$('#itemForm').elements.id.value,item=state.items.find(i=>i.id===id);if(!item)return;if(!item.archived&&item.stock>0&&!confirm(`„${item.name}“ hat noch ${item.stock} Stück Bestand. Trotzdem archivieren?`))return;item.archived=!item.archived;save();$('#itemDialog').close();toast(item.archived?'Artikel archiviert':'Artikel reaktiviert');};
$('#transactionForm').addEventListener('submit',e=>{
  e.preventDefault(); const fd=new FormData(e.currentTarget),item=state.items.find(i=>i.id===fd.get('itemId')),type=fd.get('type'),qty=+fd.get('quantity'); if(!item||qty<0||(type!=='adjustment'&&qty<=0))return;if(type==='adjustment'&&qty===item.stock){toast('Der Bestand ist bereits auf diesem Wert');return;}
  if((type==='sale'||type==='damage')&&qty>item.stock){alert(`Nur ${item.stock} Stück verfügbar. Bitte höchstens diesen Bestand ausbuchen oder zuerst einen Wareneingang erfassen.`);return;}
  const stockBefore=item.stock,costBefore=item.cost,transactionCount=state.transactions.length;
  if(type==='purchase'||type==='return') item.stock+=qty; else if(type==='sale'||type==='damage') item.stock=Math.max(0,item.stock-qty); else item.stock=qty;
  const priceType=String(fd.get('priceType')||'standard'),unitPrice=+fd.get('unitPrice')||((type==='sale'||type==='return')?priceForItem(item,priceType):item.cost);
  const unitCost=item.cost;
  if(type==='purchase'&&unitPrice>0)item.cost=unitPrice;
  const chosenDate=fd.get('date');
  state.transactions.push({id:uid(),itemId:item.id,itemName:item.name,type,quantity:type==='adjustment'?Math.abs(item.stock-stockBefore):qty,unitPrice,unitCost,costBefore,priceType,stockBefore,stockAfter:item.stock,note:fd.get('note').trim(),date:chosenDate?new Date(chosenDate).toISOString():new Date().toISOString()});
  if(!persistState()){item.stock=stockBefore;item.cost=costBefore;state.transactions.length=transactionCount;return;}
  renderAll();$('#transactionDialog').close();toast('Buchung gespeichert');
});

$$('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
$$('[data-goto]').forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
$$('[data-filter-link]').forEach(b=>b.onclick=()=>{inventoryFilter=b.dataset.filterLink;inventoryLimit=100;syncFilterChips();navigate('inventory');renderInventory();});
$('#quickAdd').onclick=()=>openTransaction(); $('#addItem').onclick=()=>openItem(); $('#search').oninput=()=>{inventoryLimit=100;renderInventory();};
$('#voiceAdd').onclick=()=>openVoice();
$('#quickPurchase').onclick=()=>{openTransaction();if(state.items.length){$('#transactionForm').elements.type.value='purchase';updateTransactionPrice();}};
$('#quickSale').onclick=()=>{openTransaction();if(state.items.length){$('#transactionForm').elements.type.value='sale';updateTransactionPrice();}};
$('#openReorder').onclick=$('#inventoryReorder').onclick=openReorder;
$('#openStocktake').onclick=$('#inventoryStocktake').onclick=openStocktake;
$('#inventorySort').onchange=e=>{inventorySort=e.target.value;renderInventory();};
$('#loadMoreInventory').onclick=()=>{inventoryLimit+=100;renderInventory();};
$('#loadMoreActivity').onclick=()=>{activityLimit+=150;renderTransactions();};
$('#filterToggle').onclick=()=>$('#filters').scrollIntoView({behavior:'smooth',block:'center'});
$$('[data-filter]').forEach(b=>b.onclick=()=>{inventoryFilter=b.dataset.filter;inventoryLimit=100;syncFilterChips();renderInventory();});
function syncFilterChips(){ $$('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===inventoryFilter)); }
$$('[data-activity]').forEach(b=>b.onclick=()=>{activityFilter=b.dataset.activity;activityLimit=150;$$('[data-activity]').forEach(x=>x.classList.toggle('active',x===b));renderTransactions();});

function openReorder(){
  const items=state.items.filter(i=>!i.archived&&statusOf(i)!=='ok').sort((a,b)=>(a.supplier||'').localeCompare(b.supplier||'','de')||a.name.localeCompare(b.name,'de'));
  $('#reorderRows').innerHTML=items.length?items.map(i=>{const suggested=Math.max(1,i.minStock*2-i.stock);return `<div class="planning-row" data-reorder="${esc(i.id)}"><span><b>${esc(i.name)}</b><small>${esc(i.supplier||'Kein Lieferant')} · Bestand ${number(i.stock)} · Min. ${number(i.minStock)}</small></span><input type="number" min="0" step="1" value="${suggested}" aria-label="Bestellmenge ${esc(i.name)}"></div>`;}).join(''):empty('Aktuell muss nichts nachbestellt werden.');
  $('#reorderForm').querySelector('button[type="submit"]').disabled=!items.length;
  $('#reorderDialog').showModal();
}
function reorderData(){
  return $$('[data-reorder]','#reorderRows').map(row=>({item:state.items.find(i=>i.id===row.dataset.reorder),quantity:+$('input',row).value})).filter(x=>x.item&&x.quantity>0);
}
$('#reorderForm').addEventListener('submit',e=>{
  e.preventDefault(); const rows=reorderData(); if(!rows.length){toast('Keine Bestellmenge eingetragen');return;}
  const groups=new Map();rows.forEach(entry=>{const supplier=entry.item.supplier||'Ohne Lieferant';if(!groups.has(supplier))groups.set(supplier,[]);groups.get(supplier).push(entry);});
  const date=new Date().toISOString();groups.forEach((entries,supplier)=>state.orders.push({id:uid(),supplier,date,status:'ordered',lines:entries.map(({item,quantity})=>({itemId:item.id,itemName:item.name,quantity,received:0,unitCost:item.cost}))}));
  save();$('#reorderDialog').close();toast(`${groups.size} Bestellung${groups.size===1?'':'en'} angelegt`);
});
$('#exportReorder').onclick=()=>{
  const rows=reorderData(); if(!rows.length){toast('Keine Bestellmenge eingetragen');return;}
  const data=[['Lieferant','Artikel','SKU','Barcode','Bestellmenge','EK'],...rows.map(({item,quantity})=>[item.supplier,item.name,item.sku,item.barcode,quantity,item.cost])];
  download(`HP67-Nachbestellung-${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8','\ufeff'+data.map(r=>r.map(csvCell).join(';')).join('\r\n'));
};
function createReorderPdf(openForPrint=false){const rows=reorderData();if(!rows.length){toast('Keine Bestellmenge eingetragen');return;}if(!window.jspdf?.jsPDF){alert('PDF-Modul konnte nicht geladen werden.');return;}const popup=openForPrint?window.open('','_blank'):null;if(openForPrint&&!popup){alert('Das PDF-Fenster wurde blockiert. Bitte Pop-ups für diese App erlauben.');return;}try{const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),date=new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date()),total=rows.reduce((sum,{item,quantity})=>sum+item.cost*quantity,0);doc.setFontSize(18);doc.text('HP67 Nachbestellliste',14,15);doc.setFontSize(9);doc.text(`Erstellt: ${date} · ${rows.length} Positionen · Bestellwert ${money(total)}`,14,21);doc.autoTable({startY:26,head:[['Lieferant','Artikelbezeichnung','SKU','Farbe / Größe','Barcode','Bestand','Min.','Bestellen','EK','Summe']],body:rows.map(({item,quantity})=>[item.supplier||'–',item.name,item.sku||'–',[item.color,item.size].filter(Boolean).join(' / ')||'–',item.barcode||'–',item.stock,item.minStock,quantity,money(item.cost),money(item.cost*quantity)]),styles:{fontSize:7,cellPadding:1.8,overflow:'linebreak'},columnStyles:{1:{cellWidth:38},4:{cellWidth:30}},headStyles:{fillColor:[16,24,39]},alternateRowStyles:{fillColor:[245,247,249]},didDrawPage:()=>{doc.setFontSize(7);doc.text(`HP67 Inventar · Seite ${doc.internal.getNumberOfPages()}`,14,202);}});if(openForPrint){if(typeof doc.autoPrint==='function')doc.autoPrint();popup.location.href=doc.output('bloburl');toast('PDF zum Drucken geöffnet');}else{doc.save(`HP67-Nachbestellung-${new Date().toISOString().slice(0,10)}.pdf`);toast('Nachbestellliste als PDF gespeichert');}}catch(err){if(popup)popup.close();alert(`PDF konnte nicht erstellt werden: ${err.message||err}`);}}
$('#exportReorderPdf').onclick=()=>createReorderPdf(false);$('#printReorder').onclick=()=>createReorderPdf(true);

$('#showAllOrders').onclick=()=>{
  const orders=state.orders.slice().sort((a,b)=>b.date.localeCompare(a.date));
  $('#ordersList').innerHTML=orders.length?orders.map(orderCard).join(''):empty('Noch keine Lieferantenbestellungen vorhanden.');bindOrderCards($('#ordersList'));$('#ordersDialog').showModal();
};
function openReceive(orderId){
  const order=state.orders.find(o=>o.id===orderId);if(!order)return;if(order.status==='received'||order.status==='cancelled'){toast(`Bestellung ist bereits ${orderStatusLabel(order.status).toLowerCase()}`);return;}
  if($('#ordersDialog').open)$('#ordersDialog').close();const f=$('#receiveForm');f.elements.orderId.value=order.id;$('#receiveTitle').textContent=`Wareneingang · ${order.supplier}`;$('#receiveMeta').textContent=`Bestellt am ${fmtDate(order.date)}. Teilmengen sind möglich.`;
  $('#receiveRows').innerHTML=order.lines.map(line=>{const remaining=Math.max(0,line.quantity-(line.received||0)),item=state.items.find(entry=>entry.id===line.itemId),variant=[item?.color,item?.size,item?.sku,item?.location].filter(Boolean).join(' · ');return `<div class="planning-row" data-receive="${esc(line.itemId)}"><span><b>${esc(line.itemName)}</b><small>${variant?`${esc(variant)} · `:''}Bestellt ${line.quantity} · erhalten ${line.received||0} · offen ${remaining}</small></span><input type="number" min="0" max="${remaining}" step="1" value="${remaining}" aria-label="Eingang ${esc(line.itemName)}"></div>`;}).join('');$('#receiveDialog').showModal();
}
$('#receiveForm').addEventListener('submit',e=>{
  e.preventDefault();const order=state.orders.find(o=>o.id===e.currentTarget.elements.orderId.value);if(!order)return;let receivedCount=0;const date=new Date().toISOString();
  $$('[data-receive]','#receiveRows').forEach(row=>{const line=order.lines.find(l=>l.itemId===row.dataset.receive),qty=+$('input',row).value,remaining=line?line.quantity-(line.received||0):0;if(!line||qty<=0)return;if(qty>remaining){alert(`Bei ${line.itemName} sind nur ${remaining} Stück offen.`);return;}const item=state.items.find(i=>i.id===line.itemId);if(!item)return;const stockBefore=item.stock,costBefore=item.cost;item.stock+=qty;if(line.unitCost>0)item.cost=line.unitCost;line.received=(line.received||0)+qty;state.transactions.push({id:uid(),itemId:item.id,itemName:item.name,type:'purchase',quantity:qty,unitPrice:line.unitCost,unitCost:costBefore,costBefore,stockBefore,stockAfter:item.stock,orderId:order.id,orderLineItemId:line.itemId,note:`Wareneingang · ${order.supplier}`,date});receivedCount+=qty;});
  if(!receivedCount){toast('Keine Eingangsmenge eingetragen');return;}const complete=order.lines.every(l=>(l.received||0)>=l.quantity);order.status=complete?'received':'partial';order.updatedAt=date;save();$('#receiveDialog').close();toast(`${receivedCount} Teile als Wareneingang gebucht`);
});
$('#cancelOrder').onclick=()=>{const order=state.orders.find(o=>o.id===$('#receiveForm').elements.orderId.value);if(!order||!confirm(`Bestellung bei „${order.supplier}“ stornieren? Bereits gebuchte Eingänge bleiben erhalten.`))return;order.status='cancelled';order.updatedAt=new Date().toISOString();save();$('#receiveDialog').close();toast('Bestellung storniert');};

function openStocktake(){
  if(!state.items.some(i=>!i.archived)){toast('Noch keine aktiven Artikel für die Inventur');return;}
  $('#stocktakeSearch').value='';
  $('#stocktakeRows').innerHTML=state.items.filter(i=>!i.archived).slice().sort((a,b)=>(a.location||'').localeCompare(b.location||'','de')||a.name.localeCompare(b.name,'de')).map(i=>`<div class="planning-row" data-stocktake="${esc(i.id)}" data-search="${esc([i.name,i.sku,i.location,i.barcode].join(' ').toLowerCase())}"><span><b>${esc(i.name)}</b><small>${esc(i.location||'Ohne Lagerplatz')} · Soll ${number(i.stock)}</small></span><input type="number" min="0" step="1" value="${i.stock}" aria-label="Gezählter Bestand ${esc(i.name)}"></div>`).join('');
  $('#stocktakeDialog').showModal();
}
$('#stocktakeSearch').oninput=e=>{$$('[data-stocktake]','#stocktakeRows').forEach(row=>row.hidden=!row.dataset.search.includes(e.target.value.trim().toLowerCase()));};
$('#stocktakeForm').addEventListener('submit',e=>{
  e.preventDefault();let changes=0;const date=new Date().toISOString();
  $$('[data-stocktake]','#stocktakeRows').forEach(row=>{const item=state.items.find(i=>i.id===row.dataset.stocktake),counted=+$('input',row).value;if(item&&counted!==item.stock){const stockBefore=item.stock;item.stock=counted;state.transactions.push({id:uid(),itemId:item.id,itemName:item.name,type:'adjustment',quantity:Math.abs(counted-stockBefore),unitPrice:0,unitCost:item.cost,stockBefore,stockAfter:counted,note:`Inventur: ${stockBefore} → ${counted}`,date});changes++;}});
  save();$('#stocktakeDialog').close();toast(changes?`${changes} Bestände korrigiert`:'Inventur ohne Abweichungen');
});

$('#undoLatest').onclick=()=>{
  if(!state.transactions.length)return;const sorted=state.transactions.slice().sort((a,b)=>b.date.localeCompare(a.date));const tx=sorted[0];const item=state.items.find(i=>i.id===tx.itemId);
  if(!item){alert('Der zugehörige Artikel existiert nicht mehr. Die Buchung kann nicht automatisch rückgängig gemacht werden.');return;}
  const laterForItem=state.transactions.some(t=>t.itemId===tx.itemId&&t.id!==tx.id&&t.date>tx.date);if(laterForItem){alert('Für diesen Artikel gibt es bereits eine spätere Buchung. Bitte den Bestand über eine Korrektur ändern.');return;}
  if(!confirm(`Letzte Buchung für „${tx.itemName}“ rückgängig machen?`))return;
  if(Number.isFinite(tx.stockBefore))item.stock=tx.stockBefore;else if(tx.type==='purchase'||tx.type==='return')item.stock=Math.max(0,item.stock-tx.quantity);else if(tx.type==='sale'||tx.type==='damage')item.stock+=tx.quantity;else{alert('Diese ältere Korrekturbuchung kann nicht automatisch zurückgesetzt werden.');return;}
  if(Number.isFinite(tx.costBefore))item.cost=tx.costBefore;
  if(tx.orderId){const order=state.orders.find(entry=>entry.id===tx.orderId),line=order?.lines.find(entry=>entry.itemId===(tx.orderLineItemId||tx.itemId));if(!order||!line){alert('Die zugehörige Bestellung ist nicht mehr vollständig vorhanden. Rückgängig wurde abgebrochen.');state=loadState();renderAll();return;}line.received=Math.max(0,(line.received||0)-tx.quantity);if(order.status!=='cancelled')order.status=order.lines.every(entry=>(entry.received||0)>=entry.quantity)?'received':order.lines.some(entry=>(entry.received||0)>0)?'partial':'ordered';order.updatedAt=new Date().toISOString();}
  state.transactions=state.transactions.filter(t=>t.id!==tx.id);save();toast('Buchung rückgängig gemacht');
};

function inventoryItemDescriptor(item){return[item.name,item.color,item.size,item.sku].filter(Boolean).join(' · ');}
function inventoryItemCandidates(value){
  const raw=safeText(value),code=raw.toLowerCase(),compact=value=>normalizedText(value).replace(/[^a-z0-9]/g,''),query=compact(raw);
  const byCode=state.items.filter(item=>(item.sku&&item.sku.toLowerCase()===code)||(item.barcode&&item.barcode.toLowerCase()===code));if(byCode.length)return byCode;
  const byDescriptor=state.items.filter(item=>compact([item.name,item.color,item.size].filter(Boolean).join(' '))===query);if(byDescriptor.length)return byDescriptor;
  return state.items.filter(item=>compact(item.name)===query);
}
function ambiguousInventoryMessage(entries){return entries.slice(0,6).map(inventoryItemDescriptor).join('\n');}

function openVoice(){
  $('#voiceTranscript').value='';$('#voiceRows').innerHTML='';$('#voiceMode').value='purchase';$('#voiceStatus').textContent='Tippen und anschließend sprechen';$('#voiceDialog').showModal();startVoiceListening();
}
function setVoiceListening(active,message){voiceListening=active;$('#voiceMic').classList.toggle('listening',active);$('#voiceMicLabel').textContent=active?'Aufnahme stoppen':'Aufnahme starten';$('#voiceStatus').textContent=message||(active?'Ich höre zu …':'Aufnahme beendet');}
function startVoiceListening(){
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){setVoiceListening(false,'Auf diesem Browser nicht verfügbar – Text bitte eintippen');$('#voiceTranscript').focus();return;}
  if(voiceListening){voiceRecognition?.stop();return;}
  voiceBaseText=$('#voiceTranscript').value.trim();voiceFinalText='';voiceRecognition=new Recognition();voiceRecognition.lang='de-DE';voiceRecognition.continuous=true;voiceRecognition.interimResults=true;voiceRecognition.maxAlternatives=1;
  voiceRecognition.onstart=()=>setVoiceListening(true,'Ich höre zu …');
  voiceRecognition.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const part=e.results[i][0].transcript.trim();if(e.results[i].isFinal)voiceFinalText+=`${voiceFinalText?' ':''}${part}`;else interim+=`${interim?' ':''}${part}`;}$('#voiceTranscript').value=[voiceBaseText,voiceFinalText,interim].filter(Boolean).join(' ');inferVoiceMode($('#voiceTranscript').value);};
  voiceRecognition.onerror=e=>setVoiceListening(false,e.error==='not-allowed'?'Mikrofonzugriff wurde nicht erlaubt':'Spracherkennung unterbrochen');
  voiceRecognition.onend=()=>{setVoiceListening(false,'Aufnahme beendet – Text jetzt prüfen');if($('#voiceTranscript').value.trim())parseVoiceText();};
  try{voiceRecognition.start();}catch{setVoiceListening(false,'Aufnahme konnte nicht gestartet werden');}
}
$('#voiceMic').onclick=startVoiceListening;
$('#voiceDialog').addEventListener('close',()=>{if(voiceListening)voiceRecognition?.stop();});
function inferVoiceMode(text){const t=text.toLowerCase();if(/\b(verkauf|verkauft|verkaufe|ausgang)\b/.test(t))$('#voiceMode').value='sale';else if(/\b(retoure|retour|zurück|rückgabe)\b/.test(t))$('#voiceMode').value='return';else if(/\b(beschädigt|kaputt|schaden|entnommen|aussortiert)\b/.test(t))$('#voiceMode').value='damage';else if(/\b(einkauf|gekauft|kaufe|lieferung|zugang)\b/.test(t))$('#voiceMode').value='purchase';}
function voiceNumberWords(text){const words={ein:1,eine:1,einen:1,zwei:2,drei:3,vier:4,fünf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,elf:11,zwölf:12,dreizehn:13,vierzehn:14,fünfzehn:15,sechzehn:16,siebzehn:17,achtzehn:18,neunzehn:19,zwanzig:20,dreißig:30,vierzig:40,fünfzig:50,sechzig:60,siebzig:70,achtzig:80,neunzig:90,hundert:100};return text.replace(/\b(ein|eine|einen|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|dreizehn|vierzehn|fünfzehn|sechzehn|siebzehn|achtzehn|neunzehn|zwanzig|dreißig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig|hundert)\b/gi,m=>words[m.toLowerCase()]);}
function parseVoicePositions(text){
  text=voiceNumberWords(text).replace(/(\d+)\s*euro\s*(\d{1,2})/gi,'$1,$2 Euro').replace(/[.!?]+/g,';');
  const segments=text.split(/(?:\s+(?:und dann|außerdem|sowie|dann|plus)\s+|\s+und\s+(?=\d+\s)|[;\n]+|,\s+(?=\d+\s))/i).map(s=>s.trim()).filter(Boolean),rows=[];
  segments.forEach(segment=>{let s=segment.replace(/^(?:einkauf|gekauft|kaufe|kaufte|lieferung|zugang|verkauf|verkauft|verkaufe|ausgang|retoure|retour|rückgabe|beschädigt|kaputt|schaden|entnommen|aussortiert)\s*:?\s*/i,'').trim();let m=s.match(/^(\d+)\s+(?:stück\s+|stk\.?\s+)?(.+?)\s+(?:für|zu|je|à)\s+(\d+(?:[.,]\d{1,2})?)(?:\s*euro)?$/i);if(m){rows.push({quantity:+m[1],name:m[2].trim(),cost:parseNumber(m[3])});return;}m=s.match(/^(\d+)\s+(?:stück\s+|stk\.?\s+)?(.+)$/i);if(m){rows.push({quantity:+m[1],name:m[2].replace(/\s+euro$/i,'').trim(),cost:0});return;}m=s.match(/^(.+?)\s+(\d+)\s*(?:stück|stk\.?)?(?:\s+(?:für|zu|je|à)\s+(\d+(?:[.,]\d{1,2})?)(?:\s*euro)?)?$/i);if(m)rows.push({name:m[1].trim(),quantity:+m[2],cost:parseNumber(m[3])});});
  return rows.filter(r=>r.name&&r.quantity>0);
}
function addVoiceRow(row={name:'',quantity:1,cost:0}){const el=document.createElement('div');el.className='voice-row';el.innerHTML=`<input aria-label="Artikel" placeholder="Artikel" value="${esc(row.name)}"><input aria-label="Menge" type="number" min="1" step="1" value="${row.quantity||1}"><input aria-label="Preis" type="number" min="0" step="0.01" value="${row.cost||0}"><button type="button" aria-label="Position löschen">×</button>`;$('button',el).onclick=()=>el.remove();$('#voiceRows').append(el);}
function parseVoiceText(){const text=$('#voiceTranscript').value.trim();inferVoiceMode(text);const rows=parseVoicePositions(text);$('#voiceRows').innerHTML='';(rows.length?rows:[{name:'',quantity:1,cost:0}]).forEach(addVoiceRow);$('#voiceStatus').textContent=rows.length?`${rows.length} Positionen erkannt – bitte prüfen`:'Nicht eindeutig erkannt – Position bitte korrigieren';}
$('#parseVoice').onclick=parseVoiceText;
$('#voiceForm').addEventListener('submit',e=>{
  e.preventDefault();if(voiceListening)voiceRecognition?.stop();const mode=$('#voiceMode').value,rows=$$('.voice-row','#voiceRows').map(row=>{const inputs=$$('input',row);return{name:inputs[0].value.trim(),quantity:+inputs[1].value,price:+inputs[2].value};}).filter(r=>r.name&&r.quantity>0);if(!rows.length){toast('Keine gültige Position erkannt');return;}
  const resolved=rows.map(row=>{const candidates=inventoryItemCandidates(row.name);return{row,candidates,item:candidates.length===1?candidates[0]:null};}),ambiguous=resolved.find(entry=>entry.candidates.length>1);if(ambiguous){alert(`„${ambiguous.row.name}“ passt zu mehreren Varianten. Bitte Farbe und Größe oder direkt die SKU sprechen/eintragen:\n\n${ambiguousInventoryMessage(ambiguous.candidates)}`);return;}const unknown=resolved.filter(x=>!x.item&&mode!=='purchase');if(unknown.length){alert(`Nicht im Inventar gefunden: ${unknown.map(x=>x.row.name).join(', ')}. Bitte zuerst als Einkauf oder Artikel anlegen.`);return;}const shortages=resolved.filter(x=>x.item&&(mode==='sale'||mode==='damage')&&x.row.quantity>x.item.stock);if(shortages.length){alert(`Nicht genügend Bestand für: ${shortages.map(x=>`${inventoryItemDescriptor(x.item)} (${x.item.stock} verfügbar)`).join(', ')}. Bitte Mengen anpassen.`);return;}
  const date=new Date().toISOString();resolved.forEach(({row,item})=>{if(!item){item=normalizeItemRecord({id:uid(),name:row.name.charAt(0).toUpperCase()+row.name.slice(1),stock:0,minStock:5,cost:row.price,salePrice:0},state.items.length);item.sku=createTextileSku(item);item.barcode=createInternalEan();state.items.push(item);}const stockBefore=item.stock,unitCost=item.cost,costBefore=item.cost;if(mode==='purchase'||mode==='return')item.stock+=row.quantity;else item.stock-=row.quantity;const price=row.price||((mode==='sale'||mode==='return')?item.salePrice:item.cost);if(mode==='purchase'&&row.price>0)item.cost=row.price;state.transactions.push({id:uid(),itemId:item.id,itemName:item.name,type:mode,quantity:row.quantity,unitPrice:price,unitCost,costBefore,stockBefore,stockAfter:item.stock,note:'Spracheingabe',date});});save();$('#voiceDialog').close();toast(`${rows.length} Positionen per Sprache verbucht`);
});

function parseNumber(v){
  v=String(v||'').replace(/[^0-9,.-]/g,'');
  if(v.includes(',')&&v.includes('.')) v=v.lastIndexOf(',')>v.lastIndexOf('.')?v.replace(/\./g,'').replace(',','.'):v.replace(/,/g,''); else v=v.replace(',','.');
  return Number(v)||0;
}
function parseLines(text){
  const rows=[];
  text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach(line=>{
    const semi=line.split(/[;\t|]/).map(x=>x.trim()).filter(Boolean);
    if(semi.length>=2){ rows.push({name:semi[0],quantity:Math.max(1,Math.round(parseNumber(semi[1]))),cost:parseNumber(semi[2])}); return; }
    const prices=[...line.matchAll(/\b(\d{1,5}[,.]\d{2})\b/g)];
    const qty=line.match(/(?:^|\s)(\d{1,4})\s*(?:x|stk\.?|stück)?(?:\s|$)/i);
    if(prices.length){
      const last=prices[prices.length-1]; let cost=parseNumber(last[1]); let quantity=qty?Math.max(1,+qty[1]):1;
      let name=line.slice(0,Math.min(last.index,qty?.index??last.index)).replace(/^\d+[.)\s-]*/,'').trim();
      if(name.length>2&&!/^(summe|gesamt|mwst|netto|brutto|datum|rechnung)/i.test(name)) rows.push({name,quantity,cost});
    }
  });
  return rows.slice(0,50);
}
function showScanRows(rows,status='Bitte Positionen prüfen und bei Bedarf korrigieren.'){
  $('#ocrStatus').textContent=status; $('#scanRows').innerHTML='';
  (rows.length?rows:[{name:'',quantity:1,cost:0}]).forEach(addScanRow); $('#scanDialog').showModal();
}
function addScanRow(row={name:'',quantity:1,cost:0}){
  const el=document.createElement('div'); el.className='scan-row'; el.innerHTML=`<input aria-label="Artikel" placeholder="Artikel" value="${esc(row.name)}"><input aria-label="Menge" type="number" min="1" value="${row.quantity||1}"><input aria-label="EK Preis" type="number" min="0" step="0.01" value="${row.cost||0}"><button type="button" aria-label="Löschen">×</button>`;
  $('button',el).onclick=()=>el.remove(); $('#scanRows').append(el);
}
$('#addScanRow').onclick=()=>addScanRow();
$('#parsePaste').onclick=()=>{const rows=parseLines($('#pasteList').value);showScanRows(rows,rows.length?`${rows.length} Positionen aus der Liste erkannt.`:'Keine eindeutigen Positionen erkannt. Bitte manuell ergänzen.');};
$('#cameraInput').onchange=$('#galleryInput').onchange=e=>{const file=e.target.files[0];e.target.value='';processReceipt(file);};
async function processReceipt(file){
  if(!file)return;const run=++receiptAnalysisRun;navigate('scan'); const url=URL.createObjectURL(file),preview=$('#receiptPreview');preview.onload=()=>{URL.revokeObjectURL(url);preview.onload=null;};preview.src=url; preview.style.display='block'; showScanRows([], 'Foto wird für eine flüssige Erkennung vorbereitet …');
  try{
    const prepared=await prepareOcrImage(file,1900);if(run!==receiptAnalysisRun||!$('#scanDialog').open)return;await loadTesseractLocal();if(run!==receiptAnalysisRun||!$('#scanDialog').open)return;
    const result=await withTimeout(Tesseract.recognize(prepared,'deu',{logger:m=>{if(run===receiptAnalysisRun&&$('#scanDialog').open&&m.status==='recognizing text')$('#ocrStatus').textContent=`Text wird erkannt … ${Math.round((m.progress||0)*100)} %`;}}),45000,'Texterkennung nach 45 Sekunden beendet');if(run!==receiptAnalysisRun||!$('#scanDialog').open)return;
    const rows=parseLines(result.data.text); $('#scanRows').innerHTML=''; (rows.length?rows:[{name:'',quantity:1,cost:0}]).forEach(addScanRow);
    $('#ocrStatus').textContent=rows.length?`${rows.length} mögliche Positionen erkannt. Bitte kurz kontrollieren.`:'Der Beleg war nicht eindeutig lesbar. Bitte Positionen ergänzen oder das Foto bei besserem Licht wiederholen.';
  }catch(err){if(run!==receiptAnalysisRun||!$('#scanDialog').open)return;$('#ocrStatus').textContent='Die automatische Erkennung konnte nicht abgeschlossen werden. Bitte Positionen manuell eingeben oder ein kleineres, schärferes Foto verwenden.';console.error(err);}
}
$('#scanDialog').addEventListener('close',()=>{receiptAnalysisRun++;});
$('#scanForm').addEventListener('submit',e=>{
  e.preventDefault(); const rows=$$('.scan-row','#scanRows').map(r=>{const inputs=$$('input',r);return{name:inputs[0].value.trim(),quantity:+inputs[1].value,cost:+inputs[2].value};}).filter(r=>r.name&&r.quantity>0);
  if(!rows.length){toast('Mindestens eine Position eintragen');return;}
  const resolved=rows.map(row=>{const candidates=inventoryItemCandidates(row.name);return{row,candidates,item:candidates.length===1?candidates[0]:null};}),ambiguous=resolved.find(entry=>entry.candidates.length>1);if(ambiguous){alert(`„${ambiguous.row.name}“ passt zu mehreren Varianten. Bitte die Position im Belegfenster um Farbe/Größe oder SKU ergänzen:\n\n${ambiguousInventoryMessage(ambiguous.candidates)}`);return;}
  resolved.forEach(({row:r,item:known})=>{
    let item=known;
    if(!item){item=normalizeItemRecord({id:uid(),name:r.name,stock:0,minStock:5,cost:r.cost,salePrice:0},state.items.length);item.sku=createTextileSku(item);item.barcode=createInternalEan();state.items.push(item);}
    const stockBefore=item.stock,unitCost=item.cost,costBefore=item.cost;item.stock+=r.quantity;if(r.cost>0)item.cost=r.cost;
    state.transactions.push({id:uid(),itemId:item.id,itemName:item.name,type:'purchase',quantity:r.quantity,unitPrice:r.cost,unitCost,costBefore,stockBefore,stockAfter:item.stock,note:'Belegimport',date:new Date().toISOString()});
  });
  save(); $('#scanDialog').close(); $('#receiptPreview').style.display='none'; navigate('inventory'); toast(`${rows.length} Positionen eingebucht`);
});

async function stopBarcodeScanner(invalidate=true){if(invalidate)barcodeScannerGeneration++;if(barcodeStartTimer){clearTimeout(barcodeStartTimer);barcodeStartTimer=null;}const scanner=barcodeScanner;barcodeScanner=null;if(scanner){try{if(scanner.isScanning)await scanner.stop();await scanner.clear();}catch{}}}
async function openBarcodeScanner(target='lookup'){
  scannerTarget=target;scannedItem=null;scannedLocation=null;$('#manualBarcode').value='';$('#scannerResult').hidden=true;$('#scannerActions').hidden=true;$('#scanEdit').dataset.code='';$('#scannerStatus').textContent='Kamera wird vorbereitet …';$('#scannerDialog').showModal();
  await stopBarcodeScanner();if(!$('#scannerDialog').open)return;const generation=++barcodeScannerGeneration;barcodeStartTimer=setTimeout(()=>{barcodeStartTimer=null;startBarcodeScanner(generation);},80);
}
async function startBarcodeScanner(generation){
  if(generation!==barcodeScannerGeneration||!$('#scannerDialog').open)return;if(typeof Html5Qrcode==='undefined'){$('#scannerStatus').textContent='Scanner-Modul nicht geladen. Code bitte manuell eingeben.';return;}
  await stopBarcodeScanner(false);if(generation!==barcodeScannerGeneration||!$('#scannerDialog').open)return;
  let scanner;
  try{const formats=typeof Html5QrcodeSupportedFormats!=='undefined'?[Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8,Html5QrcodeSupportedFormats.UPC_A,Html5QrcodeSupportedFormats.UPC_E,Html5QrcodeSupportedFormats.CODE_128,Html5QrcodeSupportedFormats.CODE_39,Html5QrcodeSupportedFormats.QR_CODE]:undefined;scanner=new Html5Qrcode('barcodeReader',formats?{formatsToSupport:formats,verbose:false}:{verbose:false});barcodeScanner=scanner;await scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:260,height:150},aspectRatio:1.5},code=>{if(generation===barcodeScannerGeneration)handleScannedCode(code);},()=>{});if(generation!==barcodeScannerGeneration||!$('#scannerDialog').open){if(scanner.isScanning)await scanner.stop();await scanner.clear();if(barcodeScanner===scanner)barcodeScanner=null;return;}$('#scannerStatus').textContent='Barcode mittig und ruhig vor die Kamera halten.';}catch(err){console.warn(err);if(barcodeScanner===scanner)barcodeScanner=null;if(generation===barcodeScannerGeneration&&$('#scannerDialog').open)$('#scannerStatus').textContent='Kamera nicht verfügbar. Auf dem iPhone ist dafür die private HTTPS-Adresse erforderlich; alternativ Code unten eingeben.';}
}
async function handleScannedCode(raw){
  const code=String(raw||'').trim();if(!code)return;await stopBarcodeScanner();
  if(scannerTarget==='item'){const input=$('#itemForm').elements.barcode;input.value=code;$('#scannerDialog').close();toast('Barcode in Artikel übernommen');return;}
  scannedItem=state.items.find(item=>item.barcode===code||String(item.sku||'').toLowerCase()===code.toLowerCase());scannedLocation=(state.locations||[]).find(location=>String(location.code||'').toLowerCase()===code.toLowerCase());$('#scannerStatus').textContent=`Erkannt: ${code}`;$('#scannerResult').hidden=false;$('#scannerActions').hidden=false;$('#scanEdit').dataset.code='';
  if(scannedItem){scannedLocation=null;$('#scannerResult').innerHTML=`<b>${esc(scannedItem.name)}</b><small>${esc([scannedItem.sku,scannedItem.color,scannedItem.size,scannedItem.location].filter(Boolean).join(' · '))} · Bestand ${number(scannedItem.stock)}</small>`;$('#scanPurchase').hidden=false;$('#scanSale').hidden=false;$('#scanEdit').hidden=false;$('#scanEdit').textContent='Artikel öffnen';}
  else if(scannedLocation){const items=state.items.filter(item=>!item.archived&&String(item.location||'').toLowerCase()===scannedLocation.name.toLowerCase()),units=items.reduce((sum,item)=>sum+(+item.stock||0),0);$('#scannerResult').innerHTML=`<b>Lagerplatz: ${esc(scannedLocation.name)}</b><small>${esc(scannedLocation.code)} · ${items.length} Variante(n) · ${number(units)} Teile</small>`;$('#scanPurchase').hidden=true;$('#scanSale').hidden=true;$('#scanEdit').hidden=false;$('#scanEdit').textContent='Inhalt anzeigen';}
  else{$('#scannerResult').innerHTML=`<b>Unbekannter Barcode</b><small>${esc(code)} ist noch keinem Artikel oder Lagerplatz zugeordnet.</small>`;$('#scanPurchase').hidden=true;$('#scanSale').hidden=true;$('#scanEdit').hidden=false;$('#scanEdit').textContent='Neuen Artikel anlegen';$('#scanEdit').dataset.code=code;}
}
$('#scannerDialog').addEventListener('close',stopBarcodeScanner);
$('#useManualBarcode').onclick=()=>handleScannedCode($('#manualBarcode').value);
$('#manualBarcode').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();handleScannedCode(e.currentTarget.value);}};
$('#barcodeImage').onchange=async e=>{const file=e.target.files[0];if(!file)return;await stopBarcodeScanner();const generation=++barcodeScannerGeneration;let scanner;try{scanner=new Html5Qrcode('barcodeReader',{verbose:false});barcodeScanner=scanner;$('#scannerStatus').textContent='Bild wird ausgewertet …';const code=await scanner.scanFile(file,true);if(generation===barcodeScannerGeneration&&$('#scannerDialog').open)await handleScannedCode(code);}catch(err){console.warn(err);if(generation===barcodeScannerGeneration&&$('#scannerDialog').open)$('#scannerStatus').textContent='Auf diesem Foto wurde kein unterstützter Barcode erkannt. Bitte näher und schärfer fotografieren.';}finally{if(barcodeScanner===scanner){try{await scanner.clear();}catch{}barcodeScanner=null;}e.target.value='';}};
function bookScanned(type){if(!scannedItem)return;const before=scannedItem.stock;if(type==='purchase')scannedItem.stock++;else if(scannedItem.stock>0)scannedItem.stock--;else{toast('Artikel ist bereits ausverkauft');return;}state.transactions.push({id:uid(),itemId:scannedItem.id,itemName:scannedItem.name,type,quantity:1,unitPrice:type==='sale'?scannedItem.salePrice:scannedItem.cost,unitCost:scannedItem.cost,stockBefore:before,stockAfter:scannedItem.stock,note:'Barcode-Scan',date:new Date().toISOString()});save();$('#scannerResult').querySelector('small').textContent=`Bestand jetzt ${number(scannedItem.stock)}`;toast(type==='purchase'?'+1 eingebucht':'−1 verkauft');}
$('#scanPurchase').onclick=()=>bookScanned('purchase');$('#scanSale').onclick=()=>bookScanned('sale');
$('#scanEdit').onclick=()=>{const code=$('#scanEdit').dataset.code||$('#manualBarcode').value;if($('#scannerDialog').open)$('#scannerDialog').close();if(scannedItem)openItem(scannedItem.id);else if(scannedLocation){navigate('inventory');$('#search').value=scannedLocation.name;inventoryFilter='all';inventoryLimit=100;syncFilterChips();renderInventory();toast(`Lagerplatz ${scannedLocation.name} geöffnet`);}else{openItem();$('#itemForm').elements.barcode.value=code;updateItemBarcodePreview();}};
$('#barcodeScan').onclick=$('#inventoryScanner').onclick=$('#settingsScanner').onclick=()=>openBarcodeScanner('lookup');
$('#scanIntoItem').onclick=()=>openBarcodeScanner('item');

function eanCheckDigit(base){return String((10-[...String(base)].reverse().reduce((sum,d,i)=>sum+(+d)*(i%2?1:3),0)%10)%10);}
function validEan(value){value=String(value);if(!/^\d{8}$|^\d{13}$/.test(value))return false;return eanCheckDigit(value.slice(0,-1))===value.slice(-1);}
function createInternalEan(){let value;do{const base='29'+(`${Date.now()}${Math.floor(Math.random()*1e8)}`).slice(-10);value=base+eanCheckDigit(base);}while(state.items.some(i=>i.barcode===value));return value;}
function ensureItemBarcode(item){if(!item.barcode)item.barcode=createInternalEan();return item.barcode;}
function ensureBarcodesPersisted(items){const missing=items.filter(item=>!item.barcode);if(!missing.length)return true;missing.forEach(ensureItemBarcode);if(!persistState()){missing.forEach(item=>{item.barcode='';});return false;}toast(`${missing.length} fehlende Barcode${missing.length===1?'':'s'} dauerhaft erzeugt`);return true;}
function resolveBarcodeFormat(value,requested='auto'){if(requested!=='auto')return requested;if(/^\d{13}$/.test(value)&&validEan(value))return'EAN13';if(/^\d{8}$/.test(value)&&validEan(value))return'EAN8';return'CODE128';}
const EAN_L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EAN_G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const EAN_R=['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const EAN13_LAYOUT=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
function nativeEanBits(value){if(!validEan(value))throw Error('Der EAN-Code ist ungültig. Bitte neu erzeugen oder prüfen.');if(value.length===8)return'101'+[...value.slice(0,4)].map(d=>EAN_L[+d]).join('')+'01010'+[...value.slice(4)].map(d=>EAN_R[+d]).join('')+'101';const layout=EAN13_LAYOUT[+value[0]];return'101'+[...value.slice(1,7)].map((d,i)=>(layout[i]==='L'?EAN_L:EAN_G)[+d]).join('')+'01010'+[...value.slice(7)].map(d=>EAN_R[+d]).join('')+'101';}
function drawNativeEan(svg,value,options={}){const bits=nativeEanBits(value),ns='http://www.w3.org/2000/svg',moduleWidth=2,quiet=10,barHeight=56,width=(bits.length+quiet*2)*moduleWidth,height=76;svg.innerHTML='';svg.setAttribute('xmlns',ns);svg.setAttribute('width',width);svg.setAttribute('height',height);svg.setAttribute('viewBox',`0 0 ${width} ${height}`);if(options.background&&options.background!=='transparent'){const bg=document.createElementNS(ns,'rect');bg.setAttribute('width',width);bg.setAttribute('height',height);bg.setAttribute('fill',options.background);svg.append(bg);}for(let i=0;i<bits.length;){if(bits[i]!=='1'){i++;continue;}let end=i+1;while(bits[end]==='1')end++;const rect=document.createElementNS(ns,'rect');rect.setAttribute('x',(quiet+i)*moduleWidth);rect.setAttribute('y','0');rect.setAttribute('width',(end-i)*moduleWidth);rect.setAttribute('height',barHeight);rect.setAttribute('fill',options.lineColor||'#000');svg.append(rect);i=end;}const text=document.createElementNS(ns,'text');text.setAttribute('x',width/2);text.setAttribute('y','72');text.setAttribute('text-anchor','middle');text.setAttribute('font-family','Arial,Helvetica,sans-serif');text.setAttribute('font-size',options.fontSize||12);text.setAttribute('fill',options.lineColor||'#000');text.textContent=value;svg.append(text);return value.length===13?'EAN13':'EAN8';}
function drawBarcode(svg,value,requested='auto',options={}){value=String(value||'').trim();const format=resolveBarcodeFormat(value,requested);svg.innerHTML='';if(typeof globalThis.JsBarcode==='function'){try{globalThis.JsBarcode(svg,value,{format,displayValue:true,fontSize:12,height:48,margin:4,...options});return format;}catch(err){if(format!=='CODE128')try{globalThis.JsBarcode(svg,value,{format:'CODE128',displayValue:true,fontSize:12,height:48,margin:4,...options});return'CODE128';}catch{}}}if((value.length===8||value.length===13)&&validEan(value))return drawNativeEan(svg,value,options);throw Error('Dieser Barcode-Typ konnte nicht gerendert werden. Bitte einen internen EAN-13-Code erzeugen.');}
function updateItemBarcodePreview(){const wrap=$('#itemBarcodePreview'),svg=$('#itemBarcodeSvg'),status=$('#itemBarcodeStatus'),value=$('#itemForm').elements.barcode.value.trim();wrap.classList.remove('error');if(!value){wrap.hidden=true;svg.innerHTML='';status.textContent='';return;}wrap.hidden=false;try{const format=drawBarcode(svg,value,'auto',{height:52,fontSize:13,margin:4,lineColor:'#000000',background:'#ffffff'});status.textContent=`${format} · ${value}`;}catch(err){svg.innerHTML='';wrap.classList.add('error');status.textContent=err.message||String(err);}}
$('#itemForm').elements.barcode.addEventListener('input',updateItemBarcodePreview);
$('#generateBarcode').onclick=()=>{const input=$('#itemForm').elements.barcode;if(input.value&&!confirm('Vorhandenen Barcode durch einen neuen internen EAN-13-Code ersetzen?'))return;input.value=createInternalEan();updateItemBarcodePreview();toast('EAN-13-Barcode erzeugt');};
function currentItemBarcodeExport(){
  const f=$('#itemForm'),value=f.elements.barcode.value.trim();if(!value)throw Error('Bitte zuerst einen Barcode erzeugen oder eintragen.');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),format=drawBarcode(svg,value,'auto',{height:76,fontSize:16,margin:12,lineColor:'#000000',background:'#ffffff'});
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('role','img');svg.setAttribute('aria-label',`Barcode ${value}`);
  const name=safeFileName(f.elements.sku.value.trim()||f.elements.name.value.trim()||value);
  return{value,format,name,svg:new XMLSerializer().serializeToString(svg)};
}
$('#downloadBarcodeSvg').onclick=()=>{try{const data=currentItemBarcodeExport();download(`Barcode-${data.name}.svg`,'image/svg+xml;charset=utf-8',data.svg);toast('Barcode als SVG heruntergeladen');}catch(err){alert(err.message||err);}};
$('#downloadBarcodePng').onclick=async()=>{try{const data=currentItemBarcodeExport(),cfg={width:80,height:32,dpi:300,background:'#ffffff'},blob=await svgToPngBlob(data.svg,cfg);triggerBlobDownload(blob,`Barcode-${data.name}-300dpi.png`);toast('Barcode als PNG heruntergeladen');}catch(err){alert(err.message||err);}};
function svgToThermalPngBlob(svg,widthMm,heightMm,dpi=203){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));img.onload=()=>{const canvas=document.createElement('canvas'),width=Math.max(1,Math.round(widthMm/25.4*dpi)),height=Math.max(1,Math.round(heightMm/25.4*dpi)),ctx=canvas.getContext('2d',{willReadFrequently:true});canvas.width=width;canvas.height=height;ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);const padding=Math.max(4,Math.round(Math.min(width,height)*.05)),scale=Math.min((width-padding*2)/img.width,(height-padding*2)/img.height),drawWidth=img.width*scale,drawHeight=img.height*scale;ctx.imageSmoothingEnabled=false;ctx.drawImage(img,(width-drawWidth)/2,(height-drawHeight)/2,drawWidth,drawHeight);const pixels=ctx.getImageData(0,0,width,height);for(let i=0;i<pixels.data.length;i+=4){const gray=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2],mono=gray<180?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=mono;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Nelko-PNG konnte nicht erstellt werden')),'image/png',1);URL.revokeObjectURL(url);};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Barcode konnte nicht für Nelko umgewandelt werden'));};img.src=url;});}
$('#shareNelkoBarcode').onclick=async()=>{try{const data=currentItemBarcodeExport(),[width,height]=$('#nelkoLabelSize').value.split('x').map(Number),blob=await svgToThermalPngBlob(data.svg,width,height,203),filename=`Nelko-Barcode-${data.name}-${width}x${height}mm.png`,file=new File([blob],filename,{type:'image/png'});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({files:[file],title:`Barcode ${data.value}`});toast('Nelko-Datei zum Teilen vorbereitet');}else{triggerBlobDownload(blob,filename);toast('Nelko-PNG heruntergeladen');}}catch(err){if(err?.name!=='AbortError')alert(err.message||err);}};
$('#printItemBarcode').onclick=()=>{let data;try{data=currentItemBarcodeExport();}catch(err){alert(err.message||err);return;}const popup=window.open('','_blank');if(!popup){alert('Das Druckfenster wurde blockiert. Bitte Pop-ups für diese App erlauben.');return;}popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barcode ${xmlEscape(data.value)}</title><style>@page{size:80mm 32mm;margin:0}*{box-sizing:border-box}html,body{margin:0;width:80mm;height:32mm}body{display:flex;align-items:center;justify-content:center;background:#fff}svg{width:76mm;height:29mm}@media screen{body{margin:20px;border:1px dashed #bbb}}</style></head><body>${data.svg}<script>window.onload=()=>{window.focus();window.print()}<\/script></body></html>`);popup.document.close();};
$('#generateMissingBarcodes').onclick=()=>{const items=state.items.filter(i=>!i.archived&&!i.barcode);if(!items.length){toast('Alle aktiven Artikel besitzen bereits einen Barcode');return;}if(!confirm(`Für ${items.length} Artikel interne EAN-13-Codes erzeugen?`))return;items.forEach(ensureItemBarcode);save();toast(`${items.length} Barcodes erzeugt`);};

function fillLabelItems(selected=''){const active=state.items.filter(i=>!i.archived).slice().sort((a,b)=>a.name.localeCompare(b.name,'de')||String(a.color||'').localeCompare(String(b.color||''),'de')||String(a.size||'').localeCompare(String(b.size||''),'de')),select=$('#labelItem'),selectedItem=active.find(i=>i.id===selected);select.innerHTML=active.map(i=>`<option value="${esc(i.id)}">${esc(i.name)}${[i.color,i.size].filter(Boolean).length?' · '+esc([i.color,i.size].filter(Boolean).join(' / ')):''}${i.sku?' · '+esc(i.sku):''}</option>`).join('');if(selectedItem)select.value=selected;$('#labelVariantWrap').innerHTML=active.map(i=>`<label><input type="checkbox" data-label-variant="${esc(i.id)}" ${selectedItem&&i.name.toLowerCase()===selectedItem.name.toLowerCase()?'checked':''}><span><b>${esc(i.name)}</b> · ${esc([i.color||'ohne Farbe',i.size||'ohne Größe'].join(' / '))}${i.sku?`<small>${esc(i.sku)}</small>`:''}</span></label>`).join('');}
function openLabelStudio(itemId='',scope='single'){const active=state.items.filter(i=>!i.archived);if(!active.length){toast('Zuerst einen aktiven Artikel anlegen');return;}if(!ensureBarcodesPersisted(active))return;try{fillLabelItems(itemId);$('#labelScope').value=scope;$('#labelItemWrap').hidden=scope!=='single';$('#labelVariantWrap').hidden=scope!=='variants';const saved=state.settings.labelStyle||{},f=$('#labelForm');if(saved.background)f.elements.background.value=saved.background;if(saved.textColor)f.elements.textColor.value=saved.textColor;if(saved.dpi)f.elements.dpi.value=String(saved.dpi);if(saved.fontScale)f.elements.fontScale.value=String(saved.fontScale);for(const field of ['showName','showPrice','showSku','showVariant','showLocation','showBrand','showMaterial'])if(typeof saved[field]==='boolean')f.elements[field].checked=saved[field];if(saved.priceType)f.elements.labelPriceType.value=saved.priceType;updateLogoPreview();$('#labelDialog').showModal();renderLabelPreview();}catch(err){console.error(err);alert(`Etiketten konnten nicht geöffnet werden: ${err.message||err}`);}}
function labelConfig(){const f=$('#labelForm'),preset=f.elements.preset.value;const sizes={'70x37':[70,37,3],'52.5x29.7':[52.5,29.7,4],'62x29':[62,29,1],'50x25':[50,25,1]};const size=preset==='custom'?[+f.elements.width.value,+f.elements.height.value,Math.max(1,Math.floor(190/(+f.elements.width.value||62)))]:sizes[preset];return{width:size[0],height:size[1],columns:size[2],thermal:preset==='62x29'||preset==='50x25'||preset==='custom',format:f.elements.barcodeFormat.value,copies:+f.elements.copies.value||1,startAt:Math.max(0,+f.elements.startAt.value||0),dpi:+f.elements.dpi.value||300,fontScale:+f.elements.fontScale.value||1,background:f.elements.background.value||'#ffffff',textColor:f.elements.textColor.value||'#101827',logo:state.settings.labelLogo||'',showName:f.elements.showName.checked,showPrice:f.elements.showPrice.checked,priceType:f.elements.labelPriceType.value||'standard',showSku:f.elements.showSku.checked,showVariant:f.elements.showVariant.checked,showLocation:f.elements.showLocation.checked,showBrand:f.elements.showBrand.checked,showMaterial:f.elements.showMaterial.checked};}
function selectedLabelItems(){const scope=$('#labelScope').value;if(scope==='all')return state.items.filter(i=>!i.archived);if(scope==='low')return state.items.filter(i=>!i.archived&&statusOf(i)!=='ok');if(scope==='variants'){const ids=new Set($$('[data-label-variant]:checked').map(input=>input.dataset.labelVariant));return state.items.filter(i=>!i.archived&&ids.has(i.id));}const item=state.items.find(i=>i.id===$('#labelItem').value&&!i.archived);return item?[item]:[];}
function xmlEscape(value){return String(value??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));}
function barcodeVector(value,format,x,y,width,height){const node=document.createElementNS('http://www.w3.org/2000/svg','svg');try{const actual=drawBarcode(node,value,format,{height:55,fontSize:13,margin:2,lineColor:'#000000',background:'transparent'}),aw=parseFloat(node.getAttribute('width'))||300,ah=parseFloat(node.getAttribute('height'))||100;return{actual,svg:`<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="0 0 ${aw} ${ah}" preserveAspectRatio="xMidYMid meet">${node.innerHTML}</svg>`};}catch(err){return{actual:'FEHLER',error:err.message||String(err),svg:`<text x="${x+width/2}" y="${y+height/2}" text-anchor="middle" fill="#b42318" font-family="Arial,sans-serif" font-size="14">Barcode nicht darstellbar</text>`};}}
function wrapLabelName(value,maxChars){const words=String(value||'').trim().split(/\s+/).filter(Boolean),lines=[];for(const word of words){if(!lines.length)lines.push(word);else if(`${lines[lines.length-1]} ${word}`.length<=maxChars)lines[lines.length-1]+=` ${word}`;else if(lines.length<2)lines.push(word);else{lines[1]+=` ${word}`;break;}}if(!lines.length)return[''];return lines.slice(0,2).map(line=>line.length<=maxChars?line:`${line.slice(0,Math.max(1,maxChars-1)).trimEnd()}…`);}
function buildFullLabelSvg(item,cfg=labelConfig()){
  const code=safeText(item.barcode);if(!code)throw Error(`Für „${item.name}“ fehlt ein gespeicherter Barcode.`);const W=Math.round(cfg.width*10),H=Math.round(cfg.height*10),nameSize=Math.max(14,Math.min(28,H*.088))*cfg.fontScale,meta=[];
  if(cfg.showSku&&item.sku)meta.push(item.sku);
  if(cfg.showVariant)meta.push([item.color,item.size].filter(Boolean).join(' / '));
  if(cfg.showLocation&&item.location)meta.push(`Lager: ${item.location}`);
  if(cfg.showBrand&&item.brand)meta.push(item.brand);
  if(cfg.showMaterial&&item.material)meta.push(item.material);
  const labelPrice=priceForItem(item,cfg.priceType);if(cfg.showPrice&&labelPrice)meta.push(money(labelPrice));
  const metaText=meta.filter(Boolean).join(' · '),baseMetaSize=Math.max(11,Math.min(20,H*.06))*cfg.fontScale,metaSize=Math.max(8,Math.min(baseMetaSize,W/Math.max(1,metaText.length*.58))),logo=cfg.logo?`<image href="${xmlEscape(cfg.logo)}" x="${W*.03}" y="${H*.025}" width="${W*.16}" height="${H*.16}" preserveAspectRatio="xMidYMid meet"/>`:'',nameX=cfg.logo?W*.59:W*.5,nameWidth=cfg.logo?W*.74:W*.9,maxChars=Math.max(12,Math.floor(nameWidth/(nameSize*.56))),nameLines=wrapLabelName(item.name,maxChars),twoLines=nameLines.length>1,barcodeY=twoLines?H*.30:H*.23,barcode=barcodeVector(code,cfg.format,W*.05,barcodeY,W*.9,twoLines?H*.53:H*.60),lineGap=nameSize,nameStart=twoLines?H*.065:H*.105,nameSvg=cfg.showName?`<text text-anchor="middle" fill="${xmlEscape(cfg.textColor)}" font-family="Arial,Helvetica,sans-serif" font-size="${nameSize}" font-weight="700">${nameLines.map((line,index)=>`<tspan x="${nameX}" y="${nameStart+index*lineGap}">${xmlEscape(line)}</tspan>`).join('')}</text>`:'';
  return{format:barcode.actual,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${cfg.width}mm" height="${cfg.height}mm" viewBox="0 0 ${W} ${H}" role="img" aria-label="${xmlEscape(item.name)}"><rect width="${W}" height="${H}" rx="8" fill="${xmlEscape(cfg.background)}"/>${logo}${nameSvg}${barcode.svg}<text x="${W/2}" y="${H*.94}" text-anchor="middle" fill="${xmlEscape(cfg.textColor)}" font-family="Arial,Helvetica,sans-serif" font-size="${metaSize}">${xmlEscape(metaText)}</text></svg>`};
}
function saveLabelStyle(cfg){const previous=state.settings.labelStyle;state.settings.labelStyle={background:cfg.background,textColor:cfg.textColor,dpi:cfg.dpi,fontScale:cfg.fontScale,priceType:cfg.priceType,showName:cfg.showName,showPrice:cfg.showPrice,showSku:cfg.showSku,showVariant:cfg.showVariant,showLocation:cfg.showLocation,showBrand:cfg.showBrand,showMaterial:cfg.showMaterial};if(!persistState()){state.settings.labelStyle=previous;return false;}return true;}
function renderLabelPreview(){const scope=$('#labelScope').value,items=selectedLabelItems(),item=items[0];$('#labelItemWrap').hidden=scope!=='single';$('#labelVariantWrap').hidden=scope!=='variants';$('#customLabelSize').hidden=$('#labelPreset').value!=='custom';$('#labelPriceTypeWrap').hidden=!$('#labelForm').elements.showPrice.checked;if(!item){$('#labelPreview').innerHTML='';$('#labelStatus').textContent='Keine Variante ausgewählt.';return;}const priceSelect=$('#labelPriceType'),priceLabels={standard:'Standard-/Ladenpreis',online:'Onlineshoppreis',market:'Markt-/Eventpreis',wholesale:'Großhandel/B2B',special:item.specialPriceName||'Sonderpreis'};$$('option',priceSelect).forEach(option=>option.textContent=`${priceLabels[option.value]} · ${money(priceForItem(item,option.value))}`);const cfg=labelConfig(),built=buildFullLabelSvg(item,cfg);$('#labelPreview').innerHTML=built.svg;$('#labelStatus').textContent=`${items.length} Variante(n) · ${cfg.copies} Etikett(en) je Variante · ${built.format} · ${cfg.dpi} DPI`;}
$('#labelForm').addEventListener('change',renderLabelPreview);$('#labelForm').addEventListener('input',e=>{if(e.target.type==='number')renderLabelPreview();});
$('#labelDialog').addEventListener('close',()=>saveLabelStyle(labelConfig()));
function updateLogoPreview(){const logo=state.settings.labelLogo||'';$('#labelLogoPreview').src=logo||'icon.svg';$('#removeLabelLogo').hidden=!logo;}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});}
$('#labelLogoInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;const previous=state.settings.labelLogo||'';try{let data;if(file.type==='image/svg+xml'||/\.svg$/i.test(file.name)){const doc=new DOMParser().parseFromString(await file.text(),'image/svg+xml');if(doc.querySelector('parsererror'))throw Error('Ungültige SVG-Datei');doc.querySelectorAll('script,style,foreignObject,iframe,object,embed').forEach(n=>n.remove());doc.querySelectorAll('*').forEach(n=>[...n.attributes].forEach(a=>{if(/^on/i.test(a.name)||(/url\s*\(/i.test(a.value))||((a.name==='href'||a.name==='xlink:href')&&!/^(#|data:)/i.test(a.value)))n.removeAttribute(a.name);}));data=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(doc.documentElement))}`;}else data=await fileToDataUrl(file);if(data.length>1_500_000)throw Error('Logo ist zu groß. Bitte eine PNG-/SVG-Datei unter etwa 1 MB verwenden.');state.settings.labelLogo=data;if(!persistState()){state.settings.labelLogo=previous;return;}updateLogoPreview();renderLabelPreview();}catch(err){state.settings.labelLogo=previous;alert(`Logo konnte nicht importiert werden: ${err.message||err}`);}e.target.value='';};
$('#removeLabelLogo').onclick=()=>{const previous=state.settings.labelLogo||'';state.settings.labelLogo='';if(!persistState()){state.settings.labelLogo=previous;return;}updateLogoPreview();renderLabelPreview();};
$('#inventoryLabels').onclick=$('#settingsLabels').onclick=()=>openLabelStudio('','all');
$('#labelCurrentItem').onclick=()=>{const id=$('#itemForm').elements.id.value,item=state.items.find(i=>i.id===id);if(!item){toast('Artikel zuerst speichern');return;}const siblings=state.items.filter(i=>!i.archived&&i.name.toLowerCase()===item.name.toLowerCase());openLabelStudio(id,siblings.length>1?'variants':'single');};
function currentLabelSvg(){const item=selectedLabelItems()[0];return item?buildFullLabelSvg(item,labelConfig()).svg:'';}
$('#exportLabelSvg').onclick=()=>{const item=selectedLabelItems()[0],svg=currentLabelSvg();if(!item||!svg)return;download(`Etikett-${safeFileName(item.name)}.svg`,'image/svg+xml;charset=utf-8',svg);};
function svgToPngBlob(svg,cfg){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(cfg.width/25.4*cfg.dpi));canvas.height=Math.max(1,Math.round(cfg.height/25.4*cfg.dpi));const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.fillStyle=cfg.background;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG-Erzeugung fehlgeschlagen')),'image/png',1);URL.revokeObjectURL(url);};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('SVG konnte nicht gerendert werden'));};img.src=url;});}
$('#exportLabelPng').onclick=async()=>{const item=selectedLabelItems()[0],cfg=labelConfig();if(!item)return;try{const blob=await svgToPngBlob(buildFullLabelSvg(item,cfg).svg,cfg);triggerBlobDownload(blob,`Etikett-${safeFileName(item.name)}-${cfg.dpi}dpi.png`);}catch(err){alert(err.message);}};
$('#exportLabelsZip').onclick=async()=>{const items=selectedLabelItems(),cfg=labelConfig();if(!items.length)return;if(typeof JSZip==='undefined'){alert('ZIP-Modul konnte nicht geladen werden.');return;}const zip=new JSZip(),used=new Set();for(let index=0;index<items.length;index++){const item=items[index];let name=`${safeFileName(item.sku||item.name)||'Etikett'}.svg`;if(used.has(name))name=`${safeFileName(item.sku||item.name)}-${index+1}.svg`;used.add(name);zip.file(name,buildFullLabelSvg(item,cfg).svg);if(index%25===24){$('#labelStatus').textContent=`Etiketten vorbereiten: ${index+1}/${items.length}`;await new Promise(resolve=>requestAnimationFrame(resolve));}}$('#labelStatus').textContent=`ZIP mit ${items.length} SVG-Dateien wird komprimiert …`;const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}},meta=>{$('#labelStatus').textContent=`ZIP wird komprimiert: ${Math.round(meta.percent)} %`;});triggerBlobDownload(blob,`HP67-Etiketten-${new Date().toISOString().slice(0,10)}.zip`);renderLabelPreview();};
$('#exportLabelsPdf').onclick=async()=>{const items=selectedLabelItems();if(!items.length){toast('Keine Varianten ausgewählt');return;}if(!window.jspdf?.jsPDF){alert('PDF-Modul konnte nicht geladen werden.');return;}const cfg=labelConfig(),queue=Array.from({length:cfg.startAt},()=>null);items.forEach(item=>{for(let copy=0;copy<cfg.copies;copy++)queue.push(item);});if(!queue.length)return;const button=$('#exportLabelsPdf');button.disabled=true;try{const {jsPDF}=window.jspdf,orientation=cfg.width>=cfg.height?'landscape':'portrait',doc=cfg.thermal?new jsPDF({orientation,unit:'mm',format:[cfg.width,cfg.height]}):new jsPDF({orientation:'portrait',unit:'mm',format:'a4'}),cache=new Map(),pdfCfg={...cfg,dpi:Math.min(cfg.dpi,300)},imageFor=async item=>{if(cache.has(item.id))return cache.get(item.id);const blob=await svgToPngBlob(buildFullLabelSvg(item,pdfCfg).svg,pdfCfg),data=await fileToDataUrl(blob);cache.set(item.id,data);return data;};if(cfg.thermal){for(let index=0;index<queue.length;index++){if(index)doc.addPage([cfg.width,cfg.height],orientation);if(queue[index])doc.addImage(await imageFor(queue[index]),'PNG',0,0,cfg.width,cfg.height,undefined,'FAST');$('#labelStatus').textContent=`PDF-Etiketten: ${index+1}/${queue.length}`;if(index%10===9)await new Promise(resolve=>requestAnimationFrame(resolve));}}else{const rowsPerPage=Math.max(1,Math.floor(297/cfg.height)),perPage=cfg.columns*rowsPerPage;for(let index=0;index<queue.length;index++){if(index&&index%perPage===0)doc.addPage('a4','portrait');const slot=index%perPage,x=(slot%cfg.columns)*cfg.width,y=Math.floor(slot/cfg.columns)*cfg.height;if(queue[index])doc.addImage(await imageFor(queue[index]),'PNG',x,y,cfg.width,cfg.height,undefined,'FAST');$('#labelStatus').textContent=`PDF-Etiketten: ${index+1}/${queue.length}`;if(index%10===9)await new Promise(resolve=>requestAnimationFrame(resolve));}}doc.save(`HP67-Etiketten-${new Date().toISOString().slice(0,10)}.pdf`);toast(`${queue.length-cfg.startAt} Etiketten als PDF gespeichert`);}catch(err){alert(`Etiketten-PDF konnte nicht erstellt werden: ${err.message||err}`);}finally{button.disabled=false;renderLabelPreview();}};
function labelMarkup(item,cfg){return `<div class="label">${buildFullLabelSvg(item,cfg).svg}</div>`;}
$('#printLabels').onclick=async()=>{const items=selectedLabelItems();if(!items.length){toast('Keine Artikel ausgewählt');return;}const popup=window.open('','_blank');if(!popup){alert('Das Druckfenster wurde blockiert. Bitte Pop-ups für diese App erlauben.');return;}popup.document.write('<!doctype html><title>Etiketten werden vorbereitet …</title><p style="font-family:sans-serif;padding:30px">Etiketten werden vorbereitet …</p>');const cfg=labelConfig(),labels=Array.from({length:cfg.startAt},()=>'<div class="label blank"></div>');for(let index=0;index<items.length;index++){for(let i=0;i<cfg.copies;i++)labels.push(labelMarkup(items[index],cfg));if(index%25===24){$('#labelStatus').textContent=`Druck vorbereiten: ${index+1}/${items.length}`;await new Promise(resolve=>requestAnimationFrame(resolve));}}const page=cfg.thermal?`size:${cfg.width}mm ${cfg.height}mm;margin:0`:'size:A4;margin:0';popup.document.open();popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>HP67 Etiketten</title><style>@page{${page}}*{box-sizing:border-box}body{margin:0;display:grid;grid-template-columns:repeat(${cfg.columns},${cfg.width}mm);gap:0;font-family:Arial,sans-serif}.label{width:${cfg.width}mm;height:${cfg.height}mm;padding:0;display:flex;align-items:center;justify-content:center;overflow:hidden;break-inside:avoid;border:.15mm solid #ddd}.label>svg{width:100%;height:100%;max-height:none}.blank{visibility:hidden}@media print{.label{border-color:transparent}}</style></head><body>${labels.join('')}<script>window.onload=()=>window.print()<\/script></body></html>`);popup.document.close();renderLabelPreview();};

function locationLabelConfig(){const preset=$('#locationLabelPreset').value,sizes={'70x37':[70,37,3,false],'50x25':[50,25,1,true],'62x29':[62,29,1,true]},size=sizes[preset]||sizes['70x37'];return{width:size[0],height:size[1],columns:size[2],thermal:size[3],dpi:300,background:'#ffffff'};}
function selectedLocationsForLabels(){const ids=new Set($$('[data-location-select]:checked').map(input=>input.dataset.locationSelect));return(state.locations||[]).filter(location=>ids.has(location.id));}
function buildLocationLabelSvg(location,cfg=locationLabelConfig()){
  const W=Math.round(cfg.width*10),H=Math.round(cfg.height*10),items=state.items.filter(item=>!item.archived&&String(item.location||'').toLowerCase()===location.name.toLowerCase()),units=items.reduce((sum,item)=>sum+(+item.stock||0),0),code=location.code||defaultLocationCode(location.name),name=String(location.name||''),nameSize=Math.max(12,Math.min(34,H*.14,W/Math.max(1,name.length*.58))),noteText=String(location.note||''),noteBaseSize=Math.max(9,Math.min(15,H*.055)),noteSize=Math.max(7,Math.min(noteBaseSize,W/Math.max(1,noteText.length*.58))),barcode=barcodeVector(code,'CODE128',W*.07,H*.29,W*.86,H*.48),summary=`${code} · ${items.length} Variante(n) · ${number(units)} Teile`,codeBaseSize=Math.max(9,Math.min(14,H*.05)),codeSize=Math.max(7,Math.min(codeBaseSize,W/Math.max(1,summary.length*.58))),note=noteText?`<text x="${W/2}" y="${H*.25}" text-anchor="middle" fill="#475467" font-family="Arial,Helvetica,sans-serif" font-size="${noteSize}">${xmlEscape(noteText)}</text>`:'';
  return{format:barcode.actual,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${cfg.width}mm" height="${cfg.height}mm" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lagerplatz ${xmlEscape(name)}"><rect width="${W}" height="${H}" rx="8" fill="#ffffff"/><rect width="${W}" height="${Math.max(8,H*.045)}" fill="${xmlEscape(location.color||'#2563eb')}"/><text x="${W/2}" y="${H*.16}" text-anchor="middle" fill="#101827" font-family="Arial,Helvetica,sans-serif" font-size="${nameSize}" font-weight="700">${xmlEscape(name)}</text>${note}${barcode.svg}<text x="${W/2}" y="${H*.94}" text-anchor="middle" fill="#101827" font-family="Arial,Helvetica,sans-serif" font-size="${codeSize}">${xmlEscape(summary)}</text></svg>`};
}
$('#exportLocationLabelsSvg').onclick=async()=>{const locations=selectedLocationsForLabels();if(!locations.length){toast('Bitte mindestens einen Lagerplatz auswählen');return;}if(typeof JSZip==='undefined'){alert('ZIP-Modul konnte nicht geladen werden.');return;}const cfg=locationLabelConfig(),zip=new JSZip();locations.forEach(location=>zip.file(`Lagerplatz-${safeFileName(location.code||location.name)}.svg`,buildLocationLabelSvg(location,cfg).svg));const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});triggerBlobDownload(blob,`HP67-Lagerplatz-Aufkleber-${new Date().toISOString().slice(0,10)}.zip`);toast(`${locations.length} Lagerplatz-SVGs gespeichert`);};
$('#exportLocationLabelsPdf').onclick=async()=>{const locations=selectedLocationsForLabels();if(!locations.length){toast('Bitte mindestens einen Lagerplatz auswählen');return;}if(!window.jspdf?.jsPDF){alert('PDF-Modul konnte nicht geladen werden.');return;}const cfg=locationLabelConfig(),{jsPDF}=window.jspdf,orientation=cfg.width>=cfg.height?'landscape':'portrait',doc=cfg.thermal?new jsPDF({orientation,unit:'mm',format:[cfg.width,cfg.height]}):new jsPDF({orientation:'portrait',unit:'mm',format:'a4'}),perPage=cfg.thermal?1:cfg.columns*Math.max(1,Math.floor(297/cfg.height));for(let index=0;index<locations.length;index++){if(index&&index%perPage===0)doc.addPage(cfg.thermal?[cfg.width,cfg.height]:'a4',cfg.thermal?orientation:'portrait');const slot=index%perPage,x=cfg.thermal?0:(slot%cfg.columns)*cfg.width,y=cfg.thermal?0:Math.floor(slot/cfg.columns)*cfg.height,blob=await svgToPngBlob(buildLocationLabelSvg(locations[index],cfg).svg,cfg),data=await fileToDataUrl(blob);doc.addImage(data,'PNG',x,y,cfg.width,cfg.height,undefined,'FAST');}doc.save(`HP67-Lagerplatz-Aufkleber-${new Date().toISOString().slice(0,10)}.pdf`);toast(`${locations.length} Lagerplatz-Aufkleber als PDF gespeichert`);};
$('#printLocationLabels').onclick=()=>{const locations=selectedLocationsForLabels();if(!locations.length){toast('Bitte mindestens einen Lagerplatz auswählen');return;}const popup=window.open('','_blank');if(!popup){alert('Das Druckfenster wurde blockiert. Bitte Pop-ups für diese App erlauben.');return;}const cfg=locationLabelConfig(),page=cfg.thermal?`size:${cfg.width}mm ${cfg.height}mm;margin:0`:'size:A4;margin:0',labels=locations.map(location=>`<div class="label">${buildLocationLabelSvg(location,cfg).svg}</div>`).join('');popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>HP67 Lagerplatz-Aufkleber</title><style>@page{${page}}*{box-sizing:border-box}body{margin:0;display:grid;grid-template-columns:repeat(${cfg.columns},${cfg.width}mm)}.label{width:${cfg.width}mm;height:${cfg.height}mm;overflow:hidden;border:.15mm solid #ddd}.label>svg{width:100%;height:100%}@media print{.label{border-color:transparent}}</style></head><body>${labels}<script>window.onload=()=>window.print()<\/script></body></html>`);popup.document.close();};

function safeFileName(value){return String(value||'Export').replace(/[\\/:*?"<>|]+/g,'-').slice(0,80);}

function triggerBlobDownload(blob,name){const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.rel='noopener';anchor.style.display='none';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function download(name,type,content){triggerBlobDownload(new Blob([content],{type}),name);}
function csvCell(v){return `"${String(v??'').replace(/"/g,'""')}"`;}
function parseCsv(text){
  text=text.replace(/^\ufeff/,'');const first=text.split(/\r?\n/,1)[0];const counts={';':(first.match(/;/g)||[]).length,',':(first.match(/,/g)||[]).length,'\t':(first.match(/\t/g)||[]).length};const delimiter=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}else cell+=ch;}
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
function inventoryMatrix(){const head=['Artikel','SKU','Kategorie','Farbe','Größe','Marke','Material','Saison','Einheit','Tags','Beschreibung','Verkaufsoptionen','Lieferant','Lagerplatz','Barcode','Bestand','Mindestbestand','EK','VK Standard','VK Online','VK Markt','VK B2B','Sonderpreis Name','Sonderpreis','Archiviert'];const rows=state.items.map(i=>[i.name,i.sku,i.category,i.color,i.size,i.brand,i.material,i.season,i.unit,i.tags,i.description,(i.salesOptions||[]).join(', '),i.supplier,i.location,i.barcode,i.stock,i.minStock,i.cost,i.salePrice,i.onlinePrice||0,i.marketPrice||0,i.wholesalePrice||0,i.specialPriceName||'',i.specialPrice||0,i.archived?'Ja':'Nein']);return{head,rows};}
$('#exportJson').onclick=()=>download(`HP67-Sicherung-${new Date().toISOString().slice(0,10)}.json`,'application/json',JSON.stringify(state,null,2));
$('#exportCsv').onclick=()=>{const {head,rows}=inventoryMatrix(),csv='\ufeff'+[head,...rows].map(r=>r.map(csvCell).join(';')).join('\r\n');download(`HP67-Inventar-${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8',csv);};
$('#exportTsv').onclick=()=>{const {head,rows}=inventoryMatrix();download(`HP67-Inventar-${new Date().toISOString().slice(0,10)}.tsv`,'text/tab-separated-values;charset=utf-8','\ufeff'+[head,...rows].map(r=>r.map(v=>String(v??'').replace(/[\t\r\n]/g,' ')).join('\t')).join('\r\n'));};
$('#exportXml').onclick=()=>{const fields=['name','sku','category','color','size','brand','material','season','unit','tags','description','salesOptions','supplier','location','barcode','stock','minStock','cost','salePrice','onlinePrice','marketPrice','wholesalePrice','specialPriceName','specialPrice','archived'],xml=`<?xml version="1.0" encoding="UTF-8"?>\n<hp67Inventory version="3" exportedAt="${new Date().toISOString()}">\n  <items>\n${state.items.map(i=>`    <item id="${xmlEscape(i.id)}">\n${fields.map(f=>`      <${f}>${xmlEscape(Array.isArray(i[f])?i[f].join(', '):(i[f]??''))}</${f}>`).join('\n')}\n    </item>`).join('\n')}\n  </items>\n</hp67Inventory>`;download(`HP67-Inventar-${new Date().toISOString().slice(0,10)}.xml`,'application/xml;charset=utf-8',xml);};
$('#exportTransactions').onclick=()=>{const head=['Datum','Art','Artikel','Menge','Stückpreis','Einstand','Preisart','Notiz'];const rows=state.transactions.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(t=>[fmtDate(t.date),t.type,t.itemName,t.quantity,t.unitPrice,t.unitCost??'',t.priceType||'',t.note]);download(`HP67-Buchungen-${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8','\ufeff'+[head,...rows].map(r=>r.map(csvCell).join(';')).join('\r\n'));};
$('#exportXlsx').onclick=()=>{if(typeof XLSX==='undefined'){alert('Excel-Modul konnte nicht geladen werden.');return;}const wb=XLSX.utils.book_new();const inventory=state.items.map(i=>({Artikel:i.name,SKU:i.sku,Kategorie:i.category,Farbe:i.color,Größe:i.size,Marke:i.brand,Material:i.material,Saison:i.season,Einheit:i.unit,Tags:i.tags,Beschreibung:i.description,Verkaufsoptionen:(i.salesOptions||[]).join(', '),Lieferant:i.supplier,Lagerplatz:i.location,Barcode:i.barcode,Bestand:i.stock,Mindestbestand:i.minStock,EK:i.cost,VK_Standard:i.salePrice,VK_Online:i.onlinePrice||0,VK_Markt:i.marketPrice||0,VK_B2B:i.wholesalePrice||0,Sonderpreis_Name:i.specialPriceName||'',Sonderpreis:i.specialPrice||0,Warenwert:i.stock*i.cost,Archiviert:i.archived?'Ja':'Nein'}));const tx=state.transactions.map(t=>({Datum:fmtDate(t.date),Art:t.type,Artikel:t.itemName,Menge:t.quantity,Stückpreis:t.unitPrice,Einstand:t.unitCost??'',Preisart:t.priceType||'',Notiz:t.note}));const orders=state.orders.flatMap(o=>o.lines.map(l=>({Datum:fmtDate(o.date),Lieferant:o.supplier,Status:orderStatusLabel(o.status),Artikel:l.itemName,Bestellt:l.quantity,Erhalten:l.received||0,Offen:Math.max(0,l.quantity-(l.received||0)),EK:l.unitCost})));const locations=(state.locations||[]).map(location=>{const items=state.items.filter(item=>!item.archived&&String(item.location||'').toLowerCase()===location.name.toLowerCase());return{Lagerplatz:location.name,Barcode:location.code,Kennfarbe:location.color,Hinweis:location.note,Varianten:items.length,Teile:items.reduce((sum,item)=>sum+(+item.stock||0),0)};}),snapshots=state.snapshots.map(s=>({Datum:fmtDate(s.date),Artikel:s.itemCount,Teile:s.totalUnits,Warenwert:s.value}));XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(inventory),'Inventar');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(locations),'Lagerplätze');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(tx),'Buchungen');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(orders),'Bestellungen');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(snapshots),'Momentaufnahmen');XLSX.writeFile(wb,`HP67-Komplett-${new Date().toISOString().slice(0,10)}.xlsx`,{compression:true});};
$('#exportPdf').onclick=()=>{if(!window.jspdf?.jsPDF){alert('PDF-Modul konnte nicht geladen werden.');return;}const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});doc.setFontSize(18);doc.text('HP67 Inventarbericht',14,15);doc.setFontSize(9);doc.text(`Stand: ${new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date())} · ${state.items.length} Artikel · Warenwert ${money(state.items.reduce((s,i)=>s+i.stock*i.cost,0))}`,14,21);doc.autoTable({startY:26,head:[['Artikel','SKU','Farbe / Größe','Lagerplatz','Bestand','Min.','EK','VK','Warenwert']],body:state.items.map(i=>[i.name,i.sku,[i.color,i.size].filter(Boolean).join(' / '),i.location,i.stock,i.minStock,money(i.cost),money(i.salePrice),money(i.stock*i.cost)]),styles:{fontSize:7,cellPadding:2},headStyles:{fillColor:[16,24,39]},alternateRowStyles:{fillColor:[245,247,249]},didDrawPage:data=>{doc.setFontSize(7);doc.text(`HP67 Inventar · Seite ${doc.internal.getNumberOfPages()}`,14,203);}});doc.save(`HP67-Inventarbericht-${new Date().toISOString().slice(0,10)}.pdf`);};
$('#importJson').onchange=async e=>{
  try{
    const file=e.target.files[0];if(!file)return;const data=JSON.parse(await file.text());
    if(!validBackupData(data))throw Error('Struktur oder Pflichtfelder sind ungültig');
    if(!confirm(`Sicherung mit ${data.items.length} Artikeln laden? Der aktuelle Stand wird ersetzt.`))return;
    data.items=data.items.map(normalizeItemRecord);
    data.transactions=data.transactions.map(normalizeTransactionRecord);
    data.orders=Array.isArray(data.orders)?data.orders.map(normalizeOrderRecord):[];
    data.snapshots=Array.isArray(data.snapshots)?data.snapshots.map(normalizeSnapshotRecord):[];
    data.categories=Array.isArray(data.categories)?data.categories.filter(category=>category&&safeText(category.name)).map((category,index)=>({id:safeText(category.id)||`cat-${Date.now()}-${index}`,name:safeText(category.name),prefix:skuPart(category.prefix||category.name,5),color:safeText(category.color)||'#64748b'})):DEFAULT_CATEGORIES.map(c=>({...c}));
    data.brands=Array.isArray(data.brands)?data.brands.map(safeText).filter(Boolean):DEFAULT_BRANDS.slice();
    data.materials=Array.isArray(data.materials)?data.materials.map(safeText).filter(Boolean):DEFAULT_MATERIALS.slice();
    data.locations=Array.isArray(data.locations)?data.locations.filter(location=>location&&safeText(location.name)).map((location,index)=>({id:safeText(location.id)||locationIdFromName(location.name,index),name:safeText(location.name),code:cleanLocationCode(location.code)||defaultLocationCode(location.name),color:safeText(location.color)||'#2563eb',note:safeText(location.note),visualSamples:Array.isArray(location.visualSamples)?location.visualSamples.filter(sample=>sample&&sample.version===1).slice(-4):[]})):[];
    data.settings=data.settings&&typeof data.settings==='object'?data.settings:{};normalizeVisualState(data);
    const previous=state;state=data;data.items.forEach(i=>{ensureCategory(i.category);ensureBrand(i.brand);ensureMaterial(i.material);ensureLocation(i.location);});
    if(!persistState()){state=previous;return;}
    renderAll();toast('Sicherung geprüft und geladen');
  }catch(error){console.error(error);alert('Diese Datei ist keine gültige HP67-Sicherung. Es wurden keine Daten verändert.');}
  e.target.value='';
};
function normalizeImportRows(rows){
  if(rows.length<2)throw Error('Keine Datenzeilen');
  const norm=v=>String(v||'').toLowerCase().replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');const headers=rows[0].map(norm);const ix=(...names)=>headers.findIndex(h=>names.includes(h));
  const col={name:ix('artikel','name','artikelname'),sku:ix('sku','artikelnummer'),category:ix('kategorie'),color:ix('farbe'),size:ix('grosse','groesse'),brand:ix('marke','brand','hersteller'),material:ix('material'),season:ix('saison','kollektion'),unit:ix('einheit','unit'),tags:ix('tags','schlagworte'),description:ix('beschreibung','hinweise','description'),salesOptions:ix('verkaufsoptionen','salesoptions'),supplier:ix('lieferant'),location:ix('lagerplatz','lagerort'),barcode:ix('barcode','ean'),stock:ix('bestand','menge'),minStock:ix('mindestbestand','minimum'),cost:ix('ek','einkaufspreis'),salePrice:ix('vkstandard','vk','verkaufspreis'),onlinePrice:ix('vkonline','onlinepreis'),marketPrice:ix('vkmarkt','marktpreis'),wholesalePrice:ix('vkb2b','grosshandelspreis'),specialPriceName:ix('sonderpreisname'),specialPrice:ix('sonderpreis'),archived:ix('archiviert','archived')};if(col.name<0)throw Error('Spalte Artikel fehlt');
  const present=Object.entries(col).filter(([,index])=>index>=0).map(([field])=>field),val=(r,index)=>index>=0?String(r[index]??'').trim():'';
  return rows.slice(1).filter(r=>val(r,col.name)).map(r=>({name:val(r,col.name),sku:val(r,col.sku),category:val(r,col.category),color:val(r,col.color),size:val(r,col.size),brand:val(r,col.brand),material:val(r,col.material),season:val(r,col.season),unit:val(r,col.unit)||'Stück',tags:val(r,col.tags),description:val(r,col.description),salesOptions:variantValues(val(r,col.salesOptions)),supplier:val(r,col.supplier),location:val(r,col.location),barcode:val(r,col.barcode),stock:col.stock>=0?parseNumber(r[col.stock]):0,minStock:col.minStock>=0?parseNumber(r[col.minStock]):5,cost:col.cost>=0?parseNumber(r[col.cost]):0,salePrice:col.salePrice>=0?parseNumber(r[col.salePrice]):0,onlinePrice:col.onlinePrice>=0?parseNumber(r[col.onlinePrice]):0,marketPrice:col.marketPrice>=0?parseNumber(r[col.marketPrice]):0,wholesalePrice:col.wholesalePrice>=0?parseNumber(r[col.wholesalePrice]):0,specialPriceName:val(r,col.specialPriceName),specialPrice:col.specialPrice>=0?parseNumber(r[col.specialPrice]):0,archived:/^(ja|true|1)$/i.test(val(r,col.archived)),_present:present}));
}
function parseInventoryXml(text){const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('Ungültiges XML');const fields=['name','sku','category','color','size','brand','material','season','unit','tags','description','salesOptions','supplier','location','barcode','stock','minStock','cost','salePrice','onlinePrice','marketPrice','wholesalePrice','specialPriceName','specialPrice','archived'],headers={name:'Artikel',category:'Kategorie',color:'Farbe',size:'Größe',brand:'Marke',season:'Saison',unit:'Einheit',description:'Beschreibung',salesOptions:'Verkaufsoptionen',supplier:'Lieferant',location:'Lagerplatz',stock:'Bestand',minStock:'Mindestbestand',cost:'EK',salePrice:'VK Standard',onlinePrice:'VK Online',marketPrice:'VK Markt',wholesalePrice:'VK B2B',specialPriceName:'Sonderpreis Name',specialPrice:'Sonderpreis',archived:'Archiviert'};const rows=[fields.map(f=>headers[f]||f)];doc.querySelectorAll('item').forEach(node=>rows.push(fields.map(f=>node.querySelector(f)?.textContent||'')));return normalizeImportRows(rows);}
function importItemData(data){const clean={...data};delete clean._present;return clean;}
function findImportMatch(data){
  const sku=safeText(data.sku).toLowerCase(),barcode=safeText(data.barcode).toLowerCase();
  const bySku=sku?state.items.find(item=>safeText(item.sku).toLowerCase()===sku):null;
  const byBarcode=barcode?state.items.find(item=>safeText(item.barcode).toLowerCase()===barcode):null;
  if(bySku&&byBarcode&&bySku.id!==byBarcode.id)throw Error(`Import-Konflikt: SKU ${data.sku} und Barcode ${data.barcode} gehören zu unterschiedlichen Artikeln.`);
  if(bySku||byBarcode)return bySku||byBarcode;
  const key=value=>normalizedText(value).replace(/[^a-z0-9]/g,''),name=key(data.name),color=key(data.color),size=key(data.size);
  return state.items.find(item=>key(item.name)===name&&key(item.color)===color&&key(item.size)===size)||null;
}
function assertUniqueInventoryCodes(items=state.items){
  const ids=new Set(),skus=new Set(),barcodes=new Set();
  for(const item of items){
    const id=safeText(item.id),sku=safeText(item.sku).toLowerCase(),barcode=safeText(item.barcode).toLowerCase();
    if(id&&ids.has(id))throw Error(`Doppelte interne Artikel-ID bei „${item.name}“ erkannt.`);
    if(sku&&skus.has(sku))throw Error(`Doppelte SKU „${item.sku}“ erkannt.`);
    if(barcode&&barcodes.has(barcode))throw Error(`Doppelter Barcode „${item.barcode}“ erkannt.`);
    if(id)ids.add(id);if(sku)skus.add(sku);if(barcode)barcodes.add(barcode);
  }
}
function validateImportRows(incoming){
  const seenSku=new Set(),seenBarcode=new Set(),seenVariant=new Set();
  for(const row of incoming){const sku=safeText(row.sku).toLowerCase(),barcode=safeText(row.barcode).toLowerCase(),variant=[normalizedText(row.name),normalizedText(row.color),normalizedText(row.size)].join('|');if((sku&&seenSku.has(sku))||(barcode&&seenBarcode.has(barcode))||seenVariant.has(variant))throw Error(`Doppelte Variante in der Importdatei: ${row.name}${row.color?` · ${row.color}`:''}${row.size?` · ${row.size}`:''}`);if(sku)seenSku.add(sku);if(barcode)seenBarcode.add(barcode);seenVariant.add(variant);}
}
function showImportPreview(incoming,fileName){if(!incoming.length)throw Error('Keine Artikel erkannt');validateImportRows(incoming);pendingImportRows=incoming;const matches=incoming.filter(findImportMatch).length;$('#importSummary').textContent=`${incoming.length} Varianten aus „${fileName}“ erkannt: ${matches} vorhandene Treffer, ${incoming.length-matches} neue Varianten. Zusammenführen nutzt SKU, Barcode oder Name + Farbe + Größe.`;$('#importPreviewRows').innerHTML=incoming.slice(0,12).map(i=>`<tr><td>${esc([i.name,i.color,i.size].filter(Boolean).join(' · '))}</td><td>${esc(i.sku)}</td><td>${number(i.stock)}</td><td>${money(i.cost)}</td></tr>`).join('');$('#importDialog').showModal();}
$('#importCsv').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{let incoming;if(/\.xlsx?$/i.test(file.name)){if(typeof XLSX==='undefined')throw Error('Excel-Modul nicht geladen');const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),sheet=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});incoming=normalizeImportRows(rows);}else if(/\.xml$/i.test(file.name)||file.type.includes('xml'))incoming=parseInventoryXml(await file.text());else incoming=normalizeImportRows(parseCsv(await file.text()));showImportPreview(incoming,file.name);}catch(err){alert(`Import nicht möglich: ${err.message}`);}e.target.value='';};
$('#importForm').addEventListener('submit',e=>{
  e.preventDefault();const strategy=e.currentTarget.elements.strategy.value;if(!pendingImportRows.length)return;const previous=JSON.parse(JSON.stringify(state)),rows=pendingImportRows.slice();let added=0,updated=0,skipped=0;
  try{
    if(strategy!=='replace')assertUniqueInventoryCodes(state.items);
    if(strategy==='replace'){
      if(!confirm('Inventar vollständig ersetzen? Dabei werden auch bisherige Buchungen, Bestellungen und Momentaufnahmen gelöscht.'))return;
      state={items:rows.map(data=>({id:uid(),photo:'',visualSamples:[],...importItemData(data)})),transactions:[],orders:[],snapshots:[],categories:DEFAULT_CATEGORIES.map(c=>({...c})),brands:DEFAULT_BRANDS.slice(),materials:DEFAULT_MATERIALS.slice(),locations:[],settings:state.settings||{}};added=rows.length;
    }else rows.forEach(data=>{const existing=findImportMatch(data);if(existing&&strategy==='merge'){const clean=importItemData(data),patch={};for(const field of data._present||[])if(field in clean)patch[field]=clean[field];Object.assign(existing,patch);updated++;}else if(!existing){state.items.push({id:uid(),photo:'',visualSamples:[],...importItemData(data)});added++;}else skipped++;});
    assertUniqueInventoryCodes(state.items);
    state.items.forEach(item=>{ensureCategory(item.category);ensureBrand(item.brand);ensureMaterial(item.material);ensureLocation(item.location);});
    if(!persistState()){state=previous;return;}
    pendingImportRows=[];renderAll();$('#importDialog').close();toast(`${added} neu · ${updated} aktualisiert${skipped?` · ${skipped} übersprungen`:''}`);
  }catch(error){state=previous;alert(`Import abgebrochen: ${error.message}`);}
});
$('#resetData').onclick=()=>{if(confirm('Wirklich alle Artikel, Lagerplätze, Bestellungen, Momentaufnahmen und Buchungen unwiderruflich löschen?')){state={items:[],transactions:[],orders:[],snapshots:[],categories:DEFAULT_CATEGORIES.map(c=>({...c})),brands:DEFAULT_BRANDS.slice(),materials:DEFAULT_MATERIALS.slice(),locations:[],settings:{}};save();toast('Alle Daten gelöscht');}};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('#installApp').hidden=false;});
$('#installApp').onclick=async()=>{if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('#installApp').hidden=true;}};
$('#updateApp').onclick=async()=>{const button=$('#updateApp'),label=button.textContent;button.disabled=true;button.textContent='Update wird geladen …';try{if('serviceWorker'in navigator){const scope=new URL('./',location.href).href,registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.filter(registration=>registration.scope===scope).map(registration=>registration.update()));}if('caches'in window){const names=await caches.keys();await Promise.all(names.filter(name=>name.startsWith('hp67-inventar-')||/^hp67-v\d+$/.test(name)).map(name=>caches.delete(name)));}location.reload();}catch(error){console.error(error);button.disabled=false;button.textContent=label;toast('Update konnte nicht geladen werden – bitte Safari neu öffnen');}};
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=34',{updateViaCache:'none'}).then(registration=>registration.update()).catch(console.warn));
renderAll();
