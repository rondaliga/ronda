/* ==========================================================================
   Não conformidades: lista com filtros, tratamento (situação, responsável, prazo,
   ação corretiva) e exclusão (administrador e gestor, com confirmação).
   ========================================================================== */
(()=>{
const RH=window.RH;
const {$,esc,S,NF,st,byId,userName,fd,fdt,ic,empty,sevPill,stPill,ST,SEV,toast,modal,closeModal}=RH;

function filtrar(){
  const q=NF.q.trim().toLowerCase();
  return S.ncs.filter(n=>(NF.status==='todas'||(NF.status==='abertas'?n.status!=='resolvida':n.status===NF.status))&&(!NF.sev||n.sev==NF.sev)&&(!NF.setor||n.setor===NF.setor)&&(!q||[n.desc,n.salaNome,n.eqNome,n.tipoNome,n.itemTexto,n.modeloNome].join(' ').toLowerCase().includes(q)))}

function lista(){
  const l=filtrar();if(!l.length)return empty('Nenhuma não conformidade com estes filtros');
  return `<div class="ncs">${l.slice(0,150).map(n=>{const late=n.status!=='resolvida'&&n.prazo&&n.prazo<Date.now();
    return `<button class="nc s${n.sev}" data-act="ncOpen" data-id="${n.id}">${n.thumb?`<img class="thumb" src="${n.thumb}" alt="">`:`<div class="thumb">${ic('alert',20)}</div>`}
    <div style="min-width:0"><b>${esc(n.tipoNome||'Não conformidade')} · ${esc(n.eqNome||n.salaNome)}</b><p>${esc(n.desc||n.itemTexto)}</p><div class="meta"><span>${esc(n.salaNome)}${n.setor?' · '+esc(n.setor):''}</span>${n.modeloNome?`<span>Ronda: ${esc(n.modeloNome)}</span>`:''}<span>${fdt(n.ts)}</span><span>Resp.: ${esc(userName(n.resp))}</span>${n.status!=='resolvida'&&n.prazo?`<span style="${late?'color:var(--bad);font-weight:600':''}">Prazo ${fd(n.prazo)}${late?' (vencido)':''}</span>`:''}</div></div>
    <div class="right">${sevPill(n.sev)}${stPill(n.status)}</div></button>`}).join('')}</div>${l.length>150?`<p class="hint">Mostrando 150 de ${l.length}. Use os filtros para refinar.</p>`:''}`}
RH.ncList=lista;

RH.pages.ncs=()=>{
  const setores=[...new Set(S.ncs.map(n=>n.setor).filter(Boolean))].sort();
  const opened=S.ncs.filter(n=>n.status!=='resolvida').length;
  return `<div class="top"><div><h1>Não conformidades</h1><p>${opened} em aberto · ${S.ncs.length} registradas</p></div></div>
  <div class="filters" style="margin-bottom:14px"><div class="chips" role="group" aria-label="Situação">${[['abertas','Em aberto'],['aberta','Abertas'],['tratamento','Em tratamento'],['resolvida','Resolvidas'],['todas','Todas']].map(([v,l])=>`<button class="chip" data-act="ncStatus" data-v="${v}" aria-pressed="${NF.status===v}">${l}</button>`).join('')}</div></div>
  <div class="filters" style="margin-bottom:14px"><label class="field"><span>Severidade</span><select data-set="NF:sev"><option value="">Todas</option>${[4,3,2,1].map(s=>`<option value="${s}" ${NF.sev==s?'selected':''}>${SEV[s]}</option>`).join('')}</select></label>
  <label class="field"><span>Setor</span><select data-set="NF:setor"><option value="">Todos</option>${setores.map(s=>`<option ${NF.setor===s?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
  <label class="field" style="flex:1;min-width:200px"><span>Buscar</span><input type="text" id="nc-q" data-set="NF:q" data-live="nc" value="${esc(NF.q)}" placeholder="Sala, equipamento, ronda, descrição…"></label></div>
  <div id="nc-list">${lista()}</div>`;
};

function openNC(id){
  const n=byId(S.ncs,id);if(!n)return;
  const edit=RH.access.canEditNC(),canDel=RH.access.canDeleteNC();
  const users=S.users.filter(u=>u.ativo!==false);
  const orient=n.orient||byId(S.tiposNC,n.tipoId)?.orient||'';
  modal(`<div class="mh"><div><h3 style="font-size:16px">${esc(n.tipoNome||'Não conformidade')}</h3><small>${esc(n.salaNome)}${n.eqNome?' · '+esc(n.eqNome):''}</small></div><button class="ic-btn" data-act="closeModal" aria-label="Fechar">${ic('x',16)}</button></div>
  <form id="f-nc" data-id="${n.id}"><div class="mb">
  ${n.fotoId?`<div id="nc-foto">${n.thumb?`<img class="big-img" src="${n.thumb}" alt="Foto da não conformidade" style="max-height:200px;object-fit:cover">`:''}<small>Carregando foto…</small></div>`:''}
  ${RH.orientBox(orient)}
  <dl class="kv"><dt>Descrição</dt><dd>${esc(n.desc)}</dd><dt>Item do checklist</dt><dd>${esc(n.itemTexto||'—')}</dd>${n.modeloNome?`<dt>Ronda</dt><dd>${esc(n.modeloNome)}</dd>`:''}<dt>Registrada</dt><dd>${fdt(n.ts)} por ${esc(n.inspNome||'—')}</dd><dt>Severidade</dt><dd>${sevPill(n.sev)}</dd></dl>
  <div class="fg"><label class="field"><span>Situação</span><select name="status" ${edit?'':'disabled'}>${Object.entries(ST).map(([k,v])=>`<option value="${k}" ${n.status===k?'selected':''}>${v}</option>`).join('')}</select></label>
  <label class="field"><span>Responsável pela correção</span><select name="resp" ${edit?'':'disabled'}><option value="">—</option>${users.map(u=>`<option value="${u.id}" ${n.resp===u.id?'selected':''}>${esc(u.nome)}</option>`).join('')}</select></label>
  <label class="field"><span>Prazo</span><input type="date" name="prazo" value="${n.prazo?RH.ymd(n.prazo):''}" ${edit?'':'disabled'}></label>
  <label class="field"><span>Severidade</span><select name="sev" ${edit?'':'disabled'}>${[1,2,3,4].map(s=>`<option value="${s}" ${n.sev==s?'selected':''}>${s} · ${SEV[s]}</option>`).join('')}</select></label>
  <label class="field full"><span>Ação corretiva / resolução</span><textarea name="resolucao" ${edit?'':'disabled'} placeholder="O que foi feito para corrigir?">${esc(n.resolucao||'')}</textarea></label></div>
  ${n.resolvidoEm?`<small>Resolvida em ${fdt(n.resolvidoEm)}</small>`:''}<div class="err" id="nc-err" role="alert"></div></div>
  <div class="mf">${canDel?`<button type="button" class="btn bad sp" data-act="delNC" data-id="${n.id}" id="btn-delnc">${ic('trash',16)} Excluir</button>`:''}${edit?`<button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn pri" type="submit">Salvar</button>`:`<button type="button" class="btn" data-act="closeModal">Fechar</button>`}</div></form>`,true);
  if(n.fotoId)st.db.doc('fotos/'+n.fotoId).get().then(s=>{const b=$('#nc-foto');if(!b)return;b.innerHTML=s.exists?`<img class="big-img" src="${esc(s.data().data)}" alt="Foto da não conformidade">`:'<small>Foto indisponível.</small>'}).catch(()=>{});
}

async function saveNC(f){
  const n=byId(S.ncs,f.dataset.id);if(!n||!RH.access.canEditNC())return;
  const fm=new FormData(f),situ=fm.get('status');
  const d={status:situ,resp:fm.get('resp')||null,sev:+fm.get('sev'),resolucao:(fm.get('resolucao')||'').trim(),prazo:fm.get('prazo')?new Date(fm.get('prazo')+'T12:00:00').getTime():null};
  if(situ==='resolvida'&&!n.resolvidoEm)d.resolvidoEm=Date.now();
  if(situ!=='resolvida'&&n.resolvidoEm)d.resolvidoEm=null;
  if(situ==='resolvida'&&!d.resolucao){toast('Descreva a ação corretiva para marcar como resolvida.','bad');return}
  const ok=await RH.safe(async()=>{await RH.upd('ncs',n.id,d);return true});
  if(ok){closeModal();toast('Não conformidade atualizada.')}
}

/* exclusão em dois toques: o 1º toque pede confirmação, o 2º exclui (a foto também) */
async function delNC(el){
  if(!RH.access.canDeleteNC())return;
  if(!el.dataset.armed){el.dataset.armed='1';el.textContent='Confirmar exclusão';return}
  const n=byId(S.ncs,el.dataset.id);if(!n)return;
  const ok=await RH.safe(async()=>{await RH.del('ncs',n.id);if(n.fotoId)await RH.del('fotos',n.fotoId);return true});
  if(ok){closeModal();toast('Não conformidade excluída.')}
}

Object.assign(RH.ACT,{
  ncOpen:el=>openNC(el.dataset.id),
  ncStatus:el=>{NF.status=el.dataset.v;RH.renderView()},
  delNC:el=>delNC(el)
});
RH.ON_INPUT.push(el=>{if(el.dataset.live==='nc'){NF.q=el.value;$('#nc-list').innerHTML=lista();return true}return false});
RH.ON_SUBMIT['f-nc']=saveNC;
})();
