/* ==========================================================================
   Painel de controle: indicadores, gráficos e listas de atenção.
   ========================================================================== */
(()=>{
const RH=window.RH;
const {$,esc,S,F,pc,dur,ago,fd,fdt,fdm,sod,ic,empty,sevPill,stPill,SEV,ST}=RH;
let cache=null;

/* cartões do painel que a pessoa minimizou (lembrado neste navegador) */
const MINKEY='rh.painel.min';
const minSet=()=>{if(RH.st.minCards)return RH.st.minCards;let a=[];try{a=JSON.parse(localStorage.getItem(MINKEY)||'[]')}catch(e){}return RH.st.minCards=new Set(Array.isArray(a)?a:[])};
const saveMin=()=>{try{localStorage.setItem(MINKEY,JSON.stringify([...minSet()]))}catch(e){}};
/* cartão com botão de minimizar: k = chave, t = título, sub = texto pequeno ao lado do título */
const card=(k,t,sub,body,cls='')=>{const mn=minSet().has(k);
  return `<div class="card ${cls} ${mn?'min':''}" data-card="${k}"><h3><span class="ct">${esc(t)}${sub?` <small>${sub}</small>`:''}</span><button type="button" class="ic-btn min-btn" data-act="togCard" data-k="${k}" aria-expanded="${!mn}" aria-label="${mn?'Expandir':'Minimizar'}: ${esc(t)}" title="${mn?'Expandir':'Minimizar'}">${ic(mn?'dn':'up',14)}</button></h3><div class="card-b" ${mn?'hidden':''}>${body}</div></div>`};

function hbars(rows,o={}){
  rows=rows.filter(r=>r.v>0||o.keepZero);if(!rows.length)return empty('Sem dados no período');
  const m=Math.max(...rows.map(r=>r.v),1);
  return `<div class="hb">${rows.map(r=>`<div class="hb-r" data-tip="${esc(r.l)}: ${r.v}"><span class="hb-l" title="${esc(r.l)}">${esc(r.l)}</span><span class="hb-t"><i style="width:${r.v?Math.max(r.v/m*100,2):0}%;background:${r.c||'var(--c1)'}"></i></span><span class="hb-v">${r.v}</span></div>`).join('')}</div>`}

RH.pages.painel=()=>{
  const now=Date.now(),days=F.periodo,start=sod(now-(days-1)*864e5);
  const setores=[...new Set(S.salas.map(s=>s.setor).filter(Boolean))].sort();
  const okSet=x=>!F.setor||x.setor===F.setor;
  const rs=S.rondas.filter(r=>r.ts>=start&&okSet(r)), ns=S.ncs.filter(n=>n.ts>=start&&okSet(n));
  let C=0,N=0;rs.forEach(r=>{C+=r.c;N+=r.nc});
  const pct=C+N?C/(C+N)*100:null, meta=+S.cfg.meta||95;
  const abertas=S.ncs.filter(n=>n.status!=='resolvida'&&okSet(n)), graves=abertas.filter(n=>n.sev>=3);
  const rz=ns.filter(n=>n.status==='resolvida'&&n.resolvidoEm), tmr=rz.length?rz.reduce((a,n)=>a+(n.resolvidoEm-n.ts),0)/rz.length/36e5:null;
  const nExec=new Set(rs.map(r=>r.execId||r.id)).size;

  /* salas inspecionadas no período */
  const salas=S.salas.filter(s=>s.ativo!==false&&(!F.setor||s.setor===F.setor));
  const insp=new Set(rs.map(r=>r.salaId)), cob=salas.length?salas.filter(s=>insp.has(s.id)).length/salas.length*100:null;

  /* rondas (cadastro "Nome da ronda") em atraso: última execução mais antiga que a periodicidade */
  const lastM={};S.rondas.forEach(r=>{if(r.modeloId&&(!lastM[r.modeloId]||r.ts>lastM[r.modeloId]))lastM[r.modeloId]=r.ts});
  const modelos=S.modelos.filter(m=>m.ativo!==false&&(!F.setor||RH.salasDaRonda(m).some(s=>s.setor===F.setor)||RH.equipsDaRonda(m).some(e=>RH.setorEq(e)===F.setor)));
  const atraso=modelos.filter(m=>RH.agenda.atrasada(m,lastM[m.id]??null,now));

  /* série diária */
  const ser=[];for(let i=0;i<days;i++){ser.push({t:start+i*864e5,c:0,n:0,r:0})}
  rs.forEach(r=>{const i=Math.min(days-1,Math.floor((sod(r.ts)-start)/864e5));if(ser[i]){ser[i].c+=r.c;ser[i].n+=r.nc;ser[i].r++}});
  cache={ser,meta};
  const cnt=(arr,f)=>{const m={};arr.forEach(x=>{const k=f(x);if(k)m[k]=(m[k]||0)+1});return Object.entries(m).map(([l,v])=>({l,v})).sort((a,b)=>b.v-a.v)};
  const porSetor=cnt(ns,n=>n.setor), porEq=cnt(ns.filter(n=>n.eqNome),n=>n.eqNome+(n.salaNome?' · '+n.salaNome:'')).slice(0,6), porTipo=cnt(ns,n=>n.tipoNome).slice(0,6);
  const sevRows=[4,3,2,1].map(s=>({l:SEV[s],v:ns.filter(n=>n.sev===s).length,c:`var(--s${s})`}));
  const stC={aberta:0,tratamento:0,resolvida:0};ns.forEach(n=>stC[n.status]=(stC[n.status]||0)+1);const stT=ns.length||1;
  const stCol={aberta:'var(--s3)',tratamento:'var(--s1)',resolvida:'var(--good)'};
  const porSala=salas.map(s=>{let c=0,n=0;rs.filter(r=>r.salaId===s.id).forEach(r=>{c+=r.c;n+=r.nc});return {s,p:c+n?c/(c+n)*100:null}}).sort((a,b)=>(a.p??101)-(b.p??101));
  const rec=S.ncs.filter(okSet).slice(0,6);
  const tile=(l,v,sub,cls='')=>`<div class="kpi"><label>${l}</label><strong class="${cls}">${v}</strong><small>${sub}</small></div>`;

  return `<div class="top"><div><h1>Painel de controle</h1><p>Indicadores de conformidade das rondas${F.setor?' · '+esc(F.setor):' · todos os setores'}</p></div>
  <div class="filters"><label class="field"><span>Período</span><select data-set="F:periodo" data-num="1">${[7,30,90].map(d=>`<option value="${d}" ${d===days?'selected':''}>Últimos ${d} dias</option>`).join('')}</select></label>
  <label class="field"><span>Setor</span><select data-set="F:setor"><option value="">Todos os setores</option>${setores.map(s=>`<option ${s===F.setor?'selected':''}>${esc(s)}</option>`).join('')}</select></label></div>
  <div class="tools"><button type="button" class="btn sm" data-act="togTodos" data-v="min">Minimizar tudo</button><button type="button" class="btn sm" data-act="togTodos" data-v="exp">Expandir tudo</button></div></div>
  <section class="kpis" aria-label="Indicadores">
  ${tile('Conformidade geral',pc(pct),pct==null?'Sem rondas no período':pct>=meta?`Meta de ${meta}% atingida`:`Abaixo da meta de ${meta}%`,pct==null?'':pct>=meta?'good':'badc')}
  ${tile('Rondas realizadas',nExec.toLocaleString('pt-BR'),`${(C+N).toLocaleString('pt-BR')} itens avaliados`)}
  ${tile('NCs em aberto',abertas.length,`${graves.length} de severidade alta ou crítica`,graves.length?'badc':'')}
  ${tile('Tempo médio de resolução',dur(tmr),`${rz.length} NC${rz.length===1?'':'s'} resolvida${rz.length===1?'':'s'}`)}
  ${tile('Cobertura de salas',pc(cob),`${salas.filter(s=>insp.has(s.id)).length} de ${salas.length} salas inspecionadas`)}
  ${tile('Rondas em atraso',atraso.length,atraso.length?'Veja a lista abaixo':'Todas dentro da agenda',atraso.length?'badc':'good')}
  </section>
  <section class="grid2">
  ${card('linha','Conformidade por dia',`meta ${meta}%`,'<div id="ch-line"></div>','span2')}
  ${card('setor','Não conformidades por setor',`${ns.length} no período`,hbars(porSetor))}
  ${card('sev','Por severidade','',hbars(sevRows,{keepZero:1}))}
  ${card('situacao','Situação das NCs do período','',ns.length?`<div class="seg-bar" role="img" aria-label="Distribuição por situação">${Object.keys(ST).map(k=>stC[k]?`<i style="flex:${stC[k]};background:${stCol[k]}" data-tip="${ST[k]}: ${stC[k]}"></i>`:'').join('')}</div>
   <div class="legend">${Object.keys(ST).map(k=>`<span><i style="background:${stCol[k]}"></i>${ST[k]} <b>${stC[k]||0}</b> <small>(${Math.round((stC[k]||0)/stT*100)}%)</small></span>`).join('')}</div>`:empty('Sem NCs no período'))}
  ${card('tipos','Tipos de NC mais frequentes','',hbars(porTipo))}
  ${card('equip','Equipamentos com mais NCs','',hbars(porEq))}
  ${card('atraso','Rondas em atraso','',atraso.length?`<div class="hb">${atraso.slice(0,6).map(m=>`<div class="hb-r" style="grid-template-columns:1fr auto"><span class="hb-l" style="color:var(--ink)">${esc(m.nome)} <small>${(m.salaIds||[]).length} sala${(m.salaIds||[]).length===1?'':'s'}</small></span><span class="pill late">${lastM[m.id]?ago(lastM[m.id]):'Nunca realizada'}</span></div>`).join('')}</div>`:empty('Nenhuma ronda em atraso','Todas as rondas estão dentro da agenda de dias e horários.'))}
  ${card('sala','Conformidade por sala','ordenado da menor para a maior',porSala.length?`<div class="hb">${porSala.map(x=>`<div class="hb-r" data-tip="${esc(x.s.nome)}: ${pc(x.p)}"><span class="hb-l">${esc(x.s.nome)}</span><span class="hb-t"><i style="width:${x.p??0}%;background:${x.p==null?'transparent':x.p>=meta?'var(--c1)':'var(--s3)'}"></i></span><span class="hb-v">${x.p==null?'—':Math.round(x.p)+'%'}</span></div>`).join('')}</div><p class="hint" style="margin:10px 0 0">Barras vermelhas estão abaixo da meta de ${meta}%.</p>`:empty('Nenhuma sala cadastrada','Cadastre salas em Cadastros.'),'span2')}
  ${card('recentes','Não conformidades recentes','',rec.length?`<div class="tw" style="border:0"><table><thead><tr><th>Data</th><th>Local</th><th>Descrição</th><th>Severidade</th><th>Situação</th></tr></thead><tbody>${rec.map(n=>`<tr data-act="ncOpen" data-id="${n.id}"><td class="num">${fdt(n.ts)}</td><td>${esc(n.eqNome||n.salaNome)}<small>${esc(n.eqNome?n.salaNome:n.setor||'')}</small></td><td>${esc((n.desc||n.itemTexto||'').slice(0,80))}</td><td>${sevPill(n.sev)}</td><td>${stPill(n.status)}</td></tr>`).join('')}</tbody></table></div>`:empty('Nenhuma não conformidade registrada'),'span2')}
  </section>`;
};

/* gráfico de linha da conformidade diária (SVG próprio) */
function drawLine(){
  const el=$('#ch-line');if(!el||!cache)return;
  const {ser,meta}=cache,W=Math.max(300,el.clientWidth||640),H=230,L=40,Rr=14,T=12,B=26;
  const pts=ser.map((d,i)=>({i,t:d.t,v:d.c+d.n?d.c/(d.c+d.n)*100:null,r:d.r,n:d.n}));
  const vals=pts.filter(p=>p.v!=null).map(p=>p.v);
  if(!vals.length){el.innerHTML=empty('Sem rondas no período','Registre uma ronda para ver a evolução da conformidade.');return}
  const lo=Math.max(0,Math.floor((Math.min(...vals,meta)-4)/10)*10),hi=100;
  const x=i=>L+(pts.length<2?0:i/(pts.length-1))*(W-L-Rr), y=v=>T+(1-(v-lo)/(hi-lo))*(H-T-B);
  let g='';for(let v=lo;v<=hi;v+=(hi-lo>40?20:10))g+=`<line x1="${L}" x2="${W-Rr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end" fill="var(--muted)" font-size="11">${v}%</text>`;
  const step=Math.ceil(pts.length/(W<520?5:8));let xt='';pts.forEach((p,i)=>{if(i%step===0||(i===pts.length-1&&i%step>=Math.ceil(step/2)))xt+=`<text x="${x(i)}" y="${H-6}" text-anchor="middle" fill="var(--muted)" font-size="11">${fdm(p.t)}</text>`});
  let d='',pen=false;pts.forEach(p=>{if(p.v==null){pen=false;return}d+=(pen?'L':'M')+x(p.i).toFixed(1)+' '+y(p.v).toFixed(1);pen=true});
  const dots=pts.filter(p=>p.v!=null).map((p,k,a)=>`<circle cx="${x(p.i)}" cy="${y(p.v)}" r="${k===a.length-1?5:pts.length>45?0:3}" fill="var(--c1)" stroke="var(--surface)" stroke-width="2"/>`).join('');
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Conformidade diária, de ${pc(Math.min(...vals))} a ${pc(Math.max(...vals))}">${g}
  <line x1="${L}" x2="${W-Rr}" y1="${y(meta)}" y2="${y(meta)}" stroke="var(--good)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${W-Rr}" y="${y(meta)-5}" text-anchor="end" fill="var(--ok)" font-size="11" font-weight="600">Meta ${meta}%</text>
  <path d="${d}" fill="none" stroke="var(--c1)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${dots}${xt}
  <line id="xh" y1="${T}" y2="${H-B}" stroke="var(--line2)" stroke-dasharray="3 3" visibility="hidden"/><circle id="xd" r="5" fill="var(--c1)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/><rect x="${L}" y="${T}" width="${W-L-Rr}" height="${H-T-B}" fill="transparent" id="xr"/></svg>`;
  const svg=el.firstChild,r=$('#xr',svg),xh=$('#xh',svg),xd=$('#xd',svg);
  r.addEventListener('mousemove',e=>{const b=svg.getBoundingClientRect(),sx=(e.clientX-b.left)*W/b.width;
    let best=null;pts.forEach(p=>{if(p.v==null)return;if(!best||Math.abs(x(p.i)-sx)<Math.abs(x(best.i)-sx))best=p});if(!best)return;
    xh.setAttribute('x1',x(best.i));xh.setAttribute('x2',x(best.i));xh.setAttribute('visibility','visible');xd.setAttribute('cx',x(best.i));xd.setAttribute('cy',y(best.v));xd.setAttribute('visibility','visible');
    RH.showTip(`${fd(best.t)} · ${pc(best.v)} · ${best.r} sala${best.r===1?'':'s'} · ${best.n} NC`,e.clientX,e.clientY)});
  r.addEventListener('mouseleave',()=>{RH.tip.hidden=true;xh.setAttribute('visibility','hidden');xd.setAttribute('visibility','hidden')});
}
RH.after.painel=drawLine;
Object.assign(RH.ACT,{togCard:el=>{
  const k=el.dataset.k,box=el.closest('.card'),m=minSet(),fechar=!m.has(k);
  fechar?m.add(k):m.delete(k);saveMin();
  box.classList.toggle('min',fechar);box.querySelector('.card-b').hidden=fechar;
  el.setAttribute('aria-expanded',String(!fechar));el.innerHTML=ic(fechar?'dn':'up',14);
  const t=box.querySelector('.ct').firstChild.textContent.trim();el.setAttribute('aria-label',(fechar?'Expandir':'Minimizar')+': '+t);el.title=fechar?'Expandir':'Minimizar';
  if(!fechar&&k==='linha')drawLine()},
  /* minimiza ou expande todos os cartões de uma vez */
  togTodos:el=>{const fechar=el.dataset.v==='min',m=minSet();
    document.querySelectorAll('.card[data-card]').forEach(c=>{const k=c.dataset.card;fechar?m.add(k):m.delete(k)});saveMin();RH.renderView(true)}});
let rz;addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{if(RH.st.page==='painel')drawLine()},150)});
})();
