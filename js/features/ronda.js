/* ==========================================================================
   Nova ronda: lista as rondas cadastradas (Cadastros → Rondas) que o usuário pode
   realizar e conduz o preenchimento do checklist de TODAS as salas da ronda.

   Regras de acesso:
   - ronda com responsável  → só ele a vê e realiza;
   - ronda com responsável "Todos" → todos os usuários com acesso à tela (todos os usuários).
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
/* itens a verificar: os do próprio cadastro; cadastro antigo sem itens usa o checklist vinculado */
const itensProprios=x=>({itens:(x.itens&&x.itens.length)?x.itens:(byId(S.checklists,x.checklistId)?.itens||[]),nome:''});
function alvos(bl){
  if(bl.tipo==='sala'){const s=byId(S.salas,bl.salaId);return s?[{a:'s',i:s.id,n:s.nome,cl:itensProprios(s)}]:[]}
  return bl.eqIds.map(id=>byId(S.equipamentos,id)).filter(Boolean).map(e=>({a:'e',i:e.id,n:e.nome,eq:e,cl:itensProprios(e)}))}
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

/* pendências de hoje: cada horário previsto das rondas que a pessoa pode fazer */
const hhmm=t=>{const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
function pendencias(lista){
  const now=Date.now(),ex={};S.rondas.forEach(r=>{if(r.modeloId)(ex[r.modeloId]=ex[r.modeloId]||new Set()).add(r.ts)});
  const it=[];
  lista.forEach(m=>{
    if(RH.agenda.temAgenda(m))RH.agenda.hoje(m,[...(ex[m.id]||[])],now).forEach(s=>it.push({m,t:s.t,e:s.estado}));
    else if(RH.agenda.atrasada(m,lastExec(m.id)?.ts??null,now))it.push({m,t:null,e:'atrasado'})});
  const ord={atrasado:0,agora:1,depois:2,feito:3};
  it.sort((a,b)=>ord[a.e]-ord[b.e]||(a.t||0)-(b.t||0)||a.m.nome.localeCompare(b.m.nome));
  return it}
function pendBox(lista){
  const it=pendencias(lista);if(!it.length)return '';
  const n=e=>it.filter(x=>x.e===e).length,at=n('atrasado'),ag=n('agora'),dp=it.filter(x=>x.e==='depois'),fe=n('feito');
  const prox=dp.length?hhmm(Math.min(...dp.map(x=>x.t))):'';
  const plural=(k,a,b)=>k+' '+(k>1?b:a);
  let nivel,icone,tit,sub='';
  if(at){nivel='bad';icone='alert';tit=plural(at,'ronda atrasada','rondas atrasadas');sub=ag?plural(ag,'ronda para fazer agora','rondas para fazer agora'):(prox?'próxima às '+prox:'')}
  else if(ag){nivel='warn';icone='hist';tit=plural(ag,'ronda para fazer agora','rondas para fazer agora');sub=dp.length?'depois, às '+prox:''}
  else if(dp.length){nivel='info';icone='hist';tit='Próxima ronda às '+prox;sub=fe?plural(fe,'feita hoje','feitas hoje'):''}
  else{nivel='ok';icone='check';tit='Rondas de hoje em dia';sub=plural(fe,'feita','feitas')}
  const aberto=!!st.pendOpen,rot={atrasado:['Atrasada','late'],agora:['Agora','now'],depois:['Mais tarde','off'],feito:['Feita','okp']};
  return `<section class="pend ${nivel}" aria-label="Pendências de hoje"><button type="button" class="pend-h" data-act="pendTog" aria-expanded="${aberto}" aria-controls="pend-l">${ic(icone,18)}<span class="pend-t"><b>${tit}</b>${sub?`<small>${sub}</small>`:''}</span><span class="pend-c">${aberto?'Ocultar':'Ver'}${ic(aberto?'up':'dn',16)}</span></button>
  ${aberto?`<ul class="pend-l" id="pend-l">${it.map(x=>`<li class="pe-${x.e}"><span class="pt">${x.t?hhmm(x.t):'—'}</span><span class="pn">${esc(x.m.nome)}</span><span class="pill ${rot[x.e][1]}">${rot[x.e][0]}</span>${x.e==='feito'?'<span></span>':`<button type="button" class="btn sm" data-act="pickRonda" data-id="${x.m.id}">Iniciar</button>`}</li>`).join('')}</ul>`:''}</section>`}

RH.pages.ronda=()=>{
  const lista=visiveis();
  const vazio=!S.modelos.length
    ?empty('Nenhuma ronda cadastrada',st.me.role==='admin'?'Cadastre as rondas em Cadastros → Rondas (nome, salas e responsável).':'Peça ao administrador para cadastrar as rondas.')
    :empty('Nenhuma ronda disponível para você','As rondas são exibidas apenas ao responsável escolhido ou a todos os usuários quando não há responsável. Fale com o administrador.');
  return `<div class="top"><div><h1>Nova ronda</h1><p>Escolha a ronda que você vai realizar ou leia o código (QR Code) de uma sala ou equipamento.</p></div><button class="btn pri" data-act="qrIniciar">${ic('cam',16)} Ler código do local</button></div>
  ${lista.length?pendBox(lista):''}
  ${st.R?`<div class="banner">Há uma ronda em andamento (${esc(st.R.nome)}). <button class="btn sm" data-act="resumeRonda">Continuar ronda</button></div>`:''}
  ${lista.length?`<div class="salas">${lista.map(m=>{
    const l=lastExec(m.id),late=RH.agenda.atrasada(m,l?l.ts:null),salas=RH.salasDaRonda(m),setores=[...new Set([...salas.map(s=>s.setor||'Sem setor'),...RH.equipsDaRonda(m).map(e=>RH.setorEq(e)||'Sem setor')])].sort((a,b)=>a.localeCompare(b)),prox=RH.agenda.proximo(m,Date.now());
    const ne=RH.equipsDaRonda(m).length;
    return `<button class="sala${late?' late':''}" data-act="pickRonda" data-id="${m.id}"><div class="h"><b>${esc(m.nome)}</b>${late?'<span class="pill late">Em atraso</span>':'<span class="pill okp">Em dia</span>'}</div>
    <div class="f"><span>${esc(setores.join(', ')||'—')}</span></div>
    <div class="f"><span>${salas.length} sala${salas.length===1?'':'s'}</span><span>${ne} equipamento${ne===1?'':'s'}</span></div>
    <div class="f"><span>Responsável: ${m.responsavelId?esc(userName(m.responsavelId)):'todos os usuários'}</span></div>
    <small>${esc(RH.agenda.resumo(m))}${prox?` · próxima: ${RH.agenda.fmtSlot(prox)}`:''}</small>
    <small>${l?`Última realização ${ago(l.ts)}`:'Nunca realizada'}</small><span class="go">Iniciar ronda →</span></button>`}).join('')}</div>`:vazio}`;
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
  blocos.forEach(bl=>alvos(bl).forEach(al=>(al.cl?.itens||[]).forEach(it=>{itens[prefix(bl.id,al)+it.id]={sid:bl.id,a:al.a,i:al.i,n:al.n,t:it.t,av:it.aviso||'',tmin:it.tmin??null,tmax:it.tmax??null,r:''}})));
  return itens}

/* ---------- rascunho da ronda em andamento (auto-save) ----------
   A ronda ativa é gravada no localStorage (uma chave por usuário) a cada resposta/edição.
   Ao recarregar, fechar a aba ou voltar à tela, ela é restaurada; é apagada ao finalizar ou descartar. */
const DRAFT_PREFIX='rh_ronda_draft:';
const draftKey=()=>st.me?DRAFT_PREFIX+st.me.id:null;
const CAMPOS=['r','tipoId','sev','desc','just','thumb','full','tv','auto','autoDesc'];
function gravar(k,R,nivel){
  /* nivel 0 = tudo; 1 = sem a foto grande; 2 = sem nenhuma foto (se o armazenamento estiver cheio) */
  const itens={};
  Object.entries(R.itens).forEach(([ik,it])=>{
    if(!(it.r||it.desc||it.just||it.tipoId||it.tv))return;
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

/* ---------- temperatura medida x faixa ideal ----------
   Itens de "Temperatura" com faixa ideal cadastrada pedem a leitura (°C). Fora da faixa → vira não conformidade
   automaticamente (tipo "Temperatura", se existir, e descrição preenchida); dentro da faixa → conforme. */
const temFaixa=it=>RH.ehTemp(it.t)&&(it.tmin!=null||it.tmax!=null);
const tempVal=it=>RH.numTemp(it.tv);
const tempSit=it=>{const v=tempVal(it);if(v==null||!temFaixa(it))return null;if(it.tmin!=null&&v<it.tmin)return 'baixa';if(it.tmax!=null&&v>it.tmax)return 'alta';return 'ok'};
const fmtT=n=>String(n).replace('.',',')+' °C';
function aplicaTemp(k){
  const it=st.R.itens[k];if(it.r==='IN')return;
  const sit=tempSit(it),v=tempVal(it);
  if(sit==='baixa'||sit==='alta'){
    if(it.r==='NC'&&!it.auto)return;                          /* NC marcada à mão: respeita */
    const txt=`Temperatura medida: ${fmtT(v)}, ${sit==='baixa'?'abaixo':'acima'} da faixa ideal (${RH.fmtIdeal(it.tmin,it.tmax)}).`;
    const t=S.tiposNC.find(x=>/temperatura/i.test(x.nome||''));
    it.r='NC';it.auto=true;
    if(!it.tipoId&&t)it.tipoId=t.id;
    it.sev=4;                                                 /* temperatura fora da faixa ideal: sempre Crítica */
    if(!it.desc||it.desc===it.autoDesc)it.desc=txt;
    it.autoDesc=txt;
  }else if(it.auto&&it.r==='NC'){                              /* voltou para a faixa (ou leitura apagada): desfaz o que foi automático */
    if(it.desc===it.autoDesc)it.desc='';
    it.r=sit==='ok'?'C':'';it.auto=false;it.autoDesc='';it.tipoId='';it.sev=0;
  }else if(sit==='ok'&&!it.r)it.r='C';
}
function tempBox(it,k){
  if(!RH.ehTemp(it.t)||it.r==='IN')return '';
  const sit=tempSit(it),faixa=temFaixa(it);
  const msg=sit==='ok'?'✓ Dentro da faixa ideal':sit==='baixa'?`⚠ Abaixo da faixa ideal (mín. ${fmtT(it.tmin)}) — registrada como não conformidade crítica`:sit==='alta'?`⚠ Acima da faixa ideal (máx. ${fmtT(it.tmax)}) — registrada como não conformidade crítica`:faixa?'Informe a temperatura lida no visor (obrigatório)':'Opcional: registre a temperatura lida';
  return `<div class="tempin${sit&&sit!=='ok'?' fora':sit==='ok'?' dentro':''}"><label><span>Temperatura medida</span><span class="tin"><input type="text" inputmode="decimal" autocomplete="off" data-tv data-k="${k}" value="${esc(it.tv??'')}" placeholder="ex.: 22,5" aria-label="Temperatura medida em graus Celsius"><b>°C</b></span></label><small>${msg}</small></div>`}

/* item (de sala ou de equipamento) cujo texto contém "Temperatura": exige foto (exceto se Inacessível) */
const fotoObrig=it=>!!it&&/temperatura/i.test(it.t||'')&&it.r!=='IN';
const alvoNome=it=>it.a==='e'?'equipamento':'sala';
const fotoBtns=(it,k)=>`<div class="full ph">${it.thumb?`<img src="${it.thumb}" alt="Foto d${it.a==='e'?'o equipamento':'a sala'}"><button type="button" class="btn sm" data-act="rmFoto" data-k="${k}">Remover foto</button>`:''}
  <button type="button" class="btn sm" data-act="camOpen" data-k="${k}">${ic('cam',16)} ${it.thumb?'Tirar outra foto':'Tirar foto'}</button>
  <label class="btn sm" style="cursor:pointer">${ic('up',16)} Da galeria<input class="sr" type="file" accept="image/*" data-nc-foto data-k="${k}"></label></div>`;
function itemHtml(k){
  const it=st.R.itens[k],nc=it.r==='NC',ina=it.r==='IN',tipo=nc?byId(S.tiposNC,it.tipoId):null;
  return `<div class="it" id="it-${k}"><div class="it-row"><div class="it-t">${esc(it.t)}${RH.ehTemp(it.t)&&RH.fmtIdeal(it.tmin,it.tmax)?`<small class="ideal">Temperatura ideal: <b>${RH.fmtIdeal(it.tmin,it.tmax)}</b></small>`:''}</div>
  <div class="seg" role="group" aria-label="Resultado">${[['C','Conforme','c'],['NC','Não conforme','n'],['IN','Inacessível','a']].map(([v,l,c])=>`<button type="button" class="${c}" data-act="res" data-k="${k}" data-r="${v}" aria-pressed="${it.r===v}">${l}</button>`).join('')}</div></div>
  ${RH.avisoBox(it.av)}
  ${tempBox(it,k)}
  ${nc?`<div class="ncp"><label class="field"><span>Tipo de não conformidade</span><select data-nc="tipoId" data-k="${k}"><option value="">Selecione…</option>${S.tiposNC.map(t=>`<option value="${t.id}" ${it.tipoId===t.id?'selected':''}>${esc(t.nome)}</option>`).join('')}</select></label>
  <label class="field"><span>Severidade</span><select data-nc="sev" data-k="${k}">${[1,2,3,4].map(s=>`<option value="${s}" ${(it.sev||2)==s?'selected':''}>${s} · ${SEV[s]}</option>`).join('')}</select></label>
  ${tipo&&tipo.orient?`<div class="full">${RH.orientBox(tipo.orient)}</div>`:''}
  <label class="field full"><span>Descrição do problema</span><textarea data-nc="desc" data-k="${k}" placeholder="O que foi encontrado, onde e em que condição?">${esc(it.desc||'')}</textarea></label>
  ${fotoObrig(it)?`<div class="full"><b>Foto d${it.a==='e'?'o equipamento':'a sala'} (obrigatória)</b></div>`:''}<div class="full ph">${it.thumb?`<img src="${it.thumb}" alt="Foto da não conformidade"><button type="button" class="btn sm" data-act="rmFoto" data-k="${k}">Remover foto</button>`:''}
  <button type="button" class="btn sm" data-act="camOpen" data-k="${k}">${ic('cam',16)} ${it.thumb?'Tirar outra foto':'Tirar foto'}</button>
  <label class="btn sm" style="cursor:pointer">${ic('up',16)} Da galeria<input class="sr" type="file" accept="image/*" data-nc-foto data-k="${k}"></label></div></div>`:''}
  ${it.r==='C'&&fotoObrig(it)?`<div class="ncp"><div class="full"><b>Foto d${it.a==='e'?'o equipamento':'a sala'} (obrigatória)</b><small style="display:block;color:var(--ink2)">Fotografe ${it.a==='e'?'o equipamento':'o ambiente'} mostrando a temperatura.</small></div>${fotoBtns(it,k)}</div>`:''}
  ${ina?`<div class="ncp ina"><label class="field full"><span>Descrição (obrigatória) · por que o item está inacessível?</span><textarea data-ina="just" data-k="${k}" id="ina-${k}" required aria-required="true" placeholder="Explique o motivo (ex.: sala ocupada, equipamento em uso, acesso restrito)">${esc(it.just||'')}</textarea></label></div>`:''}</div>`;
}

/* ---------- presença no local (código de barras + antena Wi-Fi) ---------- */
const hora=t=>new Date(t).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const REDE={confere:'ponto de acesso Wi-Fi conferido',indisponivel:'ponto de acesso Wi-Fi não verificado',sem_cadastro:'local sem ponto de acesso cadastrado',nao_exigida:''};
function chkHtml(bl,e){
  if(!e.ativo)return '';
  if(e.semCodigo)return '';   /* local sem código cadastrado: nada a mostrar (a ausência aparece no cadastro e no histórico) */
  if(e.ok)return `<div class="chk-box ok"><span class="pill okp"><i></i>Presença confirmada${e.dependente?' em '+esc(e.alvo.nome):''} às ${hora(e.ok.ts)}</span><small>${esc(REDE[e.ok.rede]||'')}</small></div>`;
  const f=e.falhas[e.falhas.length-1];
  const nDep=RH.local.dependentes(st.R,bl.id).length,alvoId=e.viaId||bl.id;
  const msg=e.dependente?`Leia o código de ${esc(e.alvo.nome)} para liberar este local.`:nDep?`Leia o código do local para liberar este local e mais ${nDep} do grupo.`:'Leia o código do local para liberar o checklist.';
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
    if(!ks.length)return `<div class="grp noitems"><div class="gh">${ico}<div class="t"><b>${tagTipo(al.a)}${esc(al.n)}</b><small>Sem itens a verificar${st.me.role==='admin'?' · cadastre em Cadastros':''}</small></div></div></div>`;
    return `<div class="grp"><div class="gh">${ico}<div class="t"><b>${tagTipo(al.a)}${esc(al.n)}</b><small>${esc(al.eq?(RH.setorEq(al.eq)||''):[sala?.setor,sala?.andar].filter(Boolean).join(' · '))}</small></div></div><div class="items${e.bloqueado?' locked':''}"${e.bloqueado?' inert aria-disabled="true"':''}>${ks.map(itemHtml).join('')}</div></div>`}).join('')+'</section>'}

function repaintBloco(id){
  const bl=st.R&&st.R.blocos.find(b=>b.id===id),el=document.getElementById('bl-'+id);
  if(bl&&el)el.outerHTML=blocoHtml(bl);progress()}

function rondaForm(){
  const R=st.R,blocos=R.blocos;
  const hasItems=Object.keys(R.itens).length>0;
  const nSalas=blocos.filter(b=>b.tipo==='sala').length,nEq=blocos.reduce((n,b)=>n+(b.eqIds?b.eqIds.length:0),0);
  return `<div class="top"><div><h1>${esc(R.nome)}</h1><p>${nSalas} sala${nSalas===1?'':'s'} · ${nEq} equipamento${nEq===1?'':'s'} · Início às ${hora(R.started)} · Responsável: ${R.resp?esc(userName(R.resp)):'todos os usuários'} · Inspetor: ${esc(st.me.nome)}</p></div>
  <div class="top-act"><button class="btn" data-act="qrIr">${ic('cam',16)} Ler código do local</button><button class="btn" data-act="cancelRonda">${ic('x',16)} Descartar ronda</button></div></div>
  <div class="rhead"><div class="prog"><b id="prog-t"></b><div class="bar"><i id="prog-b" style="width:0"></i></div></div><button class="btn" data-act="proxPend" id="btn-prox" title="Ir ao próximo item sem resposta"><span class="l-full">Próximo pendente</span><span class="l-short">Próx.</span> ↓</button><button class="btn pri" data-act="submitRonda" id="btn-sub">${ic('check',16)} Finalizar</button></div>
  ${hasItems?blocos.map(blocoHtml).join(''):empty('Esta ronda não tem itens de checklist','Vincule checklists às salas e aos equipamentos em Cadastros.')}
  <div class="card"><label class="field"><span>Observações gerais da ronda (opcional)</span><textarea id="r-obs" data-robs>${esc(R.obs)}</textarea></label></div>`;
}
RH.rondaForm=rondaForm;

function progress(){
  const v=Object.values(st.R.itens),t=v.length,a=v.filter(x=>x.r).length,n=v.filter(x=>x.r==='NC').length;
  const pt=$('#prog-t');if(!pt)return;const pctP=t?Math.round(a/t*100):0;
  pt.textContent=`${a} de ${t} itens · ${pctP}%${n?` · ${n} NC${n>1?'s':''}`:''}`;$('#prog-b').style.width=(t?a/t*100:0)+'%';
  const bp=$('#btn-prox');if(bp){bp.hidden=a>=t;}}
RH.rondaProgress=progress;
function repaint(k){const e=document.getElementById('it-'+k);if(e)e.outerHTML=itemHtml(k);progress()}

async function submitRonda(){
  const R=st.R,its=Object.entries(R.itens);
  document.querySelectorAll('.it.miss').forEach(e=>e.classList.remove('miss'));
  if(!its.length){toast('Não há itens para registrar nesta ronda.','bad');return}
  const un=its.filter(([,i])=>!i.r);
  if(un.length){un.forEach(([k])=>document.getElementById('it-'+k)?.classList.add('miss'));document.getElementById('it-'+un[0][0])?.scrollIntoView({block:'center'});toast(un.length===1?'Falta 1 item sem resposta.':`Faltam ${un.length} itens sem resposta.`,'bad');return}
  const bad=its.filter(([,i])=>i.r==='NC'&&(!i.tipoId||!(i.desc||'').trim()));
  if(bad.length){bad.forEach(([k])=>document.getElementById('it-'+k)?.classList.add('miss'));document.getElementById('it-'+bad[0][0])?.scrollIntoView({block:'center'});toast('Informe o tipo e a descrição de cada não conformidade.','bad');return}
  const noJust=its.filter(([,i])=>i.r==='IN'&&!(i.just||'').trim());
  if(noJust.length){noJust.forEach(([k])=>document.getElementById('it-'+k)?.classList.add('miss'));document.getElementById('it-'+noJust[0][0])?.scrollIntoView({block:'center'});document.getElementById('ina-'+noJust[0][0])?.focus({preventScroll:true});toast('Descreva o motivo de cada item marcado como Inacessível.','bad');return}
  const semTemp=its.filter(([,i])=>i.r!=='IN'&&temFaixa(i)&&tempVal(i)==null);
  if(semTemp.length){semTemp.forEach(([k])=>document.getElementById('it-'+k)?.classList.add('miss'));document.querySelector(`[data-tv][data-k="${semTemp[0][0]}"]`)?.focus();document.getElementById('it-'+semTemp[0][0])?.scrollIntoView({block:'center'});toast(semTemp.length===1?'Informe a temperatura medida no item de Temperatura.':`Informe a temperatura medida em ${semTemp.length} itens de Temperatura.`,'bad');return}
  const foraC=its.filter(([,i])=>i.r==='C'&&['baixa','alta'].includes(tempSit(i)));
  if(foraC.length){foraC.forEach(([k])=>document.getElementById('it-'+k)?.classList.add('miss'));document.getElementById('it-'+foraC[0][0])?.scrollIntoView({block:'center'});toast('Há temperatura fora da faixa ideal marcada como conforme. Registre como não conforme ou corrija a leitura.','bad');return}
  const semFoto=its.filter(([,i])=>fotoObrig(i)&&!i.thumb);
  if(semFoto.length){semFoto.forEach(([k])=>document.getElementById('it-'+k)?.classList.add('miss'));document.getElementById('it-'+semFoto[0][0])?.scrollIntoView({block:'center'});toast(semFoto.length===1?'Tire a foto do item de Temperatura.':`Tire a foto em ${semFoto.length} itens de Temperatura.`,'bad');return}
  /* presença no local: sem leitura válida do código (e da antena, se cadastrada) o bloco não pode ser finalizado */
  const pend=RH.local.pendencias(R);
  if(pend.length){document.getElementById('bl-'+pend[0].id)?.scrollIntoView({block:'start'});toast(pend.length===1?'Confirme a presença lendo o código do local antes de finalizar.':`Confirme a presença lendo o código de ${pend.length} locais antes de finalizar.`,'bad');return}
  const b=$('#btn-sub');b.disabled=true;
  /* ts, execId e ids ficam guardados na ronda: se o salvamento falhar no meio e o inspetor
     tentar de novo, os mesmos documentos são sobrescritos (nada fica duplicado) */
  const sub=R.sub||(R.sub={ts:Date.now(),execId:'x'+RH.uid(),ids:{}});
  const ts=sub.ts,execId=sub.execId,mk=(k,pre)=>sub.ids[k]||(sub.ids[k]=pre+RH.uid());
  let totNC=0,totCrit=0;
  const ok=await RH.safe(async()=>{
    totNC=0;totCrit=0;
    for(const bl of R.blocos){
      const sid=bl.id,sala=bl.tipo==='sala'?byId(S.salas,bl.salaId):null,mine=its.filter(([,i])=>i.sid===sid);
      if(!mine.length||(bl.tipo==='sala'&&!sala))continue;
      const salaNome=sala?sala.nome:'Equipamentos',setor=bl.setor==='Sem setor'?'':bl.setor,respSetor=sala?sala.responsavelId:(S.salas.find(x=>(x.setor||'Sem setor')===bl.setor&&x.responsavelId)||{}).responsavelId;
      const v=mine.map(x=>x[1]),c=v.filter(i=>i.r==='C').length,nc=v.filter(i=>i.r==='NC').length,ina=v.filter(i=>i.r==='IN').length,rid=mk('r:'+sid,'r');
      const presenca=RH.local.evidencia(R,bl);
      for(const [k,i] of mine)if(fotoObrig(i)&&i.full){const fid=mk('f:'+k,'f');await RH.put('fotos',fid,{data:i.full})}
      await RH.put('rondas',rid,{...(presenca?{presenca}:{}),ts,execId,modeloId:R.modeloId,modeloNome:R.nome,salaId:sala?sala.id:null,salaNome,setor,inspId:st.me.id,inspNome:st.me.nome,c,nc,ina,
        pct:c+nc?Math.round(c/(c+nc)*1000)/10:100,obs:(R.obs||'').trim(),itens:mine.map(([k,i])=>({a:i.a,i:i.i,n:i.n,t:i.t,r:i.r,...(i.r==='IN'?{just:i.just.trim()}:{}),...(RH.ehTemp(i.t)&&RH.fmtIdeal(i.tmin,i.tmax)?{ideal:RH.fmtIdeal(i.tmin,i.tmax)}:{}),...(RH.ehTemp(i.t)&&tempVal(i)!=null?{tv:tempVal(i)}:{}),...(fotoObrig(i)?{thumb:i.thumb,fotoId:mk('f:'+k,'f')}:{})}))});
      for(const [k,i] of mine.filter(([,i])=>i.r==='NC')){
        const tipo=byId(S.tiposNC,i.tipoId),eq=i.a==='e'?byId(S.equipamentos,i.i):null;let fotoId=null;
        if(i.full){fotoId=mk('f:'+k,'f');await RH.put('fotos',fotoId,{data:i.full})}
        const sev=+i.sev||tipo?.sev||2;
        await RH.put('ncs',mk('n:'+k,'n'),{ts,rondaId:rid,execId,modeloId:R.modeloId,modeloNome:R.nome,salaId:sala?sala.id:null,salaNome,setor,eqId:eq?.id||null,eqNome:eq?.nome||'',itemTexto:i.t,
          tipoId:i.tipoId,tipoNome:tipo?.nome||'',orient:tipo?.orient||'',sev,desc:i.desc.trim(),thumb:i.thumb||null,fotoId,status:'aberta',resp:respSetor||null,inspNome:st.me.nome});
        totNC++;if(sev>=4)totCrit++;
      }
    }return true});
  if(ok&&totCrit)RH.avisoAgora&&RH.avisoAgora();   /* só a Crítica é avisada na hora; Média/Alta esperam o prazo */
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
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){toast('Este aparelho não permite abrir a câmera aqui. Use "Da galeria".','bad');return}
  try{camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing||'environment'},width:{ideal:1280},height:{ideal:960}},audio:false})}
  catch(e){const neg=e&&(e.name==='NotAllowedError'||e.name==='SecurityError');
    toast(neg?'Permissão da câmera negada. Libere a câmera para este aplicativo nas configurações do aparelho, ou use "Da galeria".':'Não foi possível abrir a câmera ('+((e&&e.name)||'erro')+'). Use "Da galeria".','bad');return}
  const o=document.createElement('div');o.id='cam-ov';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-label','Câmera');
  o.style.cssText='position:fixed;inset:0;z-index:200;background:#000;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom)';
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

