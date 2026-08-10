/* HP67 Smart-Kamera: lokale Merkmale, eindeutige Codes und kontrollierte Treffer. */
let smartPreviewUrl='';
let smartCandidates=[];
let smartSelected=-1;
let smartUnknownCode='';
let smartNewSuggestion={};
let smartAnalysisRun=0;
let smartBarcodeReaderInstance=null;

function withTimeout(promise,milliseconds,message){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds);})]).finally(()=>clearTimeout(timer));}

function imageFromSource(source){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    let objectUrl='';
    image.onload=()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);resolve(image);};
    image.onerror=()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);reject(new Error('Bild konnte nicht gelesen werden.'));};
    if(source instanceof Blob){objectUrl=URL.createObjectURL(source);image.src=objectUrl;}else image.src=String(source||'');
  });
}

async function prepareOcrImage(source,maxEdge=1900){
  const image=await imageFromSource(source),width=image.naturalWidth||image.width,height=image.naturalHeight||image.height,scale=Math.min(1,maxEdge/Math.max(width,height));
  if(scale===1&&source instanceof Blob&&source.size<=4_000_000)return source;
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const context=canvas.getContext('2d');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Foto konnte nicht für die Erkennung vorbereitet werden.')),'image/jpeg',.88));
}

function hsvOf(r,g,b){
  r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;let h=0;
  if(delta){if(max===r)h=((g-b)/delta)%6;else if(max===g)h=(b-r)/delta+2;else h=(r-g)/delta+4;h=((h*60)+360)%360;}
  return[h,max?delta/max:0,max];
}

async function createVisualFingerprint(source){
  const image=await imageFromSource(source),size=Math.min(image.naturalWidth||image.width,image.naturalHeight||image.height),sx=((image.naturalWidth||image.width)-size)/2,sy=((image.naturalHeight||image.height)-size)/2;
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,32,32);context.drawImage(image,sx,sy,size,size,0,0,32,32);
  const pixels=context.getImageData(0,0,32,32).data,hist=new Array(20).fill(0),colors=[],tones=[];
  for(let gy=0;gy<8;gy++)for(let gx=0;gx<8;gx++){
    let r=0,g=0,b=0,count=0;
    for(let y=gy*4;y<gy*4+4;y++)for(let x=gx*4;x<gx*4+4;x++){const p=(y*32+x)*4;r+=pixels[p];g+=pixels[p+1];b+=pixels[p+2];count++;}
    r/=count;g/=count;b/=count;tones.push(Math.round((.299*r+.587*g+.114*b)/4));
  }
  for(let gy=0;gy<4;gy++)for(let gx=0;gx<4;gx++){
    let r=0,g=0,b=0,count=0;
    for(let y=gy*8;y<gy*8+8;y++)for(let x=gx*8;x<gx*8+8;x++){const p=(y*32+x)*4;r+=pixels[p];g+=pixels[p+1];b+=pixels[p+2];count++;}
    r/=count;g/=count;b/=count;colors.push(Math.round(r/8),Math.round(g/8),Math.round(b/8));const[h,s,v]=hsvOf(r,g,b);hist[Math.min(11,Math.floor(h/30))]++;hist[12+Math.min(3,Math.floor(s*4))]++;hist[16+Math.min(3,Math.floor(v*4))]++;
  }
  const dh=document.createElement('canvas');dh.width=9;dh.height=8;const dhc=dh.getContext('2d',{willReadFrequently:true});dhc.drawImage(image,sx,sy,size,size,0,0,9,8);const dp=dhc.getImageData(0,0,9,8).data;let hash='';
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){const a=(y*9+x)*4,b=a+4,ga=.299*dp[a]+.587*dp[a+1]+.114*dp[a+2],gb=.299*dp[b]+.587*dp[b+1]+.114*dp[b+2];hash+=ga>gb?'1':'0';}
  return{version:1,hash,tones,colors,hist:hist.map(value=>value/48),createdAt:new Date().toISOString()};
}

