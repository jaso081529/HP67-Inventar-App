const CACHE_PREFIX='hp67-inventar-';
const CACHE=`${CACHE_PREFIX}v35`;
const ASSETS=['./','./index.html','./update.html','./app.css','./app.js','./smart-camera.js','./manifest.webmanifest','./icon.svg','./vendor/html5-qrcode.min.js','./vendor/jsbarcode.min.js','./vendor/xlsx.full.min.js','./vendor/jspdf.umd.min.js','./vendor/jspdf.plugin.autotable.min.js','./vendor/jszip.min.js'];
const VERSIONED_ASSETS=['./v35/app.css','./v35/app.js','./v35/smart-camera.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(async cache=>{await cache.addAll(ASSETS);await Promise.all(VERSIONED_ASSETS.map(asset=>cache.add(asset).catch(()=>null)));}).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith(CACHE_PREFIX)||/^hp67-v\d+$/.test(k))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  if(e.request.mode==='navigate'){
    const requestUrl=new URL(e.request.url),scopeUrl=new URL(self.registration.scope),isShell=requestUrl.origin===scopeUrl.origin&&(requestUrl.pathname===scopeUrl.pathname||requestUrl.pathname===`${scopeUrl.pathname}index.html`);
    e.respondWith(fetch(e.request).then(response=>{if(response&&response.status===200)caches.open(CACHE).then(cache=>cache.put(isShell?'./index.html':e.request,response.clone()));return response;}).catch(()=>caches.match(e.request).then(response=>response||caches.match('./index.html'))));
    return;
  }
  const requestUrl=new URL(e.request.url),scopeUrl=new URL(self.registration.scope),isVersionedCore=requestUrl.origin===scopeUrl.origin&&requestUrl.pathname.startsWith(`${scopeUrl.pathname}v35/`);
  if(isVersionedCore){
    const fallbackAsset=`./${requestUrl.pathname.split('/').pop()}`;
    e.respondWith(fetch(e.request).then(response=>{if(!response||!response.ok)throw Error(`Asset ${response?.status||'offline'}`);caches.open(CACHE).then(cache=>cache.put(e.request,response.clone()));return response;}).catch(()=>caches.match(e.request).then(cached=>cached||caches.match(fallbackAsset))));
    return;
  }
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(cached=>cached||fetch(e.request).then(response=>{if(!response||response.status!==200||response.type==='opaque')return response;const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(e.request,copy));return response;})));
});
