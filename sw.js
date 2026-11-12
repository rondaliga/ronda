/* Service worker: deixa o app abrir sem internet (PWA). Os dados continuam no banco (local ou Supabase). */
const V='ronda-v1.0.9';
const ARQ=['./','index.html','manifest.webmanifest','css/styles.css','icons/icon-192.png','icons/icon-512.png','js/config.js','js/app.js',
'js/core/data-layer.js','js/core/utils.js','js/core/state.js','js/core/versao.js','js/core/access.js','js/core/security.js','js/core/agenda.js','js/core/orientacao.js','js/core/images.js','js/core/ui.js','js/core/data.js','js/core/local.js','js/core/barcode.js','js/core/native.js',
'js/features/painel.js','js/features/ronda.js','js/features/historico.js','js/features/ncs.js','js/features/cadastros.js','js/features/seed.js','js/features/auth.js','js/features/conta.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(ARQ.map(a=>new Request(a,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
/* arquivos do app: rede primeiro (pega atualização), cache se estiver sem internet. Banco (Supabase) nunca passa por aqui. */
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(r,{cache:'no-cache'}).then(x=>{if(x.ok){const c=x.clone();caches.open(V).then(h=>h.put(r,c))}return x}).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match('index.html'))))});