function visualSimilarity(a,b){
  if(!a||!b||a.version!==1||b.version!==1||a.hash?.length!==64||b.hash?.length!==64)return 0;
  let equal=0;for(let i=0;i<64;i++)if(a.hash[i]===b.hash[i])equal++;const hash=equal/64;
  const vectorScore=(left,right,max)=>{if(!Array.isArray(left)||left.length!==right?.length)return 0;let diff=0;for(let i=0;i<left.length;i++)diff+=Math.abs(left[i]-right[i]);return Math.max(0,1-diff/(left.length*max));};
  const tones=vectorScore(a.tones,b.tones,63),colors=vectorScore(a.colors,b.colors,31);let hist=0;if(Array.isArray(a.hist)&&a.hist.length===b.hist?.length)for(let i=0;i<a.hist.length;i++)hist+=Math.min(a.hist[i],b.hist[i]);hist=Math.min(1,hist);
  return Math.max(0,Math.min(1,.36*hash+.29*tones+.2*hist+.15*colors));
}

function appendUniqueVisualSample(samples,sample,limit){
  const list=Array.isArray(samples)?samples.slice():[];
  if(!list.some(existing=>visualSimilarity(existing,sample)>.992))list.push(sample);
  return list.slice(-limit);
}

function updateVisualTrainingStatus(kind){
  const item=kind==='item',samples=item?pendingItemVisualSamples:pendingLocationVisualSamples,status=$(item?'#itemVisualStatus':'#locationVisualStatus'),clear=$(item?'#clearItemVisual':'#clearLocationVisual');if(!status||!clear)return;
  const maximum=item?6:4,count=samples.length;status.textContent=count?`${count} von ${maximum} Ansichten angelernt. ${count<(item?3:2)?'Für stabilere Treffer weitere Perspektiven ergänzen.':'Bereit für die Smart-Kamera.'}`:item?'Noch nicht angelernt. Für gute Treffer 3–6 Ansichten bei ruhigem Hintergrund aufnehmen.':'Noch nicht angelernt. Fotografiere Regal oder Box aus 2–4 typischen Blickwinkeln.';clear.hidden=!count;
}

async function trainVisualFiles(files,kind){
  const item=kind==='item',limit=item?6:4,list=[...files].slice(0,limit);if(!list.length)return;
  const status=$(item?'#itemVisualStatus':'#locationVisualStatus');status.textContent=`${list.length} Ansicht(en) werden lokal ausgewertet …`;
  try{for(const file of list){const sample=await createVisualFingerprint(file);if(item)pendingItemVisualSamples=appendUniqueVisualSample(pendingItemVisualSamples,sample,limit);else pendingLocationVisualSamples=appendUniqueVisualSample(pendingLocationVisualSamples,sample,limit);}updateVisualTrainingStatus(kind);toast('Fotoerkennung lokal angelernt');}
  catch(error){console.error(error);status.textContent='Mindestens ein Bild konnte nicht ausgewertet werden. Bitte erneut fotografieren.';}
}

$('#trainItemVisual').onchange=async event=>{await trainVisualFiles(event.target.files,'item');event.target.value='';};
$('#trainLocationVisual').onchange=async event=>{await trainVisualFiles(event.target.files,'location');event.target.value='';};
$('#clearItemVisual').onclick=()=>{if(confirm('Alle angelernten Ansichten dieses Artikels löschen?')){pendingItemVisualSamples=[];updateVisualTrainingStatus('item');}};
$('#clearLocationVisual').onclick=()=>{if(confirm('Alle angelernten Ansichten dieses Lagerplatzes löschen?')){pendingLocationVisualSamples=[];updateVisualTrainingStatus('location');}};

async function ensureLegacyVisualSamples(progress){
  const missing=state.items.filter(item=>item.photo&&(!Array.isArray(item.visualSamples)||!item.visualSamples.length));if(!missing.length)return;
  let changed=false,index=0;for(const item of missing){try{item.visualSamples=[await createVisualFingerprint(item.photo)];changed=true;}catch(error){console.warn('Altes Artikelfoto konnte nicht angelernt werden:',error);}index++;progress?.(index,missing.length);if(index%6===0)await new Promise(resolve=>requestAnimationFrame(resolve));}if(changed)persistState();
}

