const CACHE='hp67-v21';
const ASSETS=['./','./index.html','./app.css','./app.js','./manifest.webmanifest','./icon.svg','./vendor/html5-qrcode.min.js','./vendor/jsbarcode.min.js','./vendor/xlsx.full.min.js','./vendor/jspdf.umd.min.js','./vendor/jspdf.plugin.autotable.min.js','./vendor/jszip.min.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(response=>{if(response&&response.status===200)caches.open(CACHE).then(cache=>cache.put('./index.html',response.clone()));return response;}).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(cached=>cached||fetch(e.request).then(response=>{if(!response||response.status!==200||response.type==='opaque')return response;const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(e.request,copy));return response;})));
});