/* ---------- ronda por QR Code ---------- */
/* localiza o bloco do código lido, confirma a presença com esse mesmo código e rola até ele */
async function irParaLocal(lido){
  const a=RH.local.acharPorCodigo(lido);
  if(!a){toast('Este código não pertence a nenhuma sala ou equipamento cadastrado.','bad');return}
  const bid=a.tipo==='s'?a.id:'eq:'+a.id,bl=st.R&&st.R.blocos.find(b=>b.id===bid);
  if(!bl){toast(`"${a.nome}" não faz parte desta ronda.`,'bad');return}
  const e=RH.local.estado(st.R,bl);
  if(e.ativo&&!e.semCodigo&&!e.ok&&!e.dependente){
    const reg=await RH.local.checkin(bl,lido);
    if(reg&&st.R){RH.local.registrar(st.R,bl.id,reg);saveDraft();if(!reg.ok)toast(reg.msg,'bad');repaintBloco(bl.id)}}
  const el=document.getElementById('bl-'+bid);
  if(el){el.scrollIntoView({behavior:'smooth',block:'start'});el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),1800);toast(`Local: ${a.nome}`)}}

/* ---------- eventos ---------- */
Object.assign(RH.ACT,{pendTog:()=>{st.pendOpen=!st.pendOpen;RH.renderView(false,true)}});
Object.assign(RH.ACT,{
  pickRonda:el=>startRonda(el.dataset.id),
  proxPend:()=>{
    const R=st.R;if(!R)return;
    const pend=Object.keys(R.itens).filter(k=>!R.itens[k].r);
    if(!pend.length){toast('Todos os itens foram respondidos. Revise e finalize a ronda.');document.getElementById('btn-sub')?.focus();return}
    const hd=(document.querySelector('.rhead')?.getBoundingClientRect().bottom||0)+8;
    const abaixo=pend.find(k=>{const e=document.getElementById('it-'+k);return e&&e.getBoundingClientRect().top>hd+4});
    const k=abaixo||pend[0],e=document.getElementById('it-'+k);
    if(e){e.scrollIntoView({behavior:'smooth',block:'center'});e.classList.add('flash');setTimeout(()=>e.classList.remove('flash'),1600)}},
  qrIr:async()=>{                                   /* dentro da ronda: lê o QR de um local e vai até ele (confirmando a presença) */
    if(!st.R)return;
    const lido=await RH.local.escanear('Leia o código do local');if(lido==null||!st.R)return;
    await irParaLocal(lido)},
  qrIniciar:async()=>{                              /* na lista: lê o QR e abre a ronda a que o local pertence */
    const lido=await RH.local.escanear('Leia o código da sala ou do equipamento');if(lido==null)return;
    const a=RH.local.acharPorCodigo(lido);
    if(!a){toast('Este código não pertence a nenhuma sala ou equipamento cadastrado.','bad');return}
    const m=RH.rondaDoItem(a.tipo+':'+a.id);
    if(!m||!RH.access.rondaVisivel(m,st.me)){toast(`"${a.nome}" não faz parte de nenhuma ronda disponível para você.`,'bad');return}
    if(st.R&&st.R.modeloId!==m.id){toast(`Há uma ronda em andamento (${st.R.nome}). Finalize ou descarte antes de iniciar "${m.nome}".`,'bad');return}
    if(!st.R)startRonda(m.id);else RH.renderView(true);
    await irParaLocal(lido)},
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
    {const bl=st.R.blocos.find(b=>b.id===it.sid);if(bl&&RH.local.estado(st.R,bl).bloqueado){toast('Leia o código do local antes de responder o checklist.','bad');return}}
    if(el.dataset.r==='C'&&['baixa','alta'].includes(tempSit(it))){toast('A temperatura medida está fora da faixa ideal: registre como não conforme ou corrija a leitura.','bad');return}
    it.r=it.r===el.dataset.r?'':el.dataset.r;if(it.r!=='NC'||!it.auto){it.auto=false}if(it.r==='NC'&&!it.sev)it.sev=2;repaint(el.dataset.k);saveDraft();if(it.r==='IN')document.getElementById('ina-'+el.dataset.k)?.focus({preventScroll:true})},
  camOpen:el=>camOpen(el.dataset.k),
  rmFoto:el=>{const it=st.R.itens[el.dataset.k];it.thumb=it.full=null;repaint(el.dataset.k);saveDraft()},
  submitRonda
});
RH.ON_CHANGE.push(async el=>{
  if(el.dataset.tv!=null){
    const k=el.dataset.k,it=st.R.itens[k],raw=el.value.trim();
    if(raw!==''&&RH.numTemp(raw)==null){toast('Digite apenas números (ex.: 22,5).','bad');it.tv='';el.value=''}
    else it.tv=raw===''?'':String(RH.numTemp(raw));
    aplicaTemp(k);repaint(k);saveDraft();return true}
  if(el.dataset.nc){
    const it=st.R.itens[el.dataset.k],f=el.dataset.nc;it[f]=el.value;
    if(f==='tipoId'){const t=byId(S.tiposNC,el.value);if(t&&!it.auto)it.sev=t.sev;repaint(el.dataset.k)} /* mostra a orientação do tipo */
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