function bestVisualCandidates(sample){
  const candidates=[];
  for(const item of state.items.filter(entry=>!entry.archived)){const samples=item.visualSamples||[];if(samples.length<3)continue;const scores=samples.map(learned=>visualSimilarity(sample,learned)).sort((a,b)=>b-a),confidence=.65*scores[0]+.35*(scores.slice(0,3).reduce((sum,value)=>sum+value,0)/Math.min(3,scores.length));candidates.push({kind:'item',entity:item,confidence,source:'photo',sampleCount:samples.length});}
  for(const location of state.locations||[]){const samples=location.visualSamples||[];if(samples.length<2)continue;const scores=samples.map(learned=>visualSimilarity(sample,learned)).sort((a,b)=>b-a),confidence=.7*scores[0]+.3*(scores.slice(0,2).reduce((sum,value)=>sum+value,0)/Math.min(2,scores.length));candidates.push({kind:'location',entity:location,confidence,source:'photo',sampleCount:samples.length});}
  return candidates.sort((a,b)=>b.confidence-a.confidence).slice(0,3);
}

function compactCode(value){return normalizedText(value).replace(/[^a-z0-9]/g,'');}
function findKnownCode(text,exactOnly=false){
  const raw=String(text||''),compact=compactCode(raw),tokens=raw.split(/[\s,;:()[\]{}<>|]+/).map(compactCode).filter(Boolean),entries=[...state.items.flatMap(item=>[{kind:'item',entity:item,code:item.barcode},{kind:'item',entity:item,code:item.sku}]),...(state.locations||[]).map(entity=>({kind:'location',entity,code:entity.code}))].filter(entry=>compactCode(entry.code).length>=4).sort((a,b)=>String(b.code).length-String(a.code).length);
  const matches=entries.filter(entry=>{const code=compactCode(entry.code),numeric=/^\d+$/.test(code);if(numeric&&(code.length===8||code.length===13)&&typeof validEan==='function'&&!validEan(code))return false;if(exactOnly)return compact===code;if(tokens.includes(code))return true;return code.length>=8&&compact.includes(code);});
  const unique=[...new Map(matches.map(entry=>[`${entry.kind}:${entry.entity.id}`,entry])).values()];return unique.length===1?unique[0]:null;
}

function suggestionFromText(text){
  const normalized=normalizedText(text),type=TEXTILE_TYPES.find(entry=>entry.match.test(normalized)),brand=(state.brands||[]).find(value=>normalized.includes(normalizedText(value))),material=(state.materials||[]).find(value=>normalized.includes(normalizedText(value))),location=(state.locations||[]).find(value=>normalized.includes(normalizedText(value.name)));
  return{category:type?.label||'',brand:brand||'',material:material||'',location:location?.name||''};
}

async function stopSmartBarcodeReader(){const reader=smartBarcodeReaderInstance;smartBarcodeReaderInstance=null;if(reader)try{await withTimeout(reader.clear(),2000,'Scanner wurde freigegeben');}catch{}}
async function scanBarcodeFromFile(file,run){
  if(typeof Html5Qrcode==='undefined')return'';let reader;
  try{await stopSmartBarcodeReader();if(run!==smartAnalysisRun)return'';reader=new Html5Qrcode('smartBarcodeReader',{verbose:false});smartBarcodeReaderInstance=reader;return String(await withTimeout(reader.scanFile(file,true),7000,'Barcode-Suche beendet')||'').trim();}catch{return'';}finally{if(smartBarcodeReaderInstance===reader)smartBarcodeReaderInstance=null;try{await withTimeout(reader?.clear()||Promise.resolve(),2000,'Scanner wurde freigegeben');}catch{}}
}

function loadTesseractLocal(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);if(window.__hp67TesseractPromise)return window.__hp67TesseractPromise;
  window.__hp67TesseractPromise=withTimeout(new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';script.onload=()=>resolve(window.Tesseract);script.onerror=()=>reject(new Error('Texterkennung konnte nicht geladen werden.'));document.head.append(script);}),15000,'Texterkennung reagiert nicht').catch(error=>{window.__hp67TesseractPromise=null;throw error;});return window.__hp67TesseractPromise;
}

