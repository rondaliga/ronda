/* ==========================================================================
   Nova ronda: lista as rondas cadastradas (Cadastros → Rondas) que o usuário pode
   realizar e conduz o preenchimento do checklist de TODAS as salas da ronda.

   Regras de acesso:
   - ronda com responsável  → só ele a vê e realiza;
   - ronda com responsável "Todos" → todos os usuários com acesso à tela (todos os inspetores).
   Ao finalizar, gera um documento em `rondas` por sala visitada (todos com o mesmo
   execId, modeloId e modeloNome) e uma não conformidade em `ncs` para cada item NC.
   ========================================================================== */
(()=>{
const RH=window.RH;
const {$,esc,S,st,byId,userName,pc,ago,fdt,fd,ic,empty,toast,SEV}=RH;

/* A ronda é percorrida na ordem definida no cadastro: cada sala ou equipamento é um bloco.
   Alvo = o que recebe um checklist: a própria sala (a:'s') ou um equipamento (a:'e'). */
function blocosDa(m){
  const o=[];
  RH.ordemDaRonda(m).forEach(k=>{
    const id=k.slice(2);
    if(k[0]==='s'){const s=byId(S.salas,id);if(s&&s.ativo!==false)o.push({id:s.id,tipo:'sala',salaId:s.id,setor:s.setor||'Sem setor'})}
    else{const e=byId(S.equipamentos,id);if(e&&e.ativo!==false)o.push({id:'eq:'+e.id,tipo:'eq',salaId:null,setor:RH.setorEq(e)||'Sem setor',eqIds:[e.id]})}});
  return o}
function alvos(bl){
  if(bl.tipo==='sala'){const s=byId(S.salas,bl.salaId);return s?[{a:'s',i:s.id,n:s.nome,cl:byId(S.checklists,s.checklistId)}]:[]}
  return bl.eqIds.map(id=>byId(S.equipamentos,id)).filter(Boolean).map(e=>({a:'e',i:e.id,n:e.nome,eq:e,cl:byId(S.checklists,e.checklistId)}))}
const tagTipo=a=>a==='e'?'<span class="tag tag-e">Equipamento</span>':'<span class="tag tag-s">Sala</span>';
/* liberação em grupo definida no cadastro da ronda: 's:ID'/'e:ID' → id do bloco */
const blId=k=>k[0]==='s'?k.slice(2):'eq:'+k.slice(2);
const libDe=m=>{const o={};Object.entries(m.liberacao||{}).forEach(([d,k])=>{o[blId(d)]=blId(k)});return o};
const prefix=(sid,al)=>`${sid}:${al.a}:${al.i}:`;
const thumbEq=e=>e.thumb?`<img class="thumb" src="${e.thumb}" alt="${esc(e.nome)}">`:`<div class="thumb">${ic('dev',22)}</div>`;
RH.thumbEq=thumbEq;


/* ---------- lista de rondas ---------- */
const visiveis=()=>S.modelos.filter(m=>RH.access.rondaVisivel(m,st.me)).sort((a,b)=>a.nome.localeCompare(b.nome));
const lastExec=id=>{let l=null;S.rondas.forEach(r=>{if(r.modeloId===id&&(!l||r.ts>l.ts))l=r});return l};

RH.pages.ronda=()=>{
  const lista=visiveis();
  const vazio=!S.modelos.length
    ?empty('Nenhuma ronda cadastrada',st.me.role==='admin'?'Cadastre as rondas em Cadastros → Rondas (nome, salas e responsável).':'Peça ao administrador para cadastrar as rondas.')
    :empty('Nenhuma ronda disponível para você','As rondas são exibidas apenas ao responsável escolhido ou a todos os inspetores quando não há responsável. Fale com o administrador.');
  return `<div class="top"><div><h1>Nova ronda</h1><p>Escolha a ronda que você vai realizar.</p></div></div>
  ${st.R?`<div class="banner">Há uma ronda em andamento (${esc(st.R.nome)}). <button class="btn sm" data-act="resumeRonda">Continuar ronda</button></div>`:''}
  ${lista.length?`<div class="salas">${lista.map(m=>{
    const l=lastExec(m.id),late=RH.agenda.atrasada(m,l?l.ts:null),salas=RH.salasDaRonda(m),setores=[...new Set([...salas.map(s=>s.setor||'Sem setor'),...RH.equipsDaRonda(m).map(e=>RH.setorEq(e)||'Sem setor')])].sort((a,b)=>a.localeCompare(b)),prox=RH.agenda.proximo(m,Date.now());
    const ne=RH.equipsDaRonda(m).length;
    return `<button class="sala" data-act="pickRonda" data-id="${m.id}"><div class="h"><b>${esc(m.nome)}</b>${late?'<span class="pill late">Em atraso</span>':'<span class="pill okp">Em dia</span>'}</div>
    <div class="f"><span>${esc(setores.join(', ')||'—')}</span></div>
    <div class="f"><span>${salas.length} sala${salas.length===1?'':'s'}</span><span>${ne} equipamento${ne===1?'':'s'}</span></div>
    <div class="f"><span>Responsável: ${m.responsavelId?esc(userName(m.responsavelId)):'todos os inspetores'}</span></div>
    <small>${esc(RH.agenda.resumo(m))}${prox?` · próxima: ${RH.agenda.fmtSlot(prox)}`:''}</small>
    <small>${l?`Última realização ${ago(l.ts)}`:'Nunca realizada'}</small></button>`}).join('')}</div>`:vazio}`;
};

/* ---------- vínculo em lote: salas e equipamentos → ronda ----------
   Usado pelas Ações em Lote de Cadastros. Os itens são referenciados como na ordem de percurso:
   's:<id>' (sala) e 'e:<id>' (equipamento). Regra de negócio mantida: um item só pode estar em UMA ronda. */
const itemRef=k=>k[0]==='s'?byId(S.salas,k.slice(2)):k[0]==='e'?byId(S.equipamentos,k.slice(2)):null;
/* ronda (≠ ignorarId) que já contém o item, se houver */
RH.rondaDoItem=(k,ignorarId)=>S.modelos.find(m=>m.id!==ignorarId&&RH.ordemDaRonda(m).includes(k));
/* ordena para o percurso: setor → salas antes de equipamentos → nome */
RH.ordenaItens=keys=>{
  const setor=k=>k[0]==='s'?(itemRef(k)?.setor||''):(RH.setorEq(itemRef(k)||{})||'');
  return [...keys].sort((a,b)=>setor(a).localeCompare(setor(b))||a[0].localeCompare(b[0])*-1||(itemRef(a)?.nome||'').localeCompare(itemRef(b)?.nome||''))};
/* separa o que pode entrar na ronda do que será ignorado (e por quê). modeloId vazio = ronda nova */
RH.rondaPlano=(modeloId,keys)=>{
  const m=modeloId?byId(S.modelos,modeloId):null,atual=new Set(m?RH.ordemDaRonda(m):[]),add=[],skip={ja:[],outra:[],inativo:[]};
  keys.forEach(k=>{const x=itemRef(k);if(!x)return;
    if(atual.has(k))skip.ja.push(k);
    else if(x.ativo===false)skip.inativo.push(k);
    else if(RH.rondaDoItem(k,modeloId))skip.outra.push(k);
    else add.push(k)});
  return{m,add:RH.ordenaItens(add),skip}};
/* acrescenta ao fim da ronda (grava ordem + salaIds + equipIds, como o formulário da ronda). Devolve quantos entraram. */
RH.rondaAdicionar=async(modeloId,keys)=>{
  const{m,add}=RH.rondaPlano(modeloId,keys);if(!m||!add.length)return 0;
  const ordem=[...RH.ordemDaRonda(m),...add];
  await RH.upd('modelos',m.id,{ordem,salaIds:ordem.filter(k=>k[0]==='s').map(k=>k.slice(2)),equipIds:ordem.filter(k=>k[0]==='e').map(k=>k.slice(2))});
  return add.length};

/* ---------- execução ---------- */
function startRonda(id){
  const m=byId(S.modelos,id);if(!m)return;
  if(!RH.access.rondaVisivel(m,st.me)){toast('Você não tem acesso a esta ronda.','bad');return}
  const blocos=blocosDa(m);
  if(!blocos.length){toast('Esta ronda não tem salas nem equipamentos ativos. Ajuste em Cadastros → Rondas.','bad');return}
  st.R={modeloId:m.id,nome:m.nome,resp:m.responsavelId||'',blocos,itens:itensDe(blocos),obs:'',started:Date.now(),chk:{},lib:libDe(m)};
  saveDraft();
  RH.renderView(true);scrollTo(0,0);
}
function itensDe(blocos){
  const itens={};
  blocos.forEach(bl=>alvos(bl).forEach(al=>(al.cl?.itens||[]).forEach(it=>{itens[prefix(bl.id,al)+it.id]={sid:bl.id,a:al.a,i:al.i,n:al.n,t:it.t,r:''}})));
  return itens}

/* ---------- rascunho da ronda em andamento (auto-save) ----------
   A ronda ativa é gravada no localStorage (uma chave por usuário) a cada resposta/edição.
   Ao recarregar, fechar a aba ou voltar à tela, ela é restaurada; é apagada ao finalizar ou descartar. */
const DRAFT_PREFIX='rh_ronda_draft:';
const draftKey=()=>st.me?DRAFT_PREFIX+st.me.id:null;
const CAMPOS=['r','tipoId','sev','desc','just','thumb','full'];
function gravar(k,R,nivel){
  /* nivel 0 = tudo; 1 = sem a foto grande; 2 = sem nenhuma foto (se o armazenamento estiver cheio) */
  const itens={};
  Object.entries(R.itens).forEach(([ik,it])=>{
    if(!(it.r||it.desc||it.just||it.tipoId))return;
    const o={};CAMPOS.forEach(c=>{if(it[c]&&!(c==='full'&&nivel>=1)&&!(c==='thumb'&&nivel>=2))o[c]=it[c]});itens[ik]=o});
  localStorage.setItem(k,JSON.stringify({v:1,uid:st.me.id,modeloId:R.modeloId,nome:R.nome,resp:R.resp,obs:R.obs||'',started:R.started,sub:R.sub||null,foco:R.foco||null,chk:R.chk||{},itens,savedAt:Date.now()}))}
let draftT;
function saveDraft(){
  clearTimeout(draftT);
  const k=draftKey();if(!k||!st.R)return;
  st.draftErr=true;
  for(let n=0;n<3;n++){try{gravar(k,st.R,n);st.draftErr=false;return}catch(e){}}
}
const saveDraftSoon=()=>{clearTimeout(draftT);draftT=setTimeout(saveDraft,300)};
function clearDraft(){clearTimeout(draftT);st.draftErr=false;try{const k=draftKey();if(k)localStorage.removeItem(k)}catch(e){}}
function restoreDraft(){
  const k=draftKey();if(st.R||!k)return;
  let d;try{d=JSON.parse(localStorage.getItem(k)||'null')}catch(e){d=null}
  if(!d||d.uid!==st.me.id)return;
  const m=byId(S.modelos,d.modeloId);
  if(!m||!RH.access.rondaVisivel(m,st.me)){clearDraft();return}   /* ronda removida ou sem acesso: descarta */
  const blocos=blocosDa(m),itens=itensDe(blocos);
  if(!blocos.length){clearDraft();return}
  Object.entries(d.itens||{}).forEach(([ik,v])=>{if(itens[ik])CAMPOS.forEach(c=>{if(v[c]!=null)itens[ik][c]=v[c]})});
  st.R={modeloId:m.id,nome:m.nome,resp:m.responsavelId||'',blocos,itens,obs:d.obs||'',started:d.started||Date.now(),lib:libDe(m)};
  if(d.sub)st.R.sub=d.sub;
  st.R.chk=d.chk||{};   /* check-ins de presença (código + antena) */
  const foco=d.foco&&itens[d.foco]?d.foco:null;
  if(foco){st.R.foco=foco;setTimeout(()=>document.getElementById('it-'+foco)?.scrollIntoView({block:'center'}),150)}
  /* celulares com pouca memória podem recarregar a página enquanto a câmera está aberta */
  toast(foco&&!itens[foco].thumb?'A página foi recarregada ao abrir a câmera. Sua ronda foi recuperada; anexe a foto novamente.':'Ronda em andamento recuperada do rascunho.');
}
RH.rondaDraft={save:saveDraft,clear:clearDraft,restore:restoreDraft};
/* ao tocar em "Anexar foto", guarda qual item era e salva já (a câmera pode descarregar a página) */
document.addEventListener('click',e=>{const f=e.target.closest&&e.target.closest('[data-nc-foto]');if(f&&st.R){st.R.foco=f.dataset.k;saveDraft();try{localStorage.setItem('rh_resume',JSON.stringify({uid:st.me.id,page:'ronda',ts:Date.now()}))}catch(x){}}},true);
addEventListener('pagehide',saveDraft);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveDraft()});

