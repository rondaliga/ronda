/* ==========================================================================
   Camada de dados
   - Sem configuração (js/config.js vazio): guarda tudo neste navegador (IndexedDB).
   - Com RONDA_CONFIG preenchido: usa o banco compartilhado (Supabase) protegido por
     um código de acesso da equipe, via funções SQL (veja supabase-setup.sql).
   API exposta: window.RH.store  →  { mode, open(), volatile(), exportJSON(), importJSON(), wipeAll(), changeCode() }
   `open()` devolve um objeto com collection(nome) e doc('colecao/id') no estilo Firestore.
   ========================================================================== */
(()=>{
const RH=window.RH=window.RH||{};
const CFG=window.RONDA_CONFIG||{},RAWURL=String(CFG.supabaseUrl||'').trim(),KEY=String(CFG.supabaseKey||'').trim(),REMOTE=!!(RAWURL||KEY);

/* aceita só o endereço do projeto; remove caminhos colados por engano (/rest/v1, link do painel etc.) */
function normUrl(u){if(!u)return '';if(!/^https?:\/\//i.test(u))u='https://'+u;
  try{const x=new URL(u),m=/(^|\.)supabase\.com$/.test(x.hostname)&&x.pathname.match(/\/project\/([a-z0-9]+)/i);return m?'https://'+m[1]+'.supabase.co':x.origin}catch(e){return ''}}
const BASE=normUrl(RAWURL);
function keyProblem(){
  if(!KEY)return 'A chave (supabaseKey) não foi preenchida em js/config.js.';
  let role='';try{if(KEY.startsWith('eyJ'))role=JSON.parse(atob(KEY.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role}catch(e){}
  if(KEY.startsWith('sb_secret_')||role==='service_role')return 'Esta é a chave SECRETA do projeto e nunca deve ficar em um site. Use a chave anon (ou publishable) em Project Settings → API.';
  return ''}

const DB='ronda-hospitalar',ST='docs',mem=new Map(),subs=new Set();
let idb=null,bc=null,volatile=false,code='';
const clone=o=>JSON.parse(JSON.stringify(o));
const err=(c,m)=>Object.assign(new Error(m),{code:c,message:m});
const split=p=>{const i=p.indexOf('/');return[p.slice(0,i),p.slice(i+1)]};
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
let pend=false;const notify=()=>{if(pend)return;pend=true;queueMicrotask(()=>{pend=false;subs.forEach(s=>s.run())})};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------- modo local (IndexedDB) ---------- */
const L={
  open(){return new Promise(res=>{try{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(ST,{keyPath:'p'});r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);r.onblocked=()=>res(null)}catch(e){res(null)}})},
  tx(mode,fn){return new Promise((res,rej)=>{if(!idb)return res();const t=idb.transaction(ST,mode);fn(t.objectStore(ST));t.oncomplete=()=>res();t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})},
  async loadAll(){mem.clear();if(!idb)return;await new Promise((res,rej)=>{const r=idb.transaction(ST).objectStore(ST).getAll();r.onsuccess=()=>{r.result.forEach(x=>mem.set(x.p,x.d));res()};r.onerror=()=>rej(r.error)})},
  async persist(p,d){if(d===null)await L.tx('readwrite',s=>s.delete(p));else await L.tx('readwrite',s=>s.put({p,d}));try{bc&&bc.postMessage(1)}catch(e){}},
  async init(){idb=await L.open();if(!idb){volatile=true;console.warn('IndexedDB indisponível: dados só ficam na memória desta aba.')}
    try{await L.loadAll()}catch(e){console.error(e)}
    try{bc=new BroadcastChannel(DB);bc.onmessage=async()=>{try{await L.loadAll();notify()}catch(e){}}}catch(e){}}
};

/* ---------- modo compartilhado (Supabase) ---------- */
let badge=null;
function status(ok,msg){
  if(ok){if(badge){badge.remove();badge=null}return}
  if(!badge){badge=document.createElement('div');badge.setAttribute('role','status');badge.style.cssText='position:fixed;left:12px;bottom:12px;z-index:95;background:var(--warn-bg,#fdf0d0);color:var(--warn,#855400);border:1px solid var(--line2,#ccc);padding:8px 12px;border-radius:10px;font:500 13px var(--font,system-ui);box-shadow:0 4px 14px rgba(0,0,0,.2)';document.body.appendChild(badge)}
  badge.textContent=msg||'Sem conexão com o servidor. Tentando novamente…'}
async function rpc(fn,args){
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),25000),h={'Content-Type':'application/json',apikey:KEY};
  if(KEY.startsWith('eyJ'))h.Authorization='Bearer '+KEY;
  let r;try{r=await fetch(`${BASE}/rest/v1/rpc/${fn}`,{method:'POST',headers:h,body:JSON.stringify({p_code:code,...args}),signal:ctl.signal})}
  catch(e){throw Object.assign(err('unavailable','Sem conexão com o servidor.'),{net:true})}finally{clearTimeout(t)}
  const txt=await r.text();let j=null;try{j=txt?JSON.parse(txt):null}catch(e){}
  if(!r.ok){const m=(j&&(j.message||j.hint))||txt||('HTTP '+r.status);throw Object.assign(err(/codigo_invalido/.test(m)?'bad_code':'unavailable',m),{status:r.status})}
  return j}
function overlay(html){const o=document.createElement('div');o.style.cssText='position:fixed;inset:0;z-index:100;background:var(--bg,#f2f5f6);color:var(--ink,#0e2830);display:grid;place-items:center;padding:16px;font:14px/1.5 var(--font,system-ui)';
  o.innerHTML=`<div style="width:100%;max-width:400px;display:grid;gap:14px;background:var(--surface,#fff);border:1px solid var(--line,#dce5e8);border-radius:14px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.12)">${html}</div>`;document.body.appendChild(o);return o}
function askCode(msg){return new Promise(res=>{
  const o=overlay(`<h1 style="margin:0;font-size:20px">Código de acesso da equipe</h1><p style="margin:0;color:var(--ink2,#46606a)">Digite o código fornecido pelo administrador para abrir a base de dados compartilhada. Ele fica salvo neste aparelho.</p>
  <form id="rh-code" style="display:grid;gap:12px"><input id="rh-code-i" type="password" autocomplete="off" required placeholder="Código de acesso" style="width:100%;padding:10px 12px;border:1px solid var(--line2,#c6d4d9);border-radius:8px;background:var(--surface,#fff);color:inherit;font:inherit;min-height:40px"><div role="alert" style="color:var(--bad,#b42323);font-weight:500;min-height:20px">${msg||''}</div>
  <button style="background:var(--brand,#0a6c7d);color:var(--on-brand,#fff);border:0;border-radius:8px;padding:10px;font:600 14px var(--font,system-ui);min-height:40px;cursor:pointer">Continuar</button></form>`);
  const i=o.querySelector('#rh-code-i');i.focus();o.querySelector('form').onsubmit=e=>{e.preventDefault();o.remove();res(i.value.trim())}})}
function fatal(msg){return new Promise(res=>{const o=overlay(`<h1 style="margin:0;font-size:20px">Não foi possível conectar</h1><p style="margin:0;color:var(--ink2,#46606a)">${msg}</p><button style="background:var(--brand,#0a6c7d);color:var(--on-brand,#fff);border:0;border-radius:8px;padding:10px;font:600 14px var(--font,system-ui);min-height:40px;cursor:pointer">Tentar novamente</button>`);o.querySelector('button').onclick=()=>{o.remove();res()}})}
function explain(e){
  const m=String(e.message||'');
  if(e.net)return 'Verifique sua internet e tente de novo.';
  if(/Invalid path|Invalid URL|Not Found/i.test(m)&&!/function/i.test(m))return 'A URL do projeto parece incorreta. Use apenas o endereço no formato https://xxxxxxxx.supabase.co (Supabase → Project Settings → API → Project URL).';
  if(e.status===401||e.status===403||/Invalid API key|JWT|apikey/i.test(m))return 'A chave do projeto foi recusada. Copie a chave anon (ou publishable) em Supabase → Project Settings → API.';
  if(/Could not find the function|PGRST202|schema cache/i.test(m))return 'O script supabase-setup.sql ainda não foi executado neste projeto. Rode-o no SQL Editor do Supabase e tente de novo.';
  return 'O servidor recusou a conexão ('+esc(m)+'). Confira a URL e a chave em js/config.js e se o script supabase-setup.sql foi executado.'}
async function authenticate(msg){
  for(;;){
    const kp=keyProblem();if(!BASE){await fatal('A URL em js/config.js (supabaseUrl) está vazia ou inválida. Use o formato https://xxxxxxxx.supabase.co.');continue}
    if(kp){await fatal(esc(kp));continue}
    if(!code){try{code=localStorage.getItem('rh_code')||''}catch(e){}}
    if(!code){try{await rpc('rh_check',{})}catch(e){if(e.code!=='bad_code'){await fatal(explain(e));continue}}
      code=await askCode(msg);msg=''}
    try{await rpc('rh_check',{});try{localStorage.setItem('rh_code',code)}catch(e){}return}
    catch(e){
      if(e.code==='bad_code'){code='';try{localStorage.removeItem('rh_code')}catch(x){}msg='Código incorreto. Tente novamente.';continue}
      await fatal(explain(e))}
  }}
let since=0,polling=false,pollT=null;const pendingPaths=new Map();
async function pull(){
  if(polling)return;polling=true;
  try{let changed=false,from=since>0?Math.max(1,since-100):0;
    for(;;){const rows=await rpc('rh_pull',{p_since:from,p_fotos:false})||[];
      for(const r of rows){if(r.seq>since)since=r.seq;from=r.seq;if(pendingPaths.has(r.p))continue;
        if(r.deleted){if(mem.delete(r.p))changed=true}
        else{const o=mem.get(r.p);if(JSON.stringify(o)!==JSON.stringify(r.d)){mem.set(r.p,r.d);changed=true}}}
      if(rows.length<1000)break}
    status(true);if(changed)notify();
  }catch(e){
    if(e.code==='bad_code'){code='';try{localStorage.removeItem('rh_code')}catch(x){}clearInterval(pollT);await authenticate('O código de acesso mudou. Digite o novo código.');since=0;mem.clear();polling=false;await pull();pollT=setInterval(tick,4000);return}
    status(false)}
  finally{polling=false}}
const tick=()=>{if(!document.hidden)pull()};
let q=[],timer=null,flushing=false;
const inc=p=>pendingPaths.set(p,(pendingPaths.get(p)||0)+1),dec=p=>{const n=(pendingPaths.get(p)||1)-1;if(n)pendingPaths.set(p,n);else pendingPaths.delete(p)};
function enqueue(p,d){return new Promise((res,rej)=>{q.push({p,d,res,rej});inc(p);if(!timer)timer=setTimeout(flush,25)})}
async function flush(){
  timer=null;if(flushing){timer=setTimeout(flush,40);return}flushing=true;
  try{while(q.length){const batch=[];let size=0;
      while(q.length&&batch.length<50&&(!batch.length||size<500000)){const it=q.shift();batch.push(it);size+=it.d?JSON.stringify(it.d).length:20}
      let lastErr=null;
      for(let k=0;k<3;k++){try{await rpc('rh_put_many',{p_items:batch.map(i=>({p:i.p,d:i.d}))});lastErr=null;break}catch(e){lastErr=e;if(e.code==='bad_code'||e.status===400||e.status===413)break;await sleep(600*(k+1))}}
      batch.forEach(i=>{dec(i.p);lastErr?i.rej(lastErr):i.res()});
      if(lastErr)status(false,lastErr.net?undefined:'Não foi possível salvar no servidor.');
    }}finally{flushing=false}}
const R={
  async init(){await authenticate('');await pull();pollT=setInterval(tick,4000);document.addEventListener('visibilitychange',tick);addEventListener('online',tick)},
  persist:(p,d)=>enqueue(p,d)
};
const B=REMOTE?R:L,persist=(p,d)=>B.persist(p,d);

/* ---------- API no estilo Firestore ---------- */
const snap=(p,d)=>({id:p.slice(p.lastIndexOf('/')+1),exists:d!==undefined,data:()=>d===undefined?undefined:clone(d),metadata:{fromCache:false,hasPendingWrites:false}});
const merge=(old,d)=>{const v={...old};for(const[k,x]of Object.entries(clone(d))){if(x&&x.__delete__)delete v[k];else v[k]=x}return v};
async function write(p,next){
  const prev=mem.get(p);
  if(next===null)mem.delete(p);else mem.set(p,next);notify();
  try{await persist(p,next)}catch(e){if(prev===undefined)mem.delete(p);else mem.set(p,prev);notify();throw e}}
function docRef(p){
  return{id:p.slice(p.lastIndexOf('/')+1),path:p,
    async get(){if(REMOTE&&p.startsWith('fotos/')&&!mem.has(p)){const d=await rpc('rh_get',{p_path:p});if(d)mem.set(p,d)}return snap(p,mem.get(p))},
    async set(d){if(!d||typeof d!=='object')throw err('invalid_argument','corpo inválido');await write(p,clone(d))},
    async update(d){if(!mem.has(p))throw err('not_found','documento não existe');await write(p,merge(mem.get(p),d))},
    async delete(){await write(p,null)},
    onSnapshot(f){const s={run:()=>f(snap(p,mem.get(p)))};subs.add(s);setTimeout(s.run,0);return()=>subs.delete(s)}};
}
function query(col,o,l,w){
  const q={orderBy(f,d){return query(col,[f,d||'asc'],l,w)},limit(n){return query(col,o,n,w)},where(f,op,v){return query(col,o,l,[...w,[f,op,v]])},
    rows(){let r=[];mem.forEach((d,p)=>{const[c,id]=split(p);if(c===col)r.push([id,d])});
      w.forEach(([f,op,v])=>{r=r.filter(([,d])=>op==='=='?d[f]===v:op==='!='?d[f]!==v:op==='<'?d[f]<v:op==='<='?d[f]<=v:op==='>'?d[f]>v:op==='>='?d[f]>=v:true)});
      if(o){const[f,dir]=o;r.sort((a,b)=>{const x=a[1][f],y=b[1][f];return((x==null)-(y==null))||(x>y?1:x<y?-1:0)*(dir==='desc'?-1:1)})}else r.sort((a,b)=>a[0]<b[0]?-1:1);
      if(l)r=r.slice(0,l);return r},
    async get(){const r=q.rows().map(([id,d])=>snap(col+'/'+id,d));return{docs:r,size:r.length,empty:!r.length,docChanges:()=>[],metadata:{}}},
    onSnapshot(f){const s={run:()=>{const r=q.rows().map(([id,d])=>snap(col+'/'+id,d));f({docs:r,size:r.length,empty:!r.length,docChanges:()=>[],metadata:{}})}};subs.add(s);setTimeout(s.run,0);return()=>subs.delete(s)}};
  return q}
const collection=c=>Object.assign(query(c,null,null,[]),{path:c,doc:id=>docRef(c+'/'+(id||Math.random().toString(36).slice(2))),async add(d){const r=this.doc();await r.set(d);return r}});
const api={collection,doc:docRef};

/* ---------- backup / manutenção ---------- */
let started=null;
RH.store={
  mode:REMOTE?'remote':'local',
  volatile:()=>volatile,
  async open(){if(!started)started=B.init();await started;return api},
  async exportJSON(){
    const docs=[...mem.entries()].filter(([p])=>!p.startsWith('fotos/')).map(([p,d])=>({p,d}));
    if(REMOTE){let from=0;for(;;){const rows=await rpc('rh_pull',{p_since:from,p_fotos:true})||[];rows.forEach(r=>{from=r.seq;if(!r.deleted&&r.p.startsWith('fotos/'))docs.push({p:r.p,d:r.d})});if(rows.length<1000)break}}
    else mem.forEach((d,p)=>{if(p.startsWith('fotos/'))docs.push({p,d})});
    return JSON.stringify({app:'ronda-hospitalar',v:1,exportadoEm:new Date().toISOString(),docs})},
  async importJSON(txt){const j=JSON.parse(txt);if(j.app!=='ronda-hospitalar'||!Array.isArray(j.docs))throw new Error('Arquivo de backup inválido.');
    let n=0;for(const x of j.docs){if(typeof x.p!=='string'||!x.p.includes('/')||!x.d||typeof x.d!=='object')continue;mem.set(x.p,x.d);await persist(x.p,x.d);n++}notify();return n},
  async wipeAll(){if(REMOTE)throw new Error('Indisponível no modo compartilhado.');const n=mem.size;mem.clear();await L.tx('readwrite',s=>s.clear());notify();return n},
  changeCode(){try{localStorage.removeItem('rh_code')}catch(e){}location.reload()}
};
})();