function smartRunActive(run){return run===smartAnalysisRun&&$('#smartCameraDialog').open;}
function setSmartProgress(value,label,run=smartAnalysisRun){if(!smartRunActive(run))return;$('#smartProgressBar').style.width=`${Math.max(0,Math.min(100,value))}%`;if(label)$('#smartCameraStatus').textContent=label;}
function candidateTitle(candidate){return candidate.kind==='item'?candidate.entity.name:`Lagerplatz ${candidate.entity.name}`;}
function candidateDetails(candidate){if(candidate.kind==='item'){const item=candidate.entity;return[ item.category,item.sku,item.color,item.size,item.location,`Bestand ${number(item.stock)}`].filter(Boolean).join(' · ');}const location=candidate.entity,items=state.items.filter(item=>!item.archived&&normalizedText(item.location)===normalizedText(location.name));return`${location.code} · ${items.length} Variante(n) · ${number(items.reduce((sum,item)=>sum+(+item.stock||0),0))} Teile`;}

function selectSmartCandidate(index){
  smartSelected=Number(index);$$('[data-smart-candidate]').forEach((element,i)=>element.classList.toggle('selected',i===smartSelected));const candidate=smartCandidates[smartSelected],actions=$('#smartCameraActions');actions.hidden=false;
  const canBook=candidate?.kind==='item'&&!candidate.blocked&&!candidate.ambiguous;$('#smartOpenResult').hidden=!candidate;$('#smartPurchaseResult').hidden=!canBook;$('#smartSaleResult').hidden=!canBook;$('#smartShowLocation').hidden=true;$('#smartCreateItem').hidden=!!candidate&&!smartUnknownCode;
  if(candidate)$('#smartOpenResult').textContent=candidate.kind==='item'?'Artikel öffnen':'Lagerplatz anzeigen';
}

function renderSmartResults(notes=[]){
  const root=$('#smartCameraResults'),cards=smartCandidates.map((candidate,index)=>{const exact=candidate.source==='barcode'&&!candidate.blocked,percent=Math.round(candidate.confidence*100),source=candidate.source==='barcode'?'Barcode exakt':candidate.source==='ocr'?'Code aus Etikettentext':`Lokaler Fotovergleich · ${percent} %`,suffix=candidate.blocked?' · Buchung gesperrt':candidate.ambiguous?' · mehrere ähnliche Treffer':exact?' · eindeutig':' · bitte bestätigen';return`<button type="button" class="smart-result ${exact?'exact':candidate.confidence>=.86&&!candidate.blocked?'suggestion':'warning'}" data-smart-candidate="${index}"><b>${esc(candidateTitle(candidate))}</b><small>${esc(candidateDetails(candidate))}</small><small class="confidence">${esc(source+suffix)}</small></button>`;}).join('');
  const info=notes.map(note=>`<div class="smart-result ${note.type||''}"><b>${esc(note.title)}</b><small>${esc(note.text)}</small></div>`).join('');root.innerHTML=cards+info;$$('[data-smart-candidate]',root).forEach(button=>button.onclick=()=>selectSmartCandidate(button.dataset.smartCandidate));selectSmartCandidate(smartCandidates.length?0:-1);
}