function itemHtml(k){
  const it=st.R.itens[k],nc=it.r==='NC',ina=it.r==='IN',tipo=nc?byId(S.tiposNC,it.tipoId):null;
  return `<div class="it" id="it-${k}"><div class="it-row"><div class="it-t">${esc(it.t)}</div>
  <div class="seg" role="group" aria-label="Resultado">${[['C','Conforme','c'],['NC','Não conforme','n'],['IN','Inacessível','a']].map(([v,l,c])=>`<button type="button" class="${c}" data-act="res" data-k="${k}" data-r="${v}" aria-pressed="${it.r===v}">${l}</button>`).join('')}</div></div>
  ${nc?`<div class="ncp"><label class="field"><span>Tipo de não conformidade</span><select data-nc="tipoId" data-k="${k}"><option value="">Selecione…</option>${S.tiposNC.map(t=>`<option value="${t.id}" ${it.tipoId===t.id?'selected':''}>${esc(t.nome)}</option>`).join('')}</select></label>
  <label class="field"><span>Severidade</span><select data-nc="sev" data-k="${k}">${[1,2,3,4].map(s=>`<option value="${s}" ${(it.sev||2)==s?'selected':''}>${s} · ${SEV[s]}</option>`).join('')}</select></label>
  ${tipo&&tipo.orient?`<div class="full">${RH.orientBox(tipo.orient)}</div>`:''}
  <label class="field full"><span>Descrição do problema</span><textarea data-nc="desc" data-k="${k}" placeholder="O que foi encontrado, onde e em que condição?">${esc(it.desc||'')}</textarea></label>
  <div class="full ph">${it.thumb?`<img src="${it.thumb}" alt="Foto da não conformidade"><button type="button" class="btn sm" data-act="rmFoto" data-k="${k}">Remover foto</button>`:''}
  <button type="button" class="btn sm" data-act="camOpen" data-k="${k}">${ic('cam',16)} ${it.thumb?'Tirar outra foto':'Tirar foto'}</button>
  <label class="btn sm" style="cursor:pointer">${ic('up',16)} Da galeria<input class="sr" type="file" accept="image/*" data-nc-foto data-k="${k}"></label></div></div>`:''}
  ${ina?`<div class="ncp ina"><label class="field full"><span>Descrição (obrigatória) · por que o item está inacessível?</span><textarea data-ina="just" data-k="${k}" id="ina-${k}" required aria-required="true" placeholder="Explique o motivo (ex.: sala ocupada, equipamento em uso, acesso restrito)">${esc(it.just||'')}</textarea></label></div>`:''}</div>`;
}

