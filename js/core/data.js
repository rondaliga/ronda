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
      RH.renderRoot();migrarLuz();setTimeout(()=>RH.limparFotos&&RH.limparFotos(),4000)}
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

/* ---------- limpeza automática das fotos completas ----------
   Para poupar o espaço do banco, a foto completa (coleção "fotos") de rondas e de não conformidades RESOLVIDAS
   com mais de RH.FOTOS_DIAS dias é apagada. A miniatura e o registro da ronda continuam no histórico.
   Ficam intactas: fotos de não conformidades ainda abertas/em tratamento e fotos de cadastro (equipamentos).
   Roda sozinha com um administrador logado, no máximo a cada 12 h por aparelho; é idempotente. */
RH.FOTOS_DIAS=60;
let limpando=false;
async function limparFotos(forcar){
  if(limpando||!st.me||st.me.role!=='admin')return 0;
  try{if(!forcar&&Date.now()-(+localStorage.getItem('rh_limpeza')||0)<432e5)return 0}catch(e){}
  limpando=true;let n=0;
  try{
    const corte=Date.now()-RH.FOTOS_DIAS*864e5;
    const protegidas=new Set((S.ncs||[]).filter(x=>x.status!=='resolvida'&&x.fotoId).map(x=>x.fotoId));
    /* NCs resolvidas e antigas */
    for(const x of (S.ncs||[]).filter(x=>x.status==='resolvida'&&x.fotoId&&x.ts<corte)){
      if(!protegidas.has(x.fotoId))await RH.del('fotos',x.fotoId);n++;await RH.upd('ncs',x.id,{fotoId:null})}
    /* rondas antigas (todas, inclusive além das 1000 mais recentes exibidas) */
    const antigas=(await st.db.collection('rondas').where('ts','<',corte).get()).docs.map(d=>({id:d.id,...d.data()})).filter(r=>(r.itens||[]).some(i=>i.fotoId));
    for(const r of antigas){
      const itens=r.itens.map(i=>{if(!i.fotoId)return i;const{fotoId,...resto}=i;return protegidas.has(fotoId)?i:resto});
      for(const i of r.itens)if(i.fotoId&&!protegidas.has(i.fotoId)){await RH.del('fotos',i.fotoId);n++}
      await RH.upd('rondas',r.id,{itens})}
    try{localStorage.setItem('rh_limpeza',String(Date.now()))}catch(e){}
  }catch(e){console.error('limpeza de fotos',e)}
  finally{limpando=false}
  return n}
RH.limparFotos=limparFotos;

/* ---------- estimativa de uso do banco ----------
   O app não consegue ler o tamanho real do banco (Supabase). Estima: texto de todos os registros (inclui as miniaturas)
   + fotos completas × tamanho médio. O administrador pode CALIBRAR com o número real mostrado no Supabase
   (guarda a diferença como "extra": índices, tabelas do sistema etc.). */
RH.FOTO_KB=135;   /* foto reduzida (~100 KB) em base64 + custo do registro */
async function armazenamento(){
  const limite=+S.cfg.dbLimiteMB||500,extra=Math.max(0,+S.cfg.dbExtraMB||0);
  const col=async n=>{try{return (await st.db.collection(n).get()).docs.map(d=>d.data())}catch(e){return S[n]||[]}};
  const [rondas,ncs]=await Promise.all([col('rondas'),col('ncs')]);
  const outros=Object.keys(S).filter(k=>Array.isArray(S[k])&&k!=='rondas'&&k!=='ncs'&&k!=='fotos');
  let bytes=JSON.stringify(rondas).length+JSON.stringify(ncs).length;outros.forEach(k=>{bytes+=JSON.stringify(S[k]).length});
  const ids=new Set(),dia=Date.now()-14*864e5,idsRec=new Set();
  rondas.forEach(r=>(r.itens||[]).forEach(i=>{if(i.fotoId){ids.add(i.fotoId);if(r.ts>=dia)idsRec.add(i.fotoId)}}));
  ncs.forEach(n=>{if(n.fotoId){ids.add(n.fotoId);if(n.ts>=dia)idsRec.add(n.fotoId)}});
  const fotoMB=RH.FOTO_KB/1024,docsMB=bytes/1048576;
  const bruto=docsMB+ids.size*fotoMB,usado=bruto+extra,fotosDia=idsRec.size/14;
  const porDia=fotosDia*fotoMB,restante=limite-usado;
  /* com a limpeza (fotos completas some após N dias), o consumo diário de fotos para de crescer */
  const estavel=usado-ids.size*fotoMB+fotosDia*RH.FOTOS_DIAS*fotoMB;
  const pct=Math.min(999,usado/limite*100);
  return{usadoMB:usado,limiteMB:limite,pct,fotos:ids.size,fotosDia,porDiaMB:porDia,
    diasRest:porDia>0?Math.max(0,Math.floor(restante/porDia)):null,estavelMB:estavel,
    estavel:estavel<limite*0.9,extraMB:extra,brutoMB:bruto,
    nivel:pct>=90?'critico':pct>=70?'atencao':'ok'}}
RH.armazenamento=armazenamento;
const mb=n=>n>=100?Math.round(n).toLocaleString('pt-BR'):n.toLocaleString('pt-BR',{maximumFractionDigits:1});
RH.fmtMB=mb;
/* aviso no painel (somente administrador) */
RH.armAviso=async()=>{
  const el=document.getElementById('arm-aviso');if(!el||!st.me||st.me.role!=='admin')return;
  let a;try{a=await armazenamento()}catch(e){return}
  if(a.nivel==='ok'||!document.getElementById('arm-aviso'))return;
  const prazo=a.diasRest!=null&&!a.estavel?` No ritmo atual (${mb(a.fotosDia)} fotos/dia), restam cerca de <b>${a.diasRest} dias</b>.`:'';
  document.getElementById('arm-aviso').innerHTML=`<div class="arm-banner ${a.nivel}" role="alert"><div><b>${a.nivel==='critico'?'Armazenamento quase cheio':'Armazenamento do banco em atenção'}: ~${mb(a.usadoMB)} de ${mb(a.limiteMB)} MB (${Math.round(a.pct)}%).</b>${prazo}</div><button class="btn sm" data-act="armVer">Ver detalhes</button></div>`};

setInterval(()=>{if(!document.hidden)limparFotos()},36e5);
})();