async function analyzeSmartPhoto(file){
  if(!file)return;const run=++smartAnalysisRun;await stopSmartBarcodeReader();if(run!==smartAnalysisRun)return;smartCandidates=[];smartSelected=-1;smartUnknownCode='';smartNewSuggestion={};if(smartPreviewUrl)URL.revokeObjectURL(smartPreviewUrl);smartPreviewUrl=URL.createObjectURL(file);$('#smartCameraPreview').src=smartPreviewUrl;$('#smartCameraResults').innerHTML='';$('#smartCameraActions').hidden=true;if(!$('#smartCameraDialog').open)$('#smartCameraDialog').showModal();setSmartProgress(8,'Foto wird ausschließlich auf diesem Gerät vorbereitet …',run);
  const notes=[];let fingerprint,barcode='',ocrText='',analysisFile=file;
  try{
    analysisFile=await prepareOcrImage(file,1900);if(!smartRunActive(run))return;fingerprint=await createVisualFingerprint(analysisFile);if(!smartRunActive(run))return;setSmartProgress(23,'Bildmerkmale erstellt. Suche nach Barcode …',run);
    barcode=await scanBarcodeFromFile(file,run);if(!smartRunActive(run))return;if(barcode){const exact=findKnownCode(barcode,true);if(exact)smartCandidates.push({...exact,source:'barcode',confidence:1});else{smartUnknownCode=barcode;notes.push({type:'warning',title:'Neuer Barcode erkannt',text:`${barcode} ist noch nicht zugeordnet. Fotoähnlichkeiten werden nur als Hinweis gezeigt und können nicht gebucht werden.`});}}
    setSmartProgress(40,'Bekannte Artikelfotos und Lagerplätze werden lokal verglichen …',run);await ensureLegacyVisualSamples((done,total)=>setSmartProgress(40+Math.round(done/total*18),`Vorhandene Artikelfotos werden einmalig vorbereitet: ${done}/${total}`,run));if(!smartRunActive(run))return;
    const visual=bestVisualCandidates(fingerprint).filter(candidate=>candidate.confidence>=.72),visualAmbiguous=visual.length>1&&visual[0].confidence-visual[1].confidence<.07;for(const candidate of visual)if(!smartCandidates.some(existing=>existing.kind===candidate.kind&&existing.entity.id===candidate.entity.id))smartCandidates.push({...candidate,ambiguous:visualAmbiguous,blocked:!!smartUnknownCode});
    const exactBarcode=smartCandidates.some(candidate=>candidate.source==='barcode'&&!candidate.blocked);
    if(exactBarcode){smartNewSuggestion={barcode:smartUnknownCode};setSmartProgress(88,'Bekannter Barcode eindeutig zugeordnet.',run);}
    else{setSmartProgress(63,'Etikettentext und Artikelcodes werden gelesen …',run);
      try{const tesseract=await loadTesseractLocal();if(!smartRunActive(run))return;const result=await withTimeout(tesseract.recognize(analysisFile,'deu+eng',{logger:message=>{if(message.status==='recognizing text')setSmartProgress(63+Math.round((message.progress||0)*25),`Text wird lokal erkannt … ${Math.round((message.progress||0)*100)} %`,run);}}),45000,'Texterkennung nach 45 Sekunden beendet');if(!smartRunActive(run))return;ocrText=String(result?.data?.text||'');const exact=findKnownCode(ocrText);if(exact&&!smartCandidates.some(candidate=>candidate.kind===exact.kind&&candidate.entity.id===exact.entity.id))smartCandidates.unshift({...exact,source:'ocr',confidence:.96,blocked:!!smartUnknownCode});smartNewSuggestion={...suggestionFromText(ocrText),barcode:smartUnknownCode};}
      catch(error){console.warn(error);smartNewSuggestion={barcode:smartUnknownCode};notes.push({title:'Texterkennung offline nicht verfügbar',text:'Barcode- und Fotovergleich funktionieren trotzdem. Für OCR wird beim ersten Mal kurz Internet benötigt.'});}
    }
    if(!smartRunActive(run))return;smartCandidates.sort((a,b)=>(b.confidence+(b.source==='barcode'?2:b.source==='ocr'?0.5:0))-(a.confidence+(a.source==='barcode'?2:a.source==='ocr'?0.5:0)));
    if(!smartCandidates.length){const category=smartNewSuggestion.category;notes.push({type:'warning',title:category?`Textilart vorgeschlagen: ${category}`:'Kein sicherer Treffer',text:category?'Aus lesbarem Etikettentext abgeleitet. Bitte beim Anlegen prüfen und anschließend 3–6 Fotoansichten anlernen.':'Das Motiv ist noch nicht angelernt und besitzt keinen lesbaren Code. Artikel einmal zuordnen und Fotoerkennung anlernen.'});}
    else if(visualAmbiguous)notes.push({type:'warning',title:'Mehrere ähnlich gute Foto-Treffer',text:'Eine Bestandsbuchung ist gesperrt. Bitte den Artikel öffnen und Variante prüfen oder den eindeutigen Barcode scannen.'});else if(smartCandidates[0].source==='photo'&&smartCandidates[0].confidence<.86)notes.push({type:'warning',title:'Ähnlichkeit nicht hoch genug',text:'Der Treffer wird nur als mögliche Hilfe gezeigt. Bitte Artikelname, Farbe und Größe kontrollieren.'});
    const hasExact=smartCandidates.some(candidate=>candidate.source==='barcode'&&!candidate.blocked);setSmartProgress(100,hasExact?'Eindeutiger Barcode gefunden. Ergebnis bitte prüfen.':smartCandidates.length?'Analyse fertig. Nicht eindeutige Treffer müssen bestätigt werden.':'Kein sicherer Treffer. Bitte einmal zuordnen und anschließend anlernen.',run);renderSmartResults(notes);
  }catch(error){if(!smartRunActive(run))return;console.error(error);setSmartProgress(100,'Dieses Foto konnte nicht analysiert werden. Bitte ein schärferes Bild bei gleichmäßigem Licht aufnehmen.',run);renderSmartResults([{type:'warning',title:'Analyse fehlgeschlagen',text:'Das Bildformat wird möglicherweise nicht unterstützt oder die Datei ist beschädigt.'}]);}
}