/* ---------- presença no local (código de barras + antena Wi-Fi) ---------- */
const hora=t=>new Date(t).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const REDE={confere:'antena Wi-Fi conferida',indisponivel:'antena Wi-Fi não verificada',sem_cadastro:'local sem antena cadastrada',nao_exigida:''};
function chkHtml(bl,e){
  if(!e.ativo)return '';
  if(e.semCodigo)return '';   /* local sem código cadastrado: nada a mostrar (a ausência aparece no cadastro e no histórico) */
  if(e.ok)return `<div class="chk-box ok"><span class="pill okp"><i></i>Presença confirmada${e.dependente?' em '+esc(e.alvo.nome):''} às ${hora(e.ok.ts)}</span><small>${esc(REDE[e.ok.rede]||'')}</small></div>`;
  const f=e.falhas[e.falhas.length-1];
  const nDep=RH.local.dependentes(st.R,bl.id).length,alvoId=e.viaId||bl.id;
  const msg=e.dependente?`Leia o código de barras de ${esc(e.alvo.nome)} para liberar este local.`:nDep?`Leia o código de barras para liberar este local e mais ${nDep} do grupo.`:'Leia o código de barras do local para liberar o checklist.';
  return `<div class="chk-box pend${e.bloqueado?' blk':''}"><div><b>${e.bloqueado?msg:'Presença no local ainda não confirmada (opcional).'}</b>${f?`<div class="err" role="alert">${esc(f.msg)}</div>`:''}</div>
    <button type="button" class="btn pri sm" data-act="chkScan" data-id="${esc(alvoId)}">${ic('cam',16)} Ler código${e.dependente?' de '+esc(e.alvo.nome):' do local'}</button></div>`}

