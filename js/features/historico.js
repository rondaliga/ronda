/* ==========================================================================
   Histórico de rondas: uma linha por execução (ronda), com o detalhe por sala.
   ========================================================================== */
(()=>{
const RH=window.RH;
const {esc,S,st,HF,pc,fdt,ic,empty,modal,closeModal,toast,SEV}=RH;

/* Inspetor: só enxerga as rondas que ele mesmo realizou. Gestor/administrador: todas. */
const visiveis=()=>RH.access.soPropriasRondas()?S.rondas.filter(RH.access.rondaFeitaVisivel):S.rondas;
const rotulo=r=>r==='C'?'Conforme':r==='NC'?'Não conforme':'Inacessível';  /* 'NA' = registros antigos */

RH.pages.historico=()=>{
  const from=Date.now()-HF.periodo*864e5,propria=RH.access.soPropriasRondas();
  const ex=RH.execs(visiveis().filter(r=>r.ts>=from&&(!HF.ronda||r.modeloId===HF.ronda)));
  const meta=+S.cfg.meta||95;
  return `<div class="top"><div><h1>${propria?'Minhas rondas':'Histórico de rondas'}</h1><p>${ex.length} ronda${ex.length===1?'':'s'} no período${propria?' · somente as realizadas por você':''}</p></div>
  <div class="filters"><label class="field"><span>Período</span><select data-set="HF:periodo" data-num="1">${[7,30,90,365].map(d=>`<option value="${d}" ${d===HF.periodo?'selected':''}>Últimos ${d} dias</option>`).join('')}</select></label>
  <label class="field"><span>Ronda</span><select data-set="HF:ronda"><option value="">Todas as rondas</option>${[...S.modelos].sort((a,b)=>a.nome.localeCompare(b.nome)).map(m=>`<option value="${m.id}" ${m.id===HF.ronda?'selected':''}>${esc(m.nome)}</option>`).join('')}</select></label></div></div>
  ${ex.length?`<div class="tw"><table><thead><tr><th>Data</th><th>Ronda</th><th>Inspetor</th><th>Conformidade</th><th>Itens</th><th>NCs</th></tr></thead><tbody>${ex.slice(0,200).map(e=>`<tr data-act="rondaOpen" data-id="${esc(e.id)}"><td class="num">${fdt(e.ts)}</td><td><b>${esc(e.nome)}</b><small>${qtd(e)}</small></td><td>${esc(e.inspNome)}</td><td class="num"><span class="pill ${e.pct>=meta?'okp':'st-aberta'}">${pc(e.pct)}</span></td><td class="num">${e.c+e.nc+e.ina}</td><td class="num">${e.nc||'—'}</td></tr>`).join('')}</tbody></table></div>`:empty('Nenhuma ronda no período','Registre uma ronda em Nova ronda.')}`;
};

/* NCs geradas por uma execução (documentos novos têm execId; antigos, só rondaId) */
const ncsDa=e=>S.ncs.filter(n=>n.execId===e.id||e.docs.some(d=>d.id===n.rondaId));

/* "2 salas · 1 equipamento" de uma execução (documentos antigos por sala continuam contando como salas) */
function qtd(e){
  const ns=e.docs.filter(r=>r.salaId||!(r.itens||[]).every(i=>i.a==='e')).length,eq=new Set();
  e.docs.forEach(r=>(r.itens||[]).forEach(i=>{if(i.a==='e')eq.add(i.i)}));
  return [ns?`${ns} sala${ns===1?'':'s'}`:'',eq.size?`${eq.size} equipamento${eq.size===1?'':'s'}`:''].filter(Boolean).join(' · ')||'—'}
function openRonda(id){
  const e=RH.execs(visiveis().filter(r=>(r.execId||r.id)===id))[0];if(!e)return;
  /* só ocorrências: itens Não conforme / Inacessível (os conformes não são listados). NCs trazem a foto capturada na ronda. */
  const ncs=ncsDa(e),ncDe=(r,i)=>ncs.find(n=>(n.rondaId===r.id||(n.execId&&n.execId===r.execId))&&n.itemTexto===i.t&&(i.a==='e'?n.eqId===i.i:!n.eqId&&n.salaId===r.salaId));
  const itemOc=(r,i)=>{
    const n=i.r==='NC'?ncDe(r,i):null;
    return `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div style="display:flex;gap:10px;justify-content:space-between;align-items:center"><div style="min-width:0"><span>${esc(i.t)}</span>${i.just?`<small style="display:block;color:var(--ink2)">Motivo: ${esc(i.just)}</small>`:''}</div><span style="flex:none" class="pill ${i.r==='NC'?'st-aberta':'off'}">${rotulo(i.r)}</span></div>
    ${n?`<div style="margin-top:6px;display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">${n.thumb||n.fotoId?`<img class="big-img" ${n.fotoId?`data-foto="${esc(n.fotoId)}"`:''} src="${n.thumb?esc(n.thumb):''}" alt="Foto da não conformidade" style="max-width:220px;max-height:160px;object-fit:cover;border-radius:8px">`:''}
      <div style="flex:1;min-width:180px"><small style="display:block"><b>${esc(n.tipoNome||'')}</b> · severidade ${esc(SEV[n.sev]||n.sev)}</small>${n.desc?`<small style="display:block;color:var(--ink2)">${esc(n.desc)}</small>`:''}</div></div>`:''}</div>`};
  const comOc=[];
  e.docs.forEach(r=>{
    const oc=(r.itens||[]).filter(i=>i.r==='NC'||i.r==='IN'||i.r==='NA');
    if(!oc.length)return;
    const g={};oc.forEach(i=>{(g[i.a+i.i]=g[i.a+i.i]||{n:i.n,l:[]}).l.push(i)});
    comOc.push(`<div><h4 style="font-size:15px;border-bottom:2px solid var(--brand);padding-bottom:4px">${esc(r.salaNome)} <small>${esc(r.setor||'')} · ${pc(r.pct)}</small> ${RH.local.badge(r.presenca)}</h4>
    ${Object.values(g).map(x=>`<div style="margin-top:10px">${x.n===r.salaNome?'':`<b>${esc(x.n)}</b>`}<div style="margin-top:4px">${x.l.map(i=>itemOc(r,i)).join('')}</div></div>`).join('')}</div>`)});
  /* fotos obrigatórias dos itens de Temperatura (conformes; as das NCs já aparecem acima) */
  const fotosT=e.docs.flatMap(r=>(r.itens||[]).filter(i=>i.r==='C'&&(i.thumb||i.fotoId)).map(i=>`<figure style="margin:0;max-width:160px"><img class="big-img" ${i.fotoId?`data-foto="${esc(i.fotoId)}"`:''} src="${i.thumb?esc(i.thumb):''}" alt="Foto de ${esc(i.n)}" style="width:160px;height:120px;object-fit:cover;border-radius:8px"><figcaption><small><b>${esc(i.n)}</b><br>${esc(i.t)}</small></figcaption></figure>`));
  const blocoFotos=fotosT.length?`<div><h4 style="font-size:15px;border-bottom:2px solid var(--brand);padding-bottom:4px">Fotos dos equipamentos (temperatura)</h4><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px">${fotosT.join('')}</div></div>`:'';
  const porSala=(comOc.length?comOc.join(''):'<div class="empty"><b>Nenhuma não conformidade ou item inacessível</b>Todos os itens desta ronda estavam conformes.</div>');
  const obs=e.docs.map(r=>r.obs).find(Boolean),nNC=ncsDa(e).length;
  modal(`<div class="mh"><div><h3 style="font-size:16px">${esc(e.nome)}</h3><small>${fdt(e.ts)} · Inspetor: ${esc(e.inspNome)}</small></div><button class="ic-btn" data-act="closeModal" aria-label="Fechar">${ic('x',16)}</button></div>
  <div class="mb"><div class="print-only rep-h"><b>${esc(S.cfg.hospital||'Ronda Hospitalar')}</b><span>Relatório de ronda · ${esc(e.nome)} · ${fdt(e.ts)} · Inspetor: ${esc(e.inspNome)}</span></div><div class="legend"><span>Conformidade <b>${pc(e.pct)}</b></span><span>Conformes <b>${e.c}</b></span><span>Não conformes <b>${e.nc}</b></span><span>Inacessíveis <b>${e.ina}</b></span></div>
  ${obs?`<div><b>Observações</b><p style="margin:4px 0 0">${esc(obs)}</p></div>`:''}
  ${porSala}${blocoFotos}<div class="print-only rep-f"><div>Inspetor: ${esc(e.inspNome)}</div><div>Responsável pelo setor</div></div></div>
  <div class="mf">${RH.access.canDeleteRonda()?`<button type="button" class="btn bad sp" data-act="delRonda" data-id="${esc(e.id)}" id="btn-delronda">${ic('trash',16)} Excluir ronda</button>
    <label class="chk" style="margin-right:auto"><input type="checkbox" id="del-ncs" ${nNC?'':'disabled'}> Excluir também as ${nNC} não conformidade${nNC===1?'':'s'} geradas</label>`:''}
    <button type="button" class="btn" data-act="printRonda">Imprimir relatório</button><button type="button" class="btn" data-act="closeModal">Fechar</button></div>`,true);
  /* troca a miniatura pela foto completa (coleção fotos) */
  document.querySelectorAll('#modal img[data-foto]').forEach(img=>st.db.doc('fotos/'+img.dataset.foto).get().then(d=>{if(d.exists&&img.isConnected)img.src=d.data().data}).catch(()=>{}));
}
/* exclusão em dois toques; apaga os documentos da execução e, se marcado, as NCs (e fotos) */
function imprimir(){document.body.classList.add('print-modal');const f=()=>{document.body.classList.remove('print-modal');removeEventListener('afterprint',f)};addEventListener('afterprint',f);print()}
async function delRonda(el){
  if(!RH.access.canDeleteRonda())return;
  if(!el.dataset.armed){el.dataset.armed='1';el.textContent='Confirmar exclusão';return}
  const e=RH.execs(S.rondas.filter(r=>(r.execId||r.id)===el.dataset.id))[0];if(!e)return;
  const comNC=document.getElementById('del-ncs')?.checked,ncs=comNC?ncsDa(e):[];
  const ok=await RH.safe(async()=>{
    for(const n of ncs){await RH.del('ncs',n.id);if(n.fotoId)await RH.del('fotos',n.fotoId)}
    for(const d of e.docs){for(const i of d.itens||[])if(i.r==='C'&&i.fotoId)await RH.del('fotos',i.fotoId);await RH.del('rondas',d.id)}
    return true});
  if(ok){closeModal();toast('Ronda excluída'+(ncs.length?` junto com ${ncs.length} não conformidade${ncs.length===1?'':'s'}.`:'.'))}
}
RH.ACT.rondaOpen=el=>openRonda(el.dataset.id);
RH.ACT.delRonda=delRonda;
RH.ACT.printRonda=imprimir;
})();
