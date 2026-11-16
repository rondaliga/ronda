/* ==========================================================================
   Não conformidades: lista com filtros, "visto" (resolve) e exclusão
   (administrador e gestor, com confirmação).
   ========================================================================== */
(()=>{
const RH=window.RH;
const {$,esc,S,NF,st,byId,userName,fd,fdt,ic,empty,sevPill,stPill,ST,SEV,toast,modal,closeModal}=RH;

function filtrar(){
  const q=NF.q.trim().toLowerCase();
  return S.ncs.filter(n=>(NF.status==='todas'||(NF.status==='resolvida'?n.status==='resolvida':n.status!=='resolvida'))&&(!NF.sev||n.sev==NF.sev)&&(!NF.setor||n.setor===NF.setor)&&(!q||[n.desc,n.salaNome,n.eqNome,n.tipoNome,n.itemTexto,n.modeloNome].join(' ').toLowerCase().includes(q)))}

/* ordenação da tabela (desktop): clique no título da coluna; clicar de novo inverte */
const COLS=[['sev','Severidade',n=>n.sev||0],['local','Local',n=>((n.eqNome||n.salaNome||'')+' '+(n.setor||'')).toLowerCase()],['tipo','Tipo',n=>(n.tipoNome||'').toLowerCase()],['sit','Situação',n=>({aberta:0,tratamento:1,resolvida:2})[n.status]??9]];
function ordenar(l){
  const o=NF.ord;if(!o)return l;const c=COLS.find(x=>x[0]===o.k);if(!c)return l;const f=c[2],dir=o.dir==='desc'?-1:1;
  return l.map((n,i)=>[n,i]).sort((a,b)=>{const x=f(a[0]),y=f(b[0]);
    if(x==null&&y==null)return a[1]-b[1];if(x==null)return 1;if(y==null)return -1;   /* sem valor vai sempre ao fim */
    return (x<y?-1:x>y?1:0)*dir||a[1]-b[1]}).map(x=>x[0])}
function tabela(l){
  const o=NF.ord||{};
  const th=([k,t])=>`<th scope="col" aria-sort="${o.k===k?(o.dir==='desc'?'descending':'ascending'):'none'}"><button type="button" class="sort${o.k===k?' on':''}" data-act="ncOrd" data-k="${k}">${t}<i aria-hidden="true">${o.k===k?(o.dir==='desc'?'▼':'▲'):'↕'}</i></button></th>`;
  return `<div class="nct-wrap"><table class="nct"><thead><tr>${COLS.slice(0,1).map(th).join('')}${COLS.slice(1,3).map(th).join('')}<th scope="col">Descrição</th>${COLS.slice(3).map(th).join('')}</tr></thead><tbody>${l.slice(0,150).map(n=>{
    return `<tr class="s${n.sev}" data-act="ncOpen" data-id="${n.id}" tabindex="0" role="button"><td>${sevPill(n.sev)}</td><td><b>${esc(n.eqNome||n.salaNome)}</b>${n.setor?`<small>${esc(n.setor)}</small>`:''}${repSelo(n)}</td><td>${esc(n.tipoNome||'Não conformidade')}</td><td class="dsc">${esc(n.desc||n.itemTexto||'')}</td><td>${stPill(n.status)}</td></tr>`}).join('')}</tbody></table></div>`}
/* selo "Repetida ×N" quando o mesmo item do mesmo local teve NC N vezes em 30 dias */
const repSelo=n=>{const r=RH.recorr(n);return r.n>=2?`<span class="rep" title="${r.n} ocorrências em ${RH.REC_DIAS} dias neste item">↻ Repetida ×${r.n}</span>`:''};
function lista(tab){
  const l=ordenar(filtrar());if(!l.length)return empty('Nenhuma não conformidade com estes filtros');
  return (tab?tabela(l):'')+`<div class="ncs${tab?' ncs-mob':''}">${l.slice(0,150).map(n=>{
    return `<button class="nc s${n.sev}" data-act="ncOpen" data-id="${n.id}">${n.thumb?`<img class="thumb" src="${n.thumb}" alt="">`:`<div class="thumb">${ic('alert',20)}</div>`}
    <div style="min-width:0"><b>${esc(n.tipoNome||'Não conformidade')} · ${esc(n.eqNome||n.salaNome)}</b><p>${esc(n.desc||n.itemTexto)}</p></div><div class="meta"><span>${esc(n.salaNome)}${n.setor?' · '+esc(n.setor):''}</span>${n.modeloNome?`<span>Ronda: ${esc(n.modeloNome)}</span>`:''}<span>${fdt(n.ts)}</span></div>
    <div class="right">${sevPill(n.sev)}${stPill(n.status)}${repSelo(n)}</div></button>`}).join('')}</div>${l.length>150?`<p class="hint">Mostrando 150 de ${l.length}. Use os filtros para refinar.</p>`:''}`}
RH.ncList=()=>lista(false);

RH.pages.ncs=()=>{
  const setores=[...new Set(S.ncs.map(n=>n.setor).filter(Boolean))].sort();
  const opened=S.ncs.filter(n=>n.status!=='resolvida').length;
  return `${RH.avisoLimite(['ncs'])}<div class="top"><div><h1>Não conformidades</h1><p>${opened} não resolvidas · ${S.ncs.length} registradas</p></div></div>
  <div class="filters" style="margin-bottom:14px"><div class="chips" role="group" aria-label="Situação">${[['aberta','Abertas'],['resolvida','Resolvidas'],['todas','Todas']].map(([v,l])=>`<button class="chip" data-act="ncStatus" data-v="${v}" aria-pressed="${NF.status===v}">${l}</button>`).join('')}</div><button type="button" class="btn sm nf-toggle" data-act="ncFiltros" aria-expanded="${!!NF.mais}">${ic('set',16)} Filtros${[NF.sev,NF.setor,NF.q.trim()].filter(Boolean).length?` (${[NF.sev,NF.setor,NF.q.trim()].filter(Boolean).length})`:''}</button></div>
  <div class="filters nf-extra${NF.mais?' open':''}" style="margin-bottom:14px"><label class="field"><span>Severidade</span><select data-set="NF:sev"><option value="">Todas</option>${[4,3,2,1].map(s=>`<option value="${s}" ${NF.sev==s?'selected':''}>${SEV[s]}</option>`).join('')}</select></label>
  <label class="field"><span>Setor</span><select data-set="NF:setor"><option value="">Todos</option>${setores.map(s=>`<option ${NF.setor===s?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
  <label class="field" style="flex:1;min-width:200px"><span>Buscar</span><input type="text" id="nc-q" data-set="NF:q" data-live="nc" value="${esc(NF.q)}" placeholder="Sala, equipamento, ronda, descrição…"></label></div>
  <div id="nc-list">${lista(true)}</div>`;
};

function openNC(id,ov){
  const n={...byId(S.ncs,id),...(ov||{})};if(!n.id)return;
  const edit=RH.access.canEditNC(),canDel=RH.access.canDeleteNC(),res=n.status==='resolvida';
  const orient=n.orient||byId(S.tiposNC,n.tipoId)?.orient||'';
  const quem=res?(n.resolvidoPor?userName(n.resolvidoPor):'—'):st.me.nome;
  modal(`<div class="mh"><div><h3 style="font-size:16px">${esc(n.tipoNome||'Não conformidade')} ${sevPill(n.sev)}</h3><small>${esc(n.salaNome)}${n.eqNome?' · '+esc(n.eqNome):''}${n.modeloNome?' · '+esc(n.modeloNome):''}</small></div><button class="ic-btn" data-act="closeModal" aria-label="Fechar">${ic('x',16)}</button></div>
  <form id="f-nc" data-id="${n.id}"><div class="mb">
  ${n.fotoId||n.thumb?`<div id="nc-foto">${n.thumb?`<img class="big-img" src="${n.thumb}" alt="Foto da não conformidade" style="max-height:200px;object-fit:cover">`:''}${n.fotoId?'<i class="sk sk-foto" role="status" aria-label="Carregando foto"></i>':`<small>Foto original removida após ${RH.FOTOS_DIAS} dias (miniatura mantida).</small>`}</div>`:''}
  ${(()=>{const r=RH.recorr(n);return r.n>=2?`<div class="rep-box" role="note"><b>↻ Problema repetido:</b> ${r.n}ª ocorrência deste item em ${RH.REC_DIAS} dias (anteriores: ${r.datas.sort((a,b)=>b-a).slice(0,5).map(t=>fd(t)).join(', ')}). Vale investigar a causa.</div>`:''})()}
  ${RH.orientBox(orient)}
  <dl class="kv"><dt>Descrição</dt><dd>${esc(n.desc)}</dd><dt>Item</dt><dd>${esc(n.itemTexto||'—')}</dd><dt>Registrada</dt><dd>${fdt(n.ts)} · ${esc(n.inspNome||'—')}</dd></dl>
  ${n.resolucao?`<p class="av-dica">Ação registrada: ${esc(n.resolucao)}</p>`:''}
  <label class="visto${res?' ok':''}"><input type="checkbox" data-nc-visto="${n.id}" ${res?'checked':''} ${edit?'':'disabled'} aria-describedby="visto-d"><span class="vt"><b>${res?'Visto e resolvida':'Marcar como visto'}</b><small id="visto-d">${res?`Visualizado por <b>${esc(quem)}</b>${n.resolvidoEm?' em '+fdt(n.resolvidoEm):''}`:edit?`Será registrado como visualizado por <b>${esc(quem)}</b> e a não conformidade passa a resolvida.`:'Aguardando visualização de um gestor ou administrador.'}</small></span></label>
  <div class="err" id="nc-err" role="alert"></div></div>
  <div class="mf">${canDel?`<button type="button" class="btn bad sp" data-act="delNC" data-id="${n.id}" id="btn-delnc">${ic('trash',16)} Excluir</button>`:''}<button type="button" class="btn" data-act="closeModal">Fechar</button></div></form>`,true);
  if(n.fotoId)st.db.doc('fotos/'+n.fotoId).get().then(s=>{const b=$('#nc-foto');if(!b)return;b.innerHTML=s.exists?`<img class="big-img" src="${esc(s.data().data)}" alt="Foto da não conformidade">`:'<small>Foto indisponível.</small>'}).catch(()=>{});
}

/* marcar "visto" registra quem viu e resolve a NC; desmarcar reabre */
async function visto(el){
  const n=byId(S.ncs,el.dataset.ncVisto);if(!n||!RH.access.canEditNC()){el.checked=!el.checked;return}
  const on=el.checked,d=on?{status:'resolvida',resolvidoEm:Date.now(),resolvidoPor:st.me.id}:{status:'aberta',resolvidoEm:null,resolvidoPor:null};
  el.disabled=true;
  const ok=await RH.safe(async()=>{await RH.upd('ncs',n.id,d);return true});
  if(ok){toast(on?'Marcada como vista e resolvida.':'Não conformidade reaberta.');openNC(n.id,d)}else{el.checked=!on;el.disabled=false}
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
  ncOrd:el=>{const k=el.dataset.k,o=NF.ord;const d0=k==='sev'?'desc':'asc';NF.ord=!o||o.k!==k?{k,dir:d0}:o.dir===d0?{k,dir:d0==='asc'?'desc':'asc'}:null;$('#nc-list').innerHTML=lista(true)},
  ncFiltros:()=>{NF.mais=!NF.mais;RH.renderView()},
  ncStatus:el=>{NF.status=el.dataset.v;RH.renderView()},
  delNC:el=>delNC(el)
});
RH.ON_INPUT.push(el=>{if(el.dataset.live==='nc'){NF.q=el.value;$('#nc-list').innerHTML=lista(true);return true}return false});
RH.ON_CHANGE.push(el=>{if(el.dataset.ncVisto==null)return false;visto(el);return true});
RH.ON_SUBMIT['f-nc']=e=>{};
addEventListener('keydown',e=>{const tr=e.target.closest&&e.target.closest('tr.s1,tr.s2,tr.s3,tr.s4,tr[data-act="ncOpen"]');if(tr&&(e.key==='Enter'||e.key===' ')&&e.target===tr){e.preventDefault();openNC(tr.dataset.id)}});
})();