function blocoHtml(bl){
  const R=st.R,e=RH.local.estado(R,bl);
  const sala=bl.tipo==='sala'?byId(S.salas,bl.salaId):null;
  const h=sala?`<div class="sala-h"><h2>${esc(sala.nome)}</h2><small>${esc(sala.setor||'')}${sala.andar?' · '+esc(sala.andar):''}</small></div>`
    :`<div class="sala-h"><h2>Equipamentos</h2><small>${esc(bl.setor)}</small></div>`;
  return `<section class="bl" id="bl-${esc(bl.id)}">${h}${chkHtml(bl,e)}`+alvos(bl).map(al=>{
    const ks=Object.keys(R.itens).filter(k=>k.startsWith(prefix(bl.id,al)));
    const ico=al.eq?thumbEq(al.eq):`<div class="thumb">${ic('shield',22)}</div>`;
    if(!ks.length)return `<div class="grp noitems"><div class="gh">${ico}<div class="t"><b>${tagTipo(al.a)}${esc(al.n)}</b><small>Sem checklist vinculado${st.me.role==='admin'?' · vincule em Cadastros':''}</small></div></div></div>`;
    return `<div class="grp"><div class="gh">${ico}<div class="t"><b>${tagTipo(al.a)}${esc(al.n)}</b><small>${al.eq?`<span class="mono">${esc(al.eq.patrimonio||'sem patrimônio')}</span> · ${esc(al.eq.categoria||'')}`:esc(al.cl?.nome||'')}</small></div></div><div class="items${e.bloqueado?' locked':''}"${e.bloqueado?' inert aria-disabled="true"':''}>${ks.map(itemHtml).join('')}</div></div>`}).join('')+'</section>'}