$('#smartCameraInput').onchange=$('#smartGalleryInput').onchange=async event=>{const file=event.target.files[0];event.target.value='';await analyzeSmartPhoto(file);};
$('#smartCameraDialog').addEventListener('close',()=>{smartAnalysisRun++;stopSmartBarcodeReader();if(smartPreviewUrl){URL.revokeObjectURL(smartPreviewUrl);smartPreviewUrl='';}});

function currentSmartCandidate(){return smartCandidates[smartSelected]||null;}
function closeSmartDialog(){if($('#smartCameraDialog').open)$('#smartCameraDialog').close();}
function showSmartLocation(location){closeSmartDialog();navigate('inventory');$('#search').value=location.name;inventoryFilter='all';inventoryLimit=100;syncFilterChips();renderInventory();toast(`Lagerplatz ${location.name} geöffnet`);}
$('#smartOpenResult').onclick=()=>{const candidate=currentSmartCandidate();if(!candidate)return;closeSmartDialog();if(candidate.kind==='item')openItem(candidate.entity.id);else showSmartLocation(candidate.entity);};
$('#smartShowLocation').onclick=()=>{const candidate=currentSmartCandidate();if(candidate?.kind==='location')showSmartLocation(candidate.entity);};
function bookSmartCandidate(type){const candidate=currentSmartCandidate();if(candidate?.kind!=='item'||candidate.blocked||candidate.ambiguous)return;const item=candidate.entity,needsConfirmation=candidate.source!=='barcode';if(needsConfirmation&&!confirm(`${candidate.source==='photo'?'Foto-Treffer':'Code aus Etikettentext'} „${item.name}“${candidate.source==='photo'?` (${Math.round(candidate.confidence*100)} %)`:''} wirklich bestätigen und 1 Stück ${type==='purchase'?'einbuchen':'ausbuchen'}?`))return;if(type==='sale'&&item.stock<=0){toast('Artikel ist bereits ausverkauft');return;}const before=item.stock;item.stock+=type==='purchase'?1:-1;state.transactions.push({id:uid(),itemId:item.id,itemName:item.name,type,quantity:1,unitPrice:type==='sale'?item.salePrice:item.cost,unitCost:item.cost,costBefore:item.cost,stockBefore:before,stockAfter:item.stock,note:`Smart-Kamera · ${candidate.source==='barcode'?'Barcode exakt':candidate.source==='photo'?'Foto bestätigt':'Textcode bestätigt'}`,date:new Date().toISOString()});save();closeSmartDialog();toast(type==='purchase'?'+1 per Smart-Kamera eingebucht':'−1 per Smart-Kamera ausgebucht');}
$('#smartPurchaseResult').onclick=()=>bookSmartCandidate('purchase');$('#smartSaleResult').onclick=()=>bookSmartCandidate('sale');
$('#smartCreateItem').onclick=()=>{closeSmartDialog();openItem();const form=$('#itemForm');if(smartUnknownCode){form.elements.barcode.value=smartUnknownCode;updateItemBarcodePreview();}for(const field of ['category','brand','material','location'])if(smartNewSuggestion[field])form.elements[field].value=smartNewSuggestion[field];if(smartNewSuggestion.category&&!form.elements.name.value)form.elements.name.value=smartNewSuggestion.category.replace(/s$/,'');toast('Vorschläge übernommen – bitte kontrollieren und Artikel speichern');};
