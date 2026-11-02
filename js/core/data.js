/* ==========================================================================
   Núcleo · acesso aos dados
   - put / upd / del : gravam, atualizam e apagam documentos ("coleção/id").
   - safe(fn)        : executa uma gravação e mostra uma mensagem clara se falhar.
   - syncAll()       : assina todas as coleções; a cada mudança atualiza RH.S e a tela.
   ========================================================================== */
(()=>{
const RH=window.RH,{S,st,COLS,byId}=RH;

RH.put=(c,id,d)=>st.db.doc(`${c}/${id}`).set(d);
RH.upd=(c,id,d)=>st.db.doc(`${c}/${id}`).update(d);
RH.del=(c,id)=>st.db.doc(`${c}/${id}`).delete();

RH.safe=async fn=>{
  try{return await fn()}
  catch(e){console.error(e);const c=e&&e.code;
    RH.toast(c==='not_found'?'Este registro não existe mais (foi excluído em outro aparelho). Atualize a tela.':c==='quota_exceeded'?'Limite de armazenamento atingido.':'Não foi possível salvar. Verifique a conexão e tente novamente.','bad');
    return undefined}};

const ready={};
function sync(col){
  let q=st.db.collection(col);if(col==='rondas'||col==='ncs')q=q.orderBy('ts','desc').limit(1000);
  q.onSnapshot(s=>{const rows=s.docs.map(d=>({id:d.id,...d.data()}));
    if(col==='config')S.cfg=rows.find(r=>r.id==='main')||{};else S[col]=rows;
    ready[col]=true;onData()},e=>{console.error(col,e);ready[col]=true;onData()});
}
function onData(){
  if(!st.booted){
    if(COLS.every(c=>ready[c])){st.booted=true;
      try{let id=sessionStorage.getItem('rh_uid'),pg=sessionStorage.getItem('rh_page');
        /* o celular pode descarregar a página enquanto a câmera está aberta e perder a sessão da aba:
           um marcador curto (15 min), gravado ao tocar em "Anexar foto", devolve o usuário à ronda em andamento */
        if(!id){const r=JSON.parse(localStorage.getItem('rh_resume')||'null');if(r&&r.uid&&Date.now()-r.ts<9e5){id=r.uid;pg=r.page;sessionStorage.setItem('rh_uid',id)}}
        localStorage.removeItem('rh_resume');
        const u=id&&byId(S.users,id);if(u&&u.ativo!==false){st.me=u;const ct=sessionStorage.getItem('rh_cadtab');if(pg)st.page=pg;if(ct)st.cadTab=ct}}catch(e){}
      RH.renderRoot();migrarLuz()}
    return}
  if(st.me){const u=byId(S.users,st.me.id);if(!u||u.ativo===false){RH.logout();return}st.me=u}
  clearTimeout(onData.t);onData.t=setTimeout(()=>RH.renderRoot(true),200);
  migrarLuz();
}
RH.syncAll=()=>COLS.forEach(sync);

/* ---------- migração: "Luz" → "Iluminação" nos checklists ----------
   Troca a palavra inteira (Luz/luz/Luzes) nos nomes e itens de checklists, salas e equipamentos já cadastrados.
   Roda sozinha quando um administrador está logado; é idempotente (sem "luz" restante, não grava nada).
   Rondas já realizadas não são alteradas (histórico fiel ao que foi respondido). */
const LUZ=/\bluz(es)?\b/gi;
const trocaLuz=t=>typeof t==='string'?t.replace(LUZ,(m,pl)=>{const r=pl?'iluminações':'iluminação';return m[0]===m[0].toUpperCase()?r[0].toUpperCase()+r.slice(1):r}):t;
RH.trocaLuz=trocaLuz;
let migrando=false;
async function migrarLuz(){
  if(migrando||!st.me||st.me.role!=='admin')return;
  const tarefas=[];
  ['checklists','salas','equipamentos'].forEach(c=>(S[c]||[]).forEach(d=>{
    const itens=(d.itens||[]).map(i=>({...i,t:trocaLuz(i.t)})),nome=c==='checklists'?trocaLuz(d.nome):d.nome;
    if(nome!==d.nome||itens.some((i,j)=>i.t!==d.itens[j].t))tarefas.push([c,d.id,{...(nome!==d.nome?{nome}:{}),itens}])}));
  if(!tarefas.length)return;
  migrando=true;
  try{for(const [c,id,patch] of tarefas)await RH.upd(c,id,patch)}catch(e){console.error('migração Luz→Iluminação',e)}
  finally{migrando=false}
}
RH.migrarLuz=migrarLuz;
})();