function repaintBloco(id){
  const bl=st.R&&st.R.blocos.find(b=>b.id===id),el=document.getElementById('bl-'+id);
  if(bl&&el)el.outerHTML=blocoHtml(bl);progress()}

function rondaForm(){
  const R=st.R,blocos=R.blocos;
  const hasItems=Object.keys(R.itens).length>0;
  const nSalas=blocos.filter(b=>b.tipo==='sala').length,nEq=blocos.reduce((n,b)=>n+(b.eqIds?b.eqIds.length:0),0);
  return `<div class="top"><div><h1>${esc(R.nome)}</h1><p>${nSalas} sala${nSalas===1?'':'s'} · ${nEq} equipamento${nEq===1?'':'s'} · Início às ${hora(R.started)} · Responsável: ${R.resp?esc(userName(R.resp)):'todos os inspetores'} · Inspetor: ${esc(st.me.nome)}</p></div>
  <button class="btn" data-act="cancelRonda">${ic('x',16)} Descartar ronda</button></div>
  <div class="rhead"><div class="prog"><b id="prog-t"></b><div class="bar"><i id="prog-b" style="width:0"></i></div></div><button class="btn pri" data-act="submitRonda" id="btn-sub">${ic('check',16)} Finalizar ronda</button></div>
  ${hasItems?blocos.map(blocoHtml).join(''):empty('Esta ronda não tem itens de checklist','Vincule checklists às salas e aos equipamentos em Cadastros.')}
  <div class="card"><label class="field"><span>Observações gerais da ronda (opcional)</span><textarea id="r-obs" data-robs>${esc(R.obs)}</textarea></label></div>`;
}
RH.rondaForm=rondaForm;

function progress(){
  const v=Object.values(st.R.itens),t=v.length,a=v.filter(x=>x.r).length,n=v.filter(x=>x.r==='NC').length;
  const pt=$('#prog-t');if(!pt)return;pt.textContent=`${a} de ${t} itens respondidos${n?` · ${n} não conformidade${n>1?'s':''}`:''}`;$('#prog-b').style.width=(t?a/t*100:0)+'%'}
RH.rondaProgress=progress;
function repaint(k){const e=document.getElementById('it-'+k);if(e)e.outerHTML=itemHtml(k);progress()}

async function submitRonda(){
  const R=st.R,its=Object.entries(R.itens);
  document.querySelectorAll('.it.miss').forEach(e=>e.classList.remove('miss'));
  if(!its.length){toast('Não há itens para registrar nesta ronda.','bad');return}
  const un=its.filter(([,i])=>!i.r);
  if(un.length){un.forEach(([k])=>document.getElementById('it-'+k)?.classList.add('miss'));document.getElementById('it-'+un[0][0])?.scrollIntoView({block:'center'});toast(`Faltam ${un.length} item(ns) sem resposta.`,'bad');return}
  const bad=its.filter(([,i])=>i.r==='NC'&&(!i.tipoId||!(i.desc||'').trim()));
  if(bad.length){bad.forEach(([k])=>document.getElementById('it-'+k)?.classList.add('miss'));document.getElementById('it-'+bad[0][0])?.scrollIntoView({block:'center'});toast('Informe o tipo e a descrição de cada não conformidade.','bad');return}
  const noJust=its.filter(([,i])=>i.r==='IN'&&!(i.just||'').trim());
  if(noJust.length){noJust.forEach(([k])=>document.getElementById('it-'+k)?.classList.add('miss'));document.getElementById('it-'+noJust[0][0])?.scrollIntoView({block:'center'});document.getElementById('ina-'+noJust[0][0])?.focus({preventScroll:true});toast('Descreva o motivo de cada item marcado como Inacessível.','bad');return}
  /* presença no local: sem leitura válida do código (e da antena, se cadastrada) o bloco não pode ser finalizado */
  const pend=RH.local.pendencias(R);
  if(pend.length){document.getElementById('bl-'+pend[0].id)?.scrollIntoView({block:'start'});toast(`Confirme a presença lendo o código de barras em ${pend.length} local(is) antes de finalizar.`,'bad');return}
  const b=$('#btn-sub');b.disabled=true;
  /* ts, execId e ids ficam guardados na ronda: se o salvamento falhar no meio e o inspetor
     tentar de novo, os mesmos documentos são sobrescritos (nada fica duplicado) */
  const sub=R.sub||(R.sub={ts:Date.now(),execId:'x'+RH.uid(),ids:{}});
  const ts=sub.ts,execId=sub.execId,mk=(k,pre)=>sub.ids[k]||(sub.ids[k]=pre+RH.uid());
  let totNC=0;
  const ok=await RH.safe(async()=>{
    totNC=0;
    for(const bl of R.blocos){
      const sid=bl.id,sala=bl.tipo==='sala'?byId(S.salas,bl.salaId):null,mine=its.filter(([,i])=>i.sid===sid);
      if(!mine.length||(bl.tipo==='sala'&&!sala))continue;
      const salaNome=sala?sala.nome:'Equipamentos',setor=bl.setor==='Sem setor'?'':bl.setor,respSetor=sala?sala.responsavelId:(S.salas.find(x=>(x.setor||'Sem setor')===bl.setor&&x.responsavelId)||{}).responsavelId;
      const v=mine.map(x=>x[1]),c=v.filter(i=>i.r==='C').length,nc=v.filter(i=>i.r==='NC').length,ina=v.filter(i=>i.r==='IN').length,rid=mk('r:'+sid,'r');
      const presenca=RH.local.evidencia(R,bl);
      await RH.put('rondas',rid,{...(presenca?{presenca}:{}),ts,execId,modeloId:R.modeloId,modeloNome:R.nome,salaId:sala?sala.id:null,salaNome,setor,inspId:st.me.id,inspNome:st.me.nome,c,nc,ina,
        pct:c+nc?Math.round(c/(c+nc)*1000)/10:100,obs:(R.obs||'').trim(),itens:v.map(i=>({a:i.a,i:i.i,n:i.n,t:i.t,r:i.r,...(i.r==='IN'?{just:i.just.trim()}:{})}))});
      for(const [k,i] of mine.filter(([,i])=>i.r==='NC')){
        const tipo=byId(S.tiposNC,i.tipoId),eq=i.a==='e'?byId(S.equipamentos,i.i):null;let fotoId=null;
        if(i.full){fotoId=mk('f:'+k,'f');await RH.put('fotos',fotoId,{data:i.full})}
        const sev=+i.sev||tipo?.sev||2;
        await RH.put('ncs',mk('n:'+k,'n'),{ts,rondaId:rid,execId,modeloId:R.modeloId,modeloNome:R.nome,salaId:sala?sala.id:null,salaNome,setor,eqId:eq?.id||null,eqNome:eq?.nome||'',itemTexto:i.t,
          tipoId:i.tipoId,tipoNome:tipo?.nome||'',orient:tipo?.orient||'',sev,desc:i.desc.trim(),thumb:i.thumb||null,fotoId,status:'aberta',resp:respSetor||null,prazo:ts+([0,14,7,3,1][sev])*864e5,inspNome:st.me.nome});
        totNC++;
      }
    }return true});
  if(ok){RH.rondaDraft.clear();st.R=null;toast(totNC?`Ronda registrada com ${totNC} não conformidade${totNC>1?'s':''}.`:'Ronda registrada sem não conformidades.');RH.go(RH.access.gerencia()?'historico':'ronda')}
  else b.disabled=false;
}

/* ---------- câmera dentro da página ----------
   Abre a câmera do aparelho num painel próprio (getUserMedia), sem chamar o app de câmera do Android
   (que em alguns celulares falha com "insuficiência de memória" e recarrega a página). */
let camStream=null;
function camClose(){if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null}document.getElementById('cam-ov')?.remove()}
async function camOpen(k,facing){
  camClose();
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){toast('Este navegador não permite abrir a câmera aqui. Use "Da galeria".','bad');return}
  try{camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing||'environment'},width:{ideal:1280},height:{ideal:960}},audio:false})}
  catch(e){const neg=e&&(e.name==='NotAllowedError'||e.name==='SecurityError');
    toast(neg?'Permissão da câmera negada. Libere a câmera para este site nas configurações do navegador, ou use "Da galeria".':'Não foi possível abrir a câmera ('+((e&&e.name)||'erro')+'). Use "Da galeria".','bad');return}
  const o=document.createElement('div');o.id='cam-ov';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-label','Câmera');
  o.style.cssText='position:fixed;inset:0;z-index:200;background:#000;display:flex;flex-direction:column';
  o.innerHTML=`<video id="cam-v" playsinline muted autoplay style="flex:1;min-height:0;width:100%;object-fit:contain;background:#000"></video>
  <div style="display:flex;gap:10px;justify-content:center;align-items:center;padding:14px;background:#000;flex-wrap:wrap">
  <button type="button" class="btn" id="cam-x">Cancelar</button><button type="button" class="btn pri" id="cam-shot" style="min-width:150px">${ic('cam',18)} Capturar</button><button type="button" class="btn" id="cam-sw">Trocar câmera</button></div>`;
  document.body.appendChild(o);
  const v=o.querySelector('#cam-v');v.srcObject=camStream;try{await v.play()}catch(e){}
  o.querySelector('#cam-x').onclick=camClose;
  o.querySelector('#cam-sw').onclick=()=>camOpen(k,(camStream&&camStream.getVideoTracks()[0].getSettings().facingMode)==='user'?'environment':'user');
  o.querySelector('#cam-shot').onclick=async()=>{
    if(!v.videoWidth){toast('A câmera ainda está iniciando. Tente de novo.','bad');return}
    const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.9));c.width=c.height=0;camClose();
    const it=st.R&&st.R.itens[k];if(!it||!blob)return;
    try{Object.assign(it,await RH.processImg(blob));repaint(k);saveDraft()}catch(err){toast('Não foi possível processar a foto.','bad')}};
}
addEventListener('pagehide',camClose);

/* ---------- eventos ---------- */
Object.assign(RH.ACT,{
  pickRonda:el=>startRonda(el.dataset.id),
  resumeRonda:()=>RH.renderView(true),
  cancelRonda:()=>{if(RH.confirmArm(RH.ACT.cancelRonda,'Toque de novo para descartar a ronda')){RH.rondaDraft.clear();st.R=null;RH.renderView(true)}},
  chkScan:async el=>{
    const bl=st.R&&st.R.blocos.find(b=>b.id===el.dataset.id);if(!bl||el.disabled)return;
    el.disabled=true;
    const reg=await RH.local.checkin(bl);
    if(!st.R)return;                                   /* ronda descartada durante a leitura */
    if(reg){RH.local.registrar(st.R,bl.id,reg);saveDraft();toast(reg.ok?'Presença confirmada.':reg.msg,reg.ok?'':'bad')}
    repaintBloco(bl.id);RH.local.dependentes(st.R,bl.id).forEach(b=>repaintBloco(b.id))},
  res:el=>{const it=st.R.itens[el.dataset.k];
    {const bl=st.R.blocos.find(b=>b.id===it.sid);if(bl&&RH.local.estado(st.R,bl).bloqueado){toast('Leia o código de barras do local antes de responder o checklist.','bad');return}}
    it.r=it.r===el.dataset.r?'':el.dataset.r;if(it.r==='NC'&&!it.sev)it.sev=2;repaint(el.dataset.k);saveDraft();if(it.r==='IN')document.getElementById('ina-'+el.dataset.k)?.focus({preventScroll:true})},
  camOpen:el=>camOpen(el.dataset.k),
  rmFoto:el=>{const it=st.R.itens[el.dataset.k];it.thumb=it.full=null;repaint(el.dataset.k);saveDraft()},
  submitRonda
});
RH.ON_CHANGE.push(async el=>{
  if(el.dataset.nc){
    const it=st.R.itens[el.dataset.k],f=el.dataset.nc;it[f]=el.value;
    if(f==='tipoId'){const t=byId(S.tiposNC,el.value);if(t)it.sev=t.sev;repaint(el.dataset.k)} /* mostra a orientação do tipo */
    saveDraft();return true}
  if(el.dataset.ncFoto!=null){
    if(el.files[0]){try{Object.assign(st.R.itens[el.dataset.k],await RH.processImg(el.files[0]));repaint(el.dataset.k);saveDraft()}catch(err){toast('Não foi possível ler a imagem.','bad')}}
    return true}
  return false});
RH.ON_INPUT.push(el=>{
  if(el.dataset.nc==='desc'){st.R.itens[el.dataset.k].desc=el.value;saveDraftSoon();return true}
  if(el.dataset.ina==='just'){st.R.itens[el.dataset.k].just=el.value;el.setCustomValidity('');saveDraftSoon();return true}
  if(el.dataset.robs!=null){st.R.obs=el.value;saveDraftSoon();return true}
  return false});
})();
