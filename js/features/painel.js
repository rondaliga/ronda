/* ==========================================================================
   Painel de controle: indicadores, gráficos e listas de atenção.
   ========================================================================== */
(()=>{
const RH=window.RH;
const {$,esc,S,F,pc,dur,ago,fd,fdt,fdm,sod,ic,empty,sevPill,stPill,SEV,ST}=RH;
let cache={};
F.paretoPor=F.paretoPor||'tipo';   /* Pareto agrupado por: tipo | item | setor */

/* cartões do painel que a pessoa minimizou (lembrado neste navegador) */
const MINKEY='rh.painel.min';
const minSet=()=>{if(RH.st.minCards)return RH.st.minCards;let a=[];try{a=JSON.parse(localStorage.getItem(MINKEY)||'[]')}catch(e){}return RH.st.minCards=new Set(Array.isArray(a)?a:[])};
const saveMin=()=>{try{localStorage.setItem(MINKEY,JSON.stringify([...minSet()]))}catch(e){}};
/* ---- Painel único da instituição ----
   Gestores e administradores montam o painel (quais indicadores e gráficos, em que ordem e para qual local);
   todos os usuários com acesso ao Painel veem exatamente o mesmo. A configuração fica no banco compartilhado
   (documento config/painel), não no aparelho. Sem configuração salva, vale o painel padrão (PADRAO). */
const CAT={
  kConf:['kpi','Conformidade geral'],kRondas:['kpi','Rondas realizadas'],kNC:['kpi','NCs não resolvidas'],kTmr:['kpi','Tempo médio de resolução'],kCob:['kpi','Cobertura de salas'],kAtraso:['kpi','Rondas em atraso'],
  linha:['card','Conformidade por dia'],ncdia:['card','Não conformidades por dia'],prod:['card','Rondas por dia (produtividade)'],temp:['card','Temperatura (controle ambiental)'],
  setor:['card','Não conformidades por setor'],sev:['card','NCs por severidade'],situacao:['card','Situação das NCs'],pareto:['card','Pareto das NCs'],repet:['card','Problemas que se repetem'],equip:['card','Equipamentos com mais NCs'],
  atraso:['card','Rondas em atraso'],calor:['card','Mapa de calor: setor × horário'],tempoRonda:['card','Tempo médio por ronda'],tempoLocal:['card','Tempo médio por local'],sala:['card','Salas abaixo da meta'],recentes:['card','Não conformidades recentes']};
const PADRAO=()=>({kpis:['kConf','kRondas','kNC','kTmr','kCob','kAtraso'].map(t=>({id:t,t,loc:''})),
  cards:['linha','setor','sev','situacao','pareto','sala','calor','repet','equip','tempoRonda','tempoLocal','atraso','recentes'].map(t=>({id:t,t,loc:''}))});
const limpa=(a,tipo)=>{const ids=new Set();return (Array.isArray(a)?a:[]).filter(x=>x&&CAT[x.t]&&CAT[x.t][0]===tipo&&typeof x.id==='string'&&x.id&&!ids.has(x.id)&&ids.add(x.id)).map(x=>({id:x.id,t:x.t,loc:typeof x.loc==='string'?x.loc:'',...(typeof x.n==='string'&&x.n.trim()?{n:x.n.trim().slice(0,60)}:{})}))};
const nome=(it,d)=>it.n&&it.n.trim()?it.n.trim():d;
let CHEIO=new Set(),modoAmp=false,pnRender=null;   /* CHEIO: cartões que ocupam a linha inteira (sem deixar vazio ao lado) */
const doc=()=>{const d=S.painel;return d&&(Array.isArray(d.kpis)||Array.isArray(d.cards))?{kpis:limpa(d.kpis,'kpi'),cards:limpa(d.cards,'card')}:PADRAO()};
const pode=()=>RH.access.gerencia()&&RH.st.canWrite!==false;
const edita=()=>!!RH.st.pnEdit&&pode();
const gravar=d=>{const v={kpis:d.kpis,cards:d.cards,v:1,por:RH.st.me?.nome||'',em:Date.now()};S.painel=v;RH.renderView(true);RH.safe(()=>RH.put('config','painel',v))};
const novoId=t=>t+'-'+Math.random().toString(36).slice(2,6);
/* local de cada item: '' = segue o filtro Setor do Painel · 'h' = hospital inteiro · 's:Setor' · 'r:idDaSala' */
const locSetores=()=>[...new Set(S.salas.filter(s=>s.ativo!==false).map(s=>s.setor).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
const locNomeP=v=>{if(v==='h')return 'Hospital inteiro';if(v.startsWith('s:')){const s=v.slice(2);return locSetores().includes(s)?'Setor · '+s:null}
  if(v.startsWith('r:')){const x=S.salas.find(z=>z.id===v.slice(2)&&z.ativo!==false);return x?'Sala · '+x.nome:null}return null};
const locOptsP=sel=>{const o=(v,t)=>`<option value="${esc(v)}" ${v===sel?'selected':''}>${esc(t)}</option>`,sl=S.salas.filter(s=>s.ativo!==false).sort((a,b)=>(a.nome||'').localeCompare(b.nome||'')),st=locSetores();
  return o('','Seguir o filtro do Painel')+o('h','Hospital inteiro')+(sel&&sel!=='h'&&locNomeP(sel)==null?o(sel,'Local não encontrado'):'')+(st.length?`<optgroup label="Setores">${st.map(s=>o('s:'+s,s)).join('')}</optgroup>`:'')+(sl.length?`<optgroup label="Salas">${sl.map(s=>o('r:'+s.id,s.nome+(s.setor?' · '+s.setor:''))).join('')}</optgroup>`:'')};
const tagLoc=it=>it.loc?`<em class="pn-tag">${esc(locNomeP(it.loc)||'local não encontrado')}</em>`:'';
/* barra de edição de um item: local, mover e excluir */
const pnBar=it=>{const nome=CAT[it.t][1],L=doc()[CAT[it.t][0]==='kpi'?'kpis':'cards'],i=L.findIndex(x=>x.id===it.id);
  return `<div class="pn-bar" role="group" aria-label="Personalizar: ${esc(nome)}"><label class="field"><span>Nome</span><input type="text" data-pn="nome" data-id="${esc(it.id)}" maxlength="60" value="${esc(it.n||'')}" placeholder="${esc(nome)}"></label><label class="field"><span>Local</span><select data-pn="loc" data-id="${esc(it.id)}">${locOptsP(it.loc)}</select></label>
  <div class="pn-btns"><button type="button" class="btn sm" data-act="pnMove" data-id="${esc(it.id)}" data-d="-1" ${i<=0?'disabled':''} aria-label="Mover ${esc(nome)} para trás" title="Mover para trás">↑</button><button type="button" class="btn sm" data-act="pnMove" data-id="${esc(it.id)}" data-d="1" ${i>=L.length-1?'disabled':''} aria-label="Mover ${esc(nome)} para frente" title="Mover para frente">↓</button><button type="button" class="btn sm ghost danger" data-act="pnExcluir" data-id="${esc(it.id)}" aria-label="Excluir ${esc(nome)} do painel">Excluir</button></div></div>`};

/* cartão com botão de minimizar: it = item do painel, t = título, sub = legenda (unidade/período) */
const card=(it,t0,sub,body,cls='')=>{const k=it.id,t=nome(it,t0),mn=!modoAmp&&minSet().has(k),tg=tagLoc(it),sb=[sub,tg].filter(Boolean).join(' · ');
  if(modoAmp)return `<div class="card pn-big"><h3><span class="ct">${sub?`<small>${sb}</small>`:''}</span></h3><div class="card-b">${body}</div></div>`;
  if(CHEIO.has(k)&&!/span2/.test(cls))cls+=' span2';
  return `<div class="card ${cls} ${mn?'min':''}" data-card="${esc(k)}" data-pn="${esc(k)}"><h3><span class="ct">${esc(t)}${sb?` <small>${sb}</small>`:''}</span><span class="pn-hb"><button type="button" class="ic-btn" data-act="pnAmpliar" data-id="${esc(k)}" aria-label="Ampliar: ${esc(t)}" title="Ampliar">${ic('expand',14)}</button><button type="button" class="ic-btn min-btn" data-act="togCard" data-k="${esc(k)}" aria-expanded="${!mn}" aria-label="${mn?'Expandir':'Minimizar'}: ${esc(t)}" title="${mn?'Expandir':'Minimizar'}">${ic(mn?'dn':'up',14)}</button></span></h3>${edita()?pnBar(it):''}<div class="card-b" ${mn?'hidden':''}>${body}</div></div>`};
const tile=(it,l,v,sub,cls='',extra='')=>`<div class="kpi" data-pn="${esc(it.id)}"><label>${esc(nome(it,l))}${tagLoc(it)}</label><strong class="${cls}">${v}</strong><small>${sub}</small>${extra}${edita()?pnBar(it):''}</div>`;

/* série diária em SVG (linha ou colunas), usada nos gráficos de NCs, rondas e temperatura */
function serie(pts,o){
  const nums=pts.map(p=>p.v).filter(v=>v!=null);if(!nums.length)return empty(o.vazio||'Sem dados no período');
  const W=o.W||360,H=o.H||150,L=36,R=8,T=10,B=22,n=pts.length,mx0=Math.max(...nums),mn0=Math.min(...nums);
  let lo,hi;
  if(o.bar){lo=0;hi=Math.max(1,Math.ceil(mx0*1.1))}
  else{const b=o.band||[];lo=Math.floor(Math.min(mn0,...b)-1);hi=Math.ceil(Math.max(mx0,...b)+1)}
  const x=i=>L+(n<2?(W-L-R)/2:i*(W-L-R)/(n-1)),y=v=>T+(1-(v-lo)/(hi-lo||1))*(H-T-B),fm=o.fmt||(v=>String(v));
  const tk=[lo,(lo+hi)/2,hi].map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${L-5}" y="${y(v)+4}" text-anchor="end" fill="var(--muted)" font-size="10">${fm(Math.round(v*10)/10)}</text>`).join('');
  const ix=[0,Math.floor((n-1)/2),n-1].filter((v,i,a)=>a.indexOf(v)===i),xl=ix.map(i=>`<text x="${x(i)}" y="${H-6}" text-anchor="${i===0?'start':i===n-1?'end':'middle'}" fill="var(--muted)" font-size="10">${fdm(pts[i].t)}</text>`).join('');
  const ref=o.band?`<rect x="${L}" y="${y(o.band[1])}" width="${W-L-R}" height="${Math.max(1,y(o.band[0])-y(o.band[1]))}" fill="var(--good)" opacity=".14"/>`:'';
  let corpo='';
  if(o.bar){const bw=Math.max(1.5,(W-L-R)/n*.7);corpo=pts.map((p,i)=>p.v?`<rect x="${(x(i)-bw/2).toFixed(1)}" y="${y(p.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(lo)-y(p.v)).toFixed(1)}" rx="1.5" fill="${o.cor||'var(--c1)'}"/>`:'').join('')}
  else{let d='',pen=false;pts.forEach((p,i)=>{if(p.v==null){pen=false;return}d+=(pen?'L':'M')+x(i).toFixed(1)+' '+y(p.v).toFixed(1);pen=true});
    const val=pts.map((p,i)=>p.v!=null?i:-1).filter(i=>i>=0);let lac='';for(let k=1;k<val.length;k++)if(val[k]-val[k-1]>1)lac+=`M${x(val[k-1]).toFixed(1)} ${y(pts[val[k-1]].v).toFixed(1)}L${x(val[k]).toFixed(1)} ${y(pts[val[k]].v).toFixed(1)}`;
    const ult=pts.map((p,i)=>p.v!=null?i:-1).filter(i=>i>=0).pop();
    corpo=(lac?`<path d="${lac}" fill="none" stroke="var(--c1)" stroke-width="1.5" stroke-dasharray="4 4" opacity=".55" class="pn-gap"/>`:'')+`<path d="${d}" fill="none" stroke="var(--c1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`+pts.map((p,i)=>p.v==null?'':`<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${i===ult?4:n>31?0:2.5}" fill="${o.alerta&&o.alerta(p)?'var(--s3)':'var(--c1)'}" stroke="var(--surface)" stroke-width="1.5"/>`).join('')}
  const alvo=pts.map((p,i)=>`<rect x="${(x(i)-(W-L-R)/n/2).toFixed(1)}" y="${T}" width="${((W-L-R)/n).toFixed(1)}" height="${H-T-B}" fill="transparent" data-tip="${esc(fdm(p.t)+': '+(p.v==null?'sem dados':(o.tip?o.tip(p):fm(Math.round(p.v*10)/10))))}"/>`).join('');
  return `<svg class="pn-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria||'')}">${tk}${ref}${xl}${corpo}${alvo}</svg>`}

function hbars(rows,o={}){
  rows=rows.filter(r=>r.v>0||o.keepZero);if(!rows.length)return empty('Sem dados no período');
  const m=Math.max(...rows.map(r=>r.v),1);
  return `<div class="hb">${rows.map(r=>`<div class="hb-r" ${o.w?`style="grid-template-columns:minmax(80px,38%) 1fr ${o.w}px" `:''}data-tip="${esc(r.tip||r.l+': '+(r.t??r.v))}"${r.tiph?` data-tiph="${esc(r.tiph)}"`:''}><span class="hb-l" title="${esc(r.l)}">${esc(r.l)}${r.sub?`<small class="hb-sub">${esc(r.sub)}</small>`:''}</span><span class="hb-t"><i style="width:${r.v?Math.max(r.v/m*100,2):0}%;background:${r.c||'var(--c1)'}"></i></span><span class="hb-v">${r.t??r.v}</span></div>`).join('')}</div>`}

/* ---- indicadores novos: Pareto, mapa de calor e tempos ---- */
const fmtMin=ms=>{const m=Math.round(ms/6e4);return m<1?'< 1 min':m<60?m+' min':Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+' min'};
const MAX_DUR=8*36e5,MAX_LOC=2*36e5;   /* ignora tempos fora do normal (ronda deixada aberta, aparelho parado) */
/* Pareto: barras em ordem decrescente + percentual acumulado; azul = os itens que somam até 80% */
function paretoHtml(rows){
  const tot=rows.reduce((a,r)=>a+r.v,0);if(!tot)return empty('Nenhuma NC no período');
  const top=rows.slice(0,8),resto=rows.slice(8),ro=resto.reduce((a,r)=>a+r.v,0);
  const lista=ro?[...top,{l:`Outros (${resto.length})`,v:ro}]:top,m=lista[0].v;let ac=0;
  return `<div class="pareto">${lista.map(r=>{const antes=ac/tot*100;ac+=r.v;const a=ac/tot*100,vit=antes<80&&!r.l.startsWith('Outros (');
    return `<div class="pt-r${vit?' vit':''}" data-tip="${esc(r.l)}: ${r.v} NC (${Math.round(r.v/tot*100)}% do total · ${Math.round(a)}% acumulado)"><span class="pt-l" title="${esc(r.l)}">${esc(r.l)}</span><span class="pt-t"><i style="width:${Math.max(r.v/m*100,2)}%"></i></span><span class="pt-n">${r.v}</span><span class="pt-a">${Math.round(a)}%</span></div>`}).join('')}
  <div class="pt-leg"><span><i></i>Até 80% das NCs</span><span><i class="o"></i>Demais</span><small>Coluna da direita: % acumulado</small></div></div>`}
/* mapa de calor: % de itens não conformes por setor e faixa de 3 horas (hora do registro da ronda) */
function heatHtml(rs){
  const g={};rs.forEach(r=>{const s=r.setor||'Sem setor',b=Math.floor(new Date(r.ts).getHours()/3);const x=(g[s]??=Array.from({length:8},()=>({c:0,n:0,r:0})))[b];x.c+=r.c||0;x.n+=r.nc||0;x.r++});
  const setores=Object.keys(g).filter(s=>g[s].some(x=>x.c+x.n>0)).sort((a,b)=>g[b].reduce((t,x)=>t+x.n,0)-g[a].reduce((t,x)=>t+x.n,0)||a.localeCompare(b)).slice(0,12);
  if(!setores.length)return empty('Sem rondas no período');
  const pcts=setores.flatMap(s=>g[s].map(x=>x.c+x.n?x.n/(x.c+x.n)*100:null)).filter(v=>v!=null),mx=Math.max(...pcts,1);
  const h2=b=>String(b*3).padStart(2,'0')+'h';
  const cab=`<div class="hm-row" role="row"><span class="hm-h" role="columnheader">Setor</span>${Array.from({length:8},(_,b)=>`<span class="hm-h" role="columnheader">${h2(b)}</span>`).join('')}</div>`;
  const lin=setores.map(s=>`<div class="hm-row" role="row"><span class="hm-s" role="rowheader" title="${esc(s)}">${esc(s)}</span>${g[s].map((x,b)=>{const t=x.c+x.n;
    if(!t)return `<span class="hm-c vz" role="cell" aria-label="${esc(s)}, ${h2(b)}: sem dados">·</span>`;
    const p=x.n/t*100,a=p?(.15+.75*p/mx).toFixed(2):0;
    return `<span class="hm-c" role="cell" style="--a:${a}" data-tip="${esc(s)} · ${h2(b)} às ${String(b*3+3).padStart(2,'0')}h: ${x.n} NC em ${t} itens (${p.toLocaleString('pt-BR',{maximumFractionDigits:1})}%) · ${x.r} registro${x.r===1?'':'s'}"><span>${Math.round(p)}%</span></span>`}).join('')}</div>`).join('');
  return `<div class="hm-wrap"><div class="hm" role="table" aria-label="Percentual de itens não conformes por setor e horário">${cab}${lin}</div></div>
  <div class="hm-leg"><span>0%</span><i></i><span>${mx.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</span><small>itens não conformes · horário em que a ronda foi registrada</small></div>`}
/* tempo médio por ronda (execução inteira) e por local (do 1º ao último item respondido) */
function tempoRondas(rs){
  /* uma execução = todos os locais salvos juntos. Início = abertura da ronda; conclusão = envio (ts). */
  const ex=new Map();
  rs.forEach(r=>{if(!(r.ini&&r.dur>0&&r.dur<=MAX_DUR))return;const k=r.execId||r.id;
    const e=ex.get(k)||{n:r.modeloNome||'Ronda',d:r.dur,ini:r.ini,fim:r.ts,pausa:r.pausa||0,loc:0,maior:null};
    if(r.tloc>0){e.loc+=r.tloc;if(!e.maior||r.tloc>e.maior.t)e.maior={t:r.tloc,l:r.salaId?r.salaNome:'Equipamentos'+(r.setor?' · '+r.setor:'')}}
    ex.set(k,e)});
  const hh=t=>new Date(t).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const mesmoDia=(a,b)=>fd(a)===fd(b);
  /* "15/11 21:11 → 16/11 04:14" (a data de conclusão só aparece se for outro dia) */
  const faixa=e=>`${fdm(e.ini)} ${hh(e.ini)} → ${mesmoDia(e.ini,e.fim)?'':fdm(e.fim)+' '}${hh(e.fim)}`;
  const g={};ex.forEach(e=>{(g[e.n]??={e:[]}).e.push(e)});
  return Object.entries(g).map(([l,{e:es}])=>{
    es.sort((a,b)=>b.fim-a.fim);const k=es.length,u=es[0];
    const m=f=>es.reduce((s,e)=>s+f(e),0)/k,v=m(e=>e.d),loc=m(e=>e.loc),pausa=m(e=>e.pausa),entre=Math.max(0,v-loc-pausa);
    const maior=es.map(e=>e.maior).filter(Boolean).sort((a,b)=>b.t-a.t)[0];
    const susp=e=>e.d>36e5&&e.loc<e.d*.1;   /* mais de 1 h com menos de 10% respondendo itens: ronda deixada aberta */
    const linhas=es.slice(0,4).map(e=>`<div class="tp-r${susp(e)?' tp-w':''}"><span>${esc(faixa(e))}</span><b>${fmtMin(e.d)}</b><em>itens ${fmtMin(e.loc)}</em></div>`).join('');
    const aviso=es.some(susp)?`<div class="tp-a">⚠ Há execução longa com pouco tempo respondendo itens: a ronda provavelmente ficou aberta entre um local e outro e inflou a média.</div>`:'';
    const tiph=`<div class="tp-t">${esc(l)}</div><div class="tp-s">${k} execuç${k===1?'ão':'ões'} no período · média ${fmtMin(v)}</div>
      <div class="tp-h">Execuções (mais recente primeiro)</div>${linhas}${k>4?`<div class="tp-s">+ ${k-4} anterior${k-4===1?'':'es'}</div>`:''}
      <div class="tp-h">Composição da média</div>
      <div class="tp-k"><span>Respondendo itens</span><b>${fmtMin(loc)}</b></div>
      <div class="tp-k"><span>Deslocamento e espera</span><b>${fmtMin(entre)}</b></div>${pausa?`<div class="tp-k"><span>Pausada (app fechado)</span><b>${fmtMin(pausa)}</b></div>`:''}
      ${maior?`<div class="tp-k"><span>Local mais demorado</span><b>${esc(maior.l)} · ${fmtMin(maior.t)}</b></div>`:''}${aviso}`;
    return {l,v,t:fmtMin(v),sub:`Última execução: ${faixa(u)}${k>1?` · ${k} execuções`:''}`,tip:`${l}: média ${fmtMin(v)} em ${k} execuç${k===1?'ão':'ões'}`,tiph}}).sort((a,b)=>b.v-a.v).slice(0,8)}
function tempoLocais(rs){
  const g={};rs.forEach(r=>{if(r.tloc>0&&r.tloc<=MAX_LOC){const l=r.salaId?r.salaNome:'Equipamentos · '+(r.setor||'Sem setor');(g[l]??={s:0,k:0});g[l].s+=r.tloc;g[l].k++}});
  return Object.entries(g).map(([l,x])=>({l,v:x.s/x.k,t:fmtMin(x.s/x.k),tip:`${l}: média ${fmtMin(x.s/x.k)} em ${x.k} registro${x.k===1?'':'s'}`})).sort((a,b)=>b.v-a.v).slice(0,8)}

RH.pages.painel=()=>{
  const now=Date.now(),days=F.periodo,start=sod(now-(days-1)*864e5),ini0=start-days*864e5,meta=+S.cfg.meta||95;
  const setores=[...new Set(S.salas.map(s=>s.setor).filter(Boolean))].sort();
  const okSet=x=>!F.setor||x.setor===F.setor;
  const lastM={};S.rondas.forEach(r=>{if(r.modeloId&&(!lastM[r.modeloId]||r.ts>lastM[r.modeloId]))lastM[r.modeloId]=r.ts});
  const delta=(a,b,un,sobe)=>{if(a==null||b==null)return '';const d=a-b;if(Math.abs(d)<0.05)return '<span class="dl eq">Igual ao período anterior</span>';const bom=sobe?d>0:d<0;return `<span class="dl ${bom?'up':'dn'}">${d>0?'▲':'▼'} ${Math.abs(d).toLocaleString('pt-BR',{maximumFractionDigits:1})}${un} vs. período anterior</span>`};
  /* minigráfico: linha simples dos valores diários (null = dia sem dados, fica como lacuna) */
  const spark=(vals,cor)=>{const pts=vals.map((v,i)=>v==null?null:[i,v]).filter(Boolean);if(pts.length<2)return '';
    const W=120,H=28,mx=Math.max(...pts.map(p=>p[1])),mn=Math.min(...pts.map(p=>p[1])),sp=mx-mn||1,x=i=>2+i*(W-4)/Math.max(1,vals.length-1),y=v=>H-3-(v-mn)/sp*(H-6);
    let d='',prev=-9;pts.forEach(([i,v])=>{d+=(i-prev===1?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1);prev=i});
    const l=pts[pts.length-1];return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="${cor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><circle cx="${x(l[0]).toFixed(1)}" cy="${y(l[1]).toFixed(1)}" r="2.2" fill="${cor}"/></svg>`};
  const cnt=(arr,f)=>{const m={};arr.forEach(x=>{const k=f(x);if(k)m[k]=(m[k]||0)+1});return Object.entries(m).map(([l,v])=>({l,v})).sort((a,b)=>b.v-a.v)};
  const idx=ts=>Math.min(days-1,Math.max(0,Math.floor((sod(ts)-start)/864e5))),dias=()=>Array.from({length:days},(_,i)=>({t:start+i*864e5,c:0,n:0,r:0,k:new Set(),nc:0,ts:0,tn:0,tf:0}));

  /* dados de cada item: o local do item (se houver) substitui o filtro Setor do Painel */
  const okDe=loc=>!loc?okSet:loc==='h'?(()=>true):loc.startsWith('s:')?(x=>x.setor===loc.slice(2)):(x=>x.salaId===loc.slice(2));
  const salaOkDe=loc=>!loc?(s=>!F.setor||s.setor===F.setor):loc==='h'?(()=>true):loc.startsWith('s:')?(s=>s.setor===loc.slice(2)):(s=>s.id===loc.slice(2));
  const modOkDe=loc=>!loc?(m=>!F.setor||RH.salasDaRonda(m).some(s=>s.setor===F.setor)||RH.equipsDaRonda(m).some(e=>RH.setorEq(e)===F.setor)):loc==='h'?(()=>true)
    :loc.startsWith('s:')?(m=>RH.salasDaRonda(m).some(s=>s.setor===loc.slice(2))||RH.equipsDaRonda(m).some(e=>RH.setorEq(e)===loc.slice(2))):(m=>RH.salasDaRonda(m).some(s=>s.id===loc.slice(2)));
  const ctx=loc=>{
    const ok=okDe(loc),rs=S.rondas.filter(r=>r.ts>=start&&ok(r)),ns=S.ncs.filter(n=>n.ts>=start&&ok(n)),salas=S.salas.filter(s=>s.ativo!==false&&salaOkDe(loc)(s));
    let C=0,N=0,I=0;rs.forEach(r=>{C+=r.c;N+=r.nc;I+=(r.ina||0)+(r.na||0)});const pct=C+N?C/(C+N)*100:null;
    const rs0=S.rondas.filter(r=>r.ts>=ini0&&r.ts<start&&ok(r));let C0=0,N0=0;rs0.forEach(r=>{C0+=r.c;N0+=r.nc});
    const abertas=S.ncs.filter(n=>n.status!=='resolvida'&&ok(n)),rz=ns.filter(n=>n.status==='resolvida'&&n.resolvidoEm);
    const insp=new Set(rs.map(r=>r.salaId));
    const ser=[];for(let i=0;i<days;i++)ser.push({t:start+i*864e5,c:0,n:0,r:0});
    rs.forEach(r=>{const i=Math.min(days-1,Math.floor((sod(r.ts)-start)/864e5));if(ser[i]){ser[i].c+=r.c;ser[i].n+=r.nc;ser[i].r++}});
    const nd=ser.map(()=>0);ns.forEach(n=>{nd[idx(n.ts)]++});
    const stC={aberta:0,tratamento:0,resolvida:0};ns.forEach(n=>stC[n.status]=(stC[n.status]||0)+1);
    const porSala=salas.map(s=>{let c=0,n=0;rs.filter(r=>r.salaId===s.id).forEach(r=>{c+=r.c;n+=r.nc});return {s,p:c+n?c/(c+n)*100:null}}).sort((a,b)=>(a.p??101)-(b.p??101));
    return {rs,ns,salas,ser,nd,C,N,I,pct,pct0:C0+N0?C0/(C0+N0)*100:null,nExec:new Set(rs.map(r=>r.execId||r.id)).size,nExec0:new Set(rs0.map(r=>r.execId||r.id)).size,
      abertas,graves:abertas.filter(n=>n.sev>=3),rz,tmr:rz.length?rz.reduce((a,n)=>a+(n.resolvidoEm-n.ts),0)/rz.length/36e5:null,nInsp:salas.filter(s=>insp.has(s.id)).length,
      cob:salas.length?salas.filter(s=>insp.has(s.id)).length/salas.length*100:null,
      stC,stT:ns.length||1,porSala,abaixo:porSala.filter(y=>y.p!=null&&y.p<meta),   /* só salas abaixo da meta de conformidade do hospital (Cadastros → Hospital) */
      porSetor:cnt(ns,n=>n.setor),porEq:cnt(ns.filter(n=>n.eqNome),n=>n.eqNome+(n.salaNome?' · '+n.salaNome:'')).slice(0,6),
      tRonda:tempoRondas(rs),tLocal:tempoLocais(rs),sevRows:[4,3,2,1].map(s=>({l:SEV[s],v:ns.filter(n=>n.sev===s).length,c:`var(--s${s})`})),
      rec:S.ncs.filter(ok).slice(0,6),atraso:S.modelos.filter(m=>m.ativo!==false&&modOkDe(loc)(m)).filter(m=>RH.agenda.atrasada(m,lastM[m.id]??null,now))}};
  const cx={},X=loc=>cx[loc]??=ctx(loc);
  const stCol={aberta:'var(--s3)',tratamento:'var(--s1)',resolvida:'var(--good)'},semTempo=empty('Sem dados de tempo no período','O tempo é registrado nas rondas feitas a partir da versão 1.0.12.');
  const PARETO={tipo:['Tipo de NC',n=>n.tipoNome],item:['Item verificado',n=>n.itemTexto],setor:['Setor',n=>n.setor]},pp=PARETO[F.paretoPor]?F.paretoPor:'tipo';
  const BRAND='var(--brand,#0b6bcb)';

  /* indicadores (linha de cima) */
  const TILE={
    kConf:(it,x)=>tile(it,'Conformidade geral',pc(x.pct),x.pct==null?'Sem rondas no período':x.pct>=meta?`Meta de ${meta}% atingida`:`Abaixo da meta de ${meta}%`,x.pct==null?'':x.pct>=meta?'good':'badc',delta(x.pct,x.pct0,' p.p.',true)+spark(x.ser.map(d=>d.c+d.n?d.c/(d.c+d.n)*100:null),BRAND)),
    kRondas:(it,x)=>tile(it,'Rondas realizadas',x.nExec.toLocaleString('pt-BR'),`${(x.C+x.N).toLocaleString('pt-BR')} itens avaliados${x.I?` · ${x.I.toLocaleString('pt-BR')} inacessíve${x.I===1?'l':'is'}`:''}`,'',delta(x.nExec0?x.nExec:null,x.nExec0||null,'',true)+spark(x.ser.map(d=>d.r),BRAND)),
    kNC:(it,x)=>tile(it,'NCs não resolvidas',x.abertas.length,`${x.graves.length} de severidade alta ou crítica`,x.graves.length?'badc':'',spark(x.nd,'var(--s3,#d97706)')),
    kTmr:(it,x)=>tile(it,'Tempo médio de resolução',dur(x.tmr),`${x.rz.length} NC${x.rz.length===1?'':'s'} resolvida${x.rz.length===1?'':'s'}`),
    kCob:(it,x)=>tile(it,'Cobertura de salas',pc(x.cob),`${x.nInsp} de ${x.salas.length} salas inspecionadas`),
    kAtraso:(it,x)=>tile(it,'Rondas em atraso',x.atraso.length,x.atraso.length?'Ver "Rondas em atraso" abaixo':'Todas dentro da agenda',x.atraso.length?'badc':'good')};

  /* gráficos e listas */
  const R={
    linha:(it,x)=>{cache[it.id]={ser:x.ser,meta};return card(it,'Conformidade por dia',`% de itens conformes · meta ${meta}%`,`<div class="ch-line" data-id="${esc(it.id)}"${modoAmp?' data-h="400"':''}></div>`,'span2')},
    ncdia:(it,x)=>{const s=dias();x.ns.forEach(n=>s[idx(n.ts)].nc++);return card(it,'Não conformidades por dia',`${x.ns.length} no período`,x.ns.length?serie(s.map(a=>({t:a.t,v:a.nc})),{bar:1,cor:'var(--s3)',tip:p=>p.v+' NC'+(p.v===1?'':'s'),aria:'Não conformidades por dia'}):empty('Nenhuma NC no período'))},
    prod:(it,x)=>{const s=dias();x.rs.forEach(r=>s[idx(r.ts)].k.add(r.execId||r.id));const tot=x.nExec;return card(it,'Rondas por dia (produtividade)',tot?`${tot} no período · média de ${(tot/days).toLocaleString('pt-BR',{maximumFractionDigits:1})} por dia`:'',tot?serie(s.map(a=>({t:a.t,v:a.k.size})),{bar:1,tip:p=>p.v+' ronda'+(p.v===1?'':'s'),aria:'Rondas por dia'}):empty('Sem rondas no período'))},
    temp:(it,x)=>{const s=dias();let tot=0,fora=0,faixa=null,mix=false;
      x.rs.forEach(r=>(r.itens||[]).forEach(i=>{if(!RH.ehTemp(i.t)||i.tv==null||isNaN(+i.tv))return;const a=s[idx(r.ts)];a.ts+=+i.tv;a.tn++;tot++;if(i.r==='NC'){fora++;a.tf++}
        const m=/(-?[\d.,]+)\s*°C\s*a\s*(-?[\d.,]+)\s*°C/.exec(i.ideal||'');if(m){const f=[RH.numTemp(m[1]),RH.numTemp(m[2])];if(f[0]!=null&&f[1]!=null){if(!faixa)faixa=f;else if(faixa[0]!==f[0]||faixa[1]!==f[1])mix=true}}}));
      return card(it,'Temperatura (controle ambiental)',tot?`${tot} leitura${tot===1?'':'s'} · <b class="${fora?'badc':''}">${fora}</b> fora da faixa${faixa&&!mix?` · ideal ${RH.fmtIdeal(faixa[0],faixa[1])}`:''}`:'',
        tot?serie(s.map(a=>({t:a.t,v:a.tn?a.ts/a.tn:null,n:a.tn,f:a.tf})),{band:faixa&&!mix?faixa:null,alerta:p=>p.f>0,fmt:v=>String(v).replace('.',','),tip:p=>`média ${(Math.round(p.v*10)/10).toLocaleString('pt-BR')} °C · ${p.n} leitura${p.n===1?'':'s'}${p.f?` · ${p.f} fora da faixa`:''}`,aria:'Temperatura média diária'}):empty('Sem leituras de temperatura no período','Aparecem quando um item de temperatura é respondido numa ronda.'))},
    setor:(it,x)=>card(it,'Não conformidades por setor',`${x.ns.length} no período`,hbars(x.porSetor)),
    sev:(it,x)=>card(it,'Não conformidades por severidade','no período',hbars(x.sevRows,{keepZero:1})),
    situacao:(it,x)=>card(it,'Situação das NCs','no período',x.ns.length?`<div class="seg-bar" role="img" aria-label="Distribuição por situação">${Object.keys(ST).map(k=>x.stC[k]?`<i style="flex:${x.stC[k]};background:${stCol[k]}" data-tip="${ST[k]}: ${x.stC[k]}"></i>`:'').join('')}</div>
   <div class="legend">${Object.keys(ST).map(k=>`<span><i style="background:${stCol[k]}"></i>${ST[k]} <b>${x.stC[k]||0}</b> <small>(${Math.round((x.stC[k]||0)/x.stT*100)}%)</small></span>`).join('')}</div>`:empty('Sem NCs no período')),
    pareto:(it,x)=>card(it,'Pareto das NCs',`no período · por ${PARETO[pp][0].toLowerCase().replace(" nc"," NC")}`,`<label class="field pt-sel"><span>Agrupar por</span><select data-set="F:paretoPor">${Object.entries(PARETO).map(([k,v])=>`<option value="${k}" ${k===pp?'selected':''}>${v[0]}</option>`).join('')}</select></label>${paretoHtml(cnt(x.ns,PARETO[pp][1]))}`),
    repet:(it,x)=>card(it,'Problemas que se repetem','no período · mesmo item e local',(()=>{const g=RH.recGrupos(x.ns).slice(0,6);return g.length?hbars(g):empty('Nenhum item com 2 ou mais NCs no período')})()),
    equip:(it,x)=>card(it,'Equipamentos com mais NCs','no período',hbars(x.porEq)),
    atraso:(it,x)=>card(it,'Rondas em atraso','última execução fora da periodicidade',x.atraso.length?`<div class="hb">${x.atraso.slice(0,6).map(m=>`<div class="hb-r" style="grid-template-columns:1fr auto"><span class="hb-l" style="color:var(--ink)">${esc(m.nome)} <small>${RH.ordemDaRonda(m).length} ${RH.ordemDaRonda(m).length===1?'local':'locais'}</small></span><span class="pill late">${lastM[m.id]?ago(lastM[m.id]):'Nunca realizada'}</span></div>`).join('')}</div>`:empty('Nenhuma ronda em atraso','Todas as rondas estão dentro da agenda de dias e horários.'),'span2'),
    calor:(it,x)=>card(it,'Mapa de calor: setor × horário','% de itens não conformes',heatHtml(x.rs),'span2'),
    tempoRonda:(it,x)=>card(it,'Tempo médio por ronda','da abertura ao envio · última execução de cada ronda',x.tRonda.length?hbars(x.tRonda,{w:78}):semTempo),
    tempoLocal:(it,x)=>card(it,'Tempo médio por local','1º ao último item respondido',x.tLocal.length?hbars(x.tLocal,{w:78}):semTempo),
    sala:(it,x)=>card(it,'Salas abaixo da meta',`meta do hospital: ${meta}% · ${x.abaixo.length} de ${x.porSala.filter(y=>y.p!=null).length} salas com rondas`,x.abaixo.length?`<div class="hb">${x.abaixo.map(y=>`<div class="hb-r" data-tip="${esc(y.s.nome)}: ${pc(y.p)} (meta do hospital: ${meta}%)"><span class="hb-l">${esc(y.s.nome)}</span><span class="hb-t"><i style="width:${y.p}%;background:var(--s3)"></i></span><span class="hb-v">${Math.round(y.p)}%</span></div>`).join('')}</div><p class="hint" style="margin:10px 0 0">Só aparecem as salas com conformidade menor que a meta de ${meta}% no período. As que atingiram a meta e as sem rondas ficam ocultas.</p>`:x.porSala.some(y=>y.p!=null)?empty('Nenhuma sala abaixo da meta do hospital','Todas as salas com rondas no período atingiram a meta de '+meta+'%.'):empty(x.porSala.length?'Sem rondas no período':'Nenhuma sala cadastrada',x.porSala.length?'':'Cadastre salas em Cadastros.'),'span2'),
    recentes:(it,x)=>card(it,'Não conformidades recentes','mais recentes primeiro',x.rec.length?`<div class="tw" style="border:0"><table><thead><tr><th>Data</th><th>Local</th><th>Descrição</th><th>Severidade</th><th>Situação</th></tr></thead><tbody>${x.rec.map(n=>`<tr data-act="ncOpen" data-id="${n.id}"><td class="num">${fdt(n.ts)}</td><td>${esc(n.eqNome||n.salaNome)}<small>${esc(n.eqNome?n.salaNome:n.setor||'')}</small></td><td>${esc((n.desc||n.itemTexto||'').slice(0,80))}</td><td>${sevPill(n.sev)}</td><td>${stPill(n.status)}</td></tr>`).join('')}</tbody></table></div>`:empty('Nenhuma não conformidade registrada'),'span2')};

  cache={};
  const ed=edita(),D=doc();
  CHEIO=new Set();{let pos=0,ant=null;const S2=new Set(['linha','calor','sala','atraso','recentes']);D.cards.forEach(it=>{if(S2.has(it.t)){if(pos===1&&ant)CHEIO.add(ant);pos=0;ant=null}else{if(pos===1){pos=0;ant=null}else{pos=1;ant=it.id}}});if(pos===1&&ant)CHEIO.add(ant)}
  pnRender=it=>(CAT[it.t][0]==='kpi'?TILE:R)[it.t](it,X(it.loc));
  const kp=D.kpis.map(it=>TILE[it.t](it,X(it.loc))).join(''),cs=D.cards.map(it=>R[it.t](it,X(it.loc))).join('');
  const opt=k=>Object.entries(CAT).filter(([,v])=>v[0]===k).map(([t,v])=>`<option value="${t}">${esc(v[1])}</option>`).join('');
  const nativo=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
  setTimeout(()=>RH.armAviso&&RH.armAviso(),0);
  return `<div id="arm-aviso"></div>${RH.avisoLimite(['rondas','ncs'])}<div class="top"><div><h1>Painel de Controle</h1><p class="pn-print">${esc(S.cfg.hospital||'')}${S.cfg.hospital?' · ':''}${F.setor?'Setor '+esc(F.setor):'Todos os setores'} · Últimos ${days} dias · atualizado em ${fdt(now)}</p></div>
  <div class="filters"><label class="field"><span>Período</span><select data-set="F:periodo" data-num="1">${[7,30,90].map(d=>`<option value="${d}" ${d===days?'selected':''}>Últimos ${d} dias</option>`).join('')}</select></label>
  <label class="field"><span>Setor</span><select data-set="F:setor"><option value="">Todos os setores</option>${setores.map(s=>`<option ${s===F.setor?'selected':''}>${esc(s)}</option>`).join('')}</select></label></div>
  <div class="tools">${pode()?`<button type="button" class="btn sm${ed?' pri':''}" data-act="pnEdit" aria-pressed="${ed}">${ic(ed?'check':'gear',14)} ${ed?'Concluir':'Personalizar painel'}</button>${ed?'<button type="button" class="btn sm" data-act="pnReset">Restaurar padrão</button>':''}`:''}<button type="button" class="btn sm" data-act="togTodos" data-v="min">Minimizar tudo</button><button type="button" class="btn sm" data-act="togTodos" data-v="exp">Expandir tudo</button>${nativo?'':'<button type="button" class="btn sm" data-act="pnImprimir">Imprimir / PDF</button>'}</div></div>
  ${ed?`<div class="banner pn-info" role="note"><b>Personalizar painel: vale para todos.</b> As alterações aparecem para todos os gestores e administradores e ficam salvas no banco compartilhado. Em cada indicador ou gráfico escolha o local, mova (↑ ↓ ou segurando o clique e arrastando) ou exclua; use "Adicionar ao painel" para incluir de novo ou acrescentar outro.</div>
  <div class="pn-add"><label class="field"><span>Adicionar ao painel</span><select id="pn-add"><optgroup label="Indicadores">${opt('kpi')}</optgroup><optgroup label="Gráficos e listas">${opt('card')}</optgroup></select></label><button type="button" class="btn sm pri" data-act="pnAdd">Adicionar</button></div>`:''}
  <section class="kpis${ed?' pn-ed':''}" aria-label="Indicadores">${kp}</section>
  <section class="grid2" aria-label="Gráficos">${cs}</section>
  ${!kp&&!cs?`<div class="empty"><b>Nenhum indicador ou gráfico no painel</b><span>${pode()?'Use "Personalizar painel" e "Adicionar ao painel".':'Peça a um gestor ou administrador para montar o painel.'}</span></div>`:''}`;
};

/* gráfico de linha da conformidade diária (SVG próprio); pode haver mais de um no painel (um por item, cada qual com o seu local) */
function drawLine(){document.querySelectorAll('.ch-line').forEach(el=>{const c=cache[el.dataset.id];if(c)drawOne(el,c)})}
function drawOne(el,c){
  const {ser,meta}=c,W=Math.max(300,el.clientWidth||640),H=+el.dataset.h||230,L=40,Rr=14,T=12,B=26;
  const pts=ser.map((d,i)=>({i,t:d.t,v:d.c+d.n?d.c/(d.c+d.n)*100:null,r:d.r,n:d.n}));
  const vals=pts.filter(p=>p.v!=null).map(p=>p.v);
  if(!vals.length){el.innerHTML=empty('Sem rondas no período','Registre uma ronda para ver a evolução da conformidade.');return}
  const lo=Math.max(0,Math.floor((Math.min(...vals,meta)-3)/5)*5),hi=100,gs=hi-lo>40?20:hi-lo>20?10:5;
  const x=i=>L+(pts.length<2?0:i/(pts.length-1))*(W-L-Rr), y=v=>T+(1-(v-lo)/(hi-lo))*(H-T-B);
  let g='';for(let v=lo;v<=hi;v+=gs)g+=`<line x1="${L}" x2="${W-Rr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end" fill="var(--muted)" font-size="11">${v}%</text>`;
  const step=Math.ceil(pts.length/(W<520?5:8));let xt='';pts.forEach((p,i)=>{if(i%step===0||(i===pts.length-1&&i%step>=Math.ceil(step/2)))xt+=`<text x="${x(i)}" y="${H-6}" text-anchor="middle" fill="var(--muted)" font-size="11">${fdm(p.t)}</text>`});
  let d='',pen=false;pts.forEach(p=>{if(p.v==null){pen=false;return}d+=(pen?'L':'M')+x(p.i).toFixed(1)+' '+y(p.v).toFixed(1);pen=true});
  const va=pts.filter(p=>p.v!=null);let lac='';for(let k=1;k<va.length;k++)if(va[k].i-va[k-1].i>1)lac+=`M${x(va[k-1].i).toFixed(1)} ${y(va[k-1].v).toFixed(1)}L${x(va[k].i).toFixed(1)} ${y(va[k].v).toFixed(1)}`;
  const dots=pts.filter(p=>p.v!=null).map((p,k,a)=>`<circle cx="${x(p.i)}" cy="${y(p.v)}" r="${k===a.length-1?5:pts.length>45?0:3}" fill="var(--c1)" stroke="var(--surface)" stroke-width="2"/>`).join('');
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Conformidade diária, de ${pc(Math.min(...vals))} a ${pc(Math.max(...vals))}">${g}
  <line x1="${L}" x2="${W-Rr}" y1="${y(meta)}" y2="${y(meta)}" stroke="var(--good)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${L+6}" y="${y(meta)-6}" text-anchor="start" fill="var(--ok)" font-size="11" font-weight="600">Meta ${meta}%</text>
  ${lac?`<path class="pn-gap" d="${lac}" fill="none" stroke="var(--c1)" stroke-width="1.6" stroke-dasharray="5 5" opacity=".55"/>`:''}<path d="${d}" fill="none" stroke="var(--c1)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${dots}${xt}
  <line id="xh" y1="${T}" y2="${H-B}" stroke="var(--line2)" stroke-dasharray="3 3" visibility="hidden"/><circle id="xd" r="5" fill="var(--c1)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/><rect x="${L}" y="${T}" width="${W-L-Rr}" height="${H-T-B}" fill="transparent" id="xr"/></svg>`;
  const svg=el.firstChild,r=$('#xr',svg),xh=$('#xh',svg),xd=$('#xd',svg);
  const mv=e=>{const b=svg.getBoundingClientRect(),sx=(e.clientX-b.left)*W/b.width;
    let best=null;pts.forEach(p=>{if(p.v==null)return;if(!best||Math.abs(x(p.i)-sx)<Math.abs(x(best.i)-sx))best=p});if(!best)return;
    xh.setAttribute('x1',x(best.i));xh.setAttribute('x2',x(best.i));xh.setAttribute('visibility','visible');xd.setAttribute('cx',x(best.i));xd.setAttribute('cy',y(best.v));xd.setAttribute('visibility','visible');
    RH.showTip(`${fd(best.t)} · ${pc(best.v)} · ${best.r} ${best.r===1?'local':'locais'} · ${best.n} NC`,e.clientX,e.clientY)};
  const sai=()=>{RH.tip.hidden=true;xh.setAttribute('visibility','hidden');xd.setAttribute('visibility','hidden')};
  r.addEventListener('pointermove',mv);r.addEventListener('pointerdown',mv);r.addEventListener('pointerleave',sai);r.addEventListener('pointercancel',sai);
}
RH.after.painel=drawLine;
Object.assign(RH.ACT,{togCard:el=>{
  const k=el.dataset.k,box=el.closest('.card'),m=minSet(),fechar=!m.has(k);
  fechar?m.add(k):m.delete(k);saveMin();
  box.classList.toggle('min',fechar);box.querySelector('.card-b').hidden=fechar;
  el.setAttribute('aria-expanded',String(!fechar));el.innerHTML=ic(fechar?'dn':'up',14);
  const t=box.querySelector('.ct').firstChild.textContent.trim();el.setAttribute('aria-label',(fechar?'Expandir':'Minimizar')+': '+t);el.title=fechar?'Expandir':'Minimizar';
  if(!fechar)drawLine()},
  /* minimiza ou expande todos os cartões de uma vez */
  togTodos:el=>{const fechar=el.dataset.v==='min',m=minSet();
    document.querySelectorAll('.card[data-card]').forEach(c=>{const k=c.dataset.card;fechar?m.add(k):m.delete(k)});saveMin();RH.renderView(true)}});
/* ---- personalizar o painel (só gestor e administrador): local, mover, excluir, adicionar, restaurar ---- */
const achar=(D,id)=>{for(const k of ['kpis','cards']){const i=D[k].findIndex(x=>x.id===id);if(i>=0)return {k,i}}return null};
let exId=null,exT,rsArm=false,rsT;
Object.assign(RH.ACT,{
  pnEdit:()=>{if(!pode())return;RH.st.pnEdit=!RH.st.pnEdit;RH.renderView(true)},
  pnMove:el=>{if(!pode())return;const D=doc(),f=achar(D,el.dataset.id);if(!f)return;const L=D[f.k],j=f.i+(+el.dataset.d);if(j<0||j>=L.length)return;[L[f.i],L[j]]=[L[j],L[f.i]];gravar(D);
    document.querySelector(`[data-act=pnMove][data-id="${CSS.escape(el.dataset.id)}"][data-d="${el.dataset.d}"]:not([disabled])`)?.focus()},
  pnExcluir:el=>{if(!pode())return;const id=el.dataset.id;
    if(exId!==id){exId=id;clearTimeout(exT);el.classList.add('arm');el.textContent='Confirmar exclusão';exT=setTimeout(()=>{exId=null;if(el.isConnected){el.classList.remove('arm');el.textContent='Excluir'}},3500);return}
    exId=null;clearTimeout(exT);const D=doc(),f=achar(D,id);if(!f)return;D[f.k].splice(f.i,1);gravar(D);RH.toast('Removido do painel de todos. Para recolocar, use "Adicionar ao painel".')},
  pnAdd:()=>{const t=document.getElementById('pn-add')?.value;if(!pode()||!CAT[t])return;const D=doc();D[CAT[t][0]==='kpi'?'kpis':'cards'].push({id:novoId(t),t,loc:''});gravar(D);RH.toast('Adicionado ao painel de todos.')},
  pnReset:()=>{if(!pode())return;if(!rsArm){rsArm=true;clearTimeout(rsT);rsT=setTimeout(()=>rsArm=false,3500);RH.toast('Toque de novo para restaurar o painel padrão (vale para todos).');return}
    rsArm=false;gravar(PADRAO());RH.toast('Painel restaurado ao padrão.')},
  pnImprimir:()=>window.print(),
  pnAmpliar:el=>abrirAmp(el.dataset.id)});
/* ampliar um gráfico em janela; gestor e administrador também editam nome e local ali */
function abrirAmp(id){
  const D=doc(),f=achar(D,id);if(!f||!pnRender)return;const it=D[f.k][f.i];
  modoAmp=true;let corpo;try{corpo=pnRender(it)}finally{modoAmp=false}
  const t=nome(it,CAT[it.t][1]);
  const ed=pode()?`<div class="pn-bar" role="group" aria-label="Editar ${esc(t)}"><label class="field"><span>Nome do gráfico</span><input type="text" data-pn="nome" data-id="${esc(id)}" maxlength="60" value="${esc(it.n||'')}" placeholder="${esc(CAT[it.t][1])}"></label><label class="field"><span>Local</span><select data-pn="loc" data-id="${esc(id)}">${locOptsP(it.loc)}</select></label></div>`:'';
  RH.modal(`<div class="mh"><h3 style="font-size:16px">${esc(t)}</h3><button type="button" class="ic-btn" data-act="closeModal" aria-label="Fechar">${ic('x',16)}</button></div><div class="mb pn-amp" data-amp="${esc(id)}">${ed}${corpo}</div>`,true);
  drawLine()}
RH.ON_CHANGE.push(el=>{
  if(el.dataset.pn!=='loc'&&el.dataset.pn!=='nome')return false;
  if(!pode())return true;
  const D=doc(),f=achar(D,el.dataset.id);if(!f)return true;
  if(el.dataset.pn==='loc')D[f.k][f.i].loc=el.value;
  else{const v=el.value.trim().slice(0,60);if(v)D[f.k][f.i].n=v;else delete D[f.k][f.i].n}
  const amp=document.querySelector('#modal .pn-amp')?.dataset.amp;
  gravar(D);if(amp)abrirAmp(amp);return true});
/* arrastar: segurar o clique (mouse/caneta, 0,35 s) num indicador ou gráfico e soltar sobre outro do mesmo grupo; no toque use ↑ ↓ */
let dc=null;
const SEL='.kpis > .kpi[data-pn], .grid2 > .card[data-pn]';
/* uma atualização de dados no meio do gesto redesenha o painel: procura de novo o item arrastado */
const vivo=()=>{if(!dc.el.isConnected){const n=[...document.querySelectorAll(SEL)].find(x=>x.dataset.pn===dc.id);if(n){dc.el=n;if(dc.on)n.classList.add('pn-drag')}}return dc.el};
const fimCard=ok=>{
  if(!dc)return;const d=dc;dc=null;clearTimeout(d.t);document.body.classList.remove('pn-dragging');
  try{d.el.releasePointerCapture(d.pid)}catch(e){}
  if(!d.on)return;
  dc=d;const ev=vivo();dc=null;ev.classList.remove('pn-drag');ev.style.transform='';ev.style.zIndex='';
  document.querySelectorAll('.pn-over').forEach(x=>x.classList.remove('pn-over'));
  if(ok&&d.alvo&&d.alvo!==d.id&&pode()){const D=doc(),a=achar(D,d.id),b=achar(D,d.alvo);
    if(a&&b&&a.k===b.k){const [m]=D[a.k].splice(a.i,1);D[a.k].splice(b.i,0,m);gravar(D);RH.toast('Movido.');return}}
  RH.renderView(true)};
document.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch'||e.button!==0||RH.st.page!=='painel'||!edita())return;
  const el=e.target.closest&&e.target.closest(SEL);if(!el)return;
  if(e.target.closest('button,select,input,textarea,a,tr,[data-act],.pn-bar'))return;
  fimCard(false);
  dc={el,id:el.dataset.pn,pid:e.pointerId,x:e.clientX,y:e.clientY,on:false,alvo:null,
    t:setTimeout(()=>{if(!dc)return;dc.on=true;const v=vivo();v.classList.add('pn-drag');document.body.classList.add('pn-dragging');try{v.setPointerCapture(dc.pid)}catch(_){}},350)}});
document.addEventListener('pointermove',e=>{
  if(!dc||e.pointerId!==dc.pid)return;
  if(!dc.on){if(Math.hypot(e.clientX-dc.x,e.clientY-dc.y)>6){clearTimeout(dc.t);dc=null}return}
  const el=vivo();el.style.transform=`translate(${e.clientX-dc.x}px,${e.clientY-dc.y}px)`;el.style.zIndex=5;
  el.style.pointerEvents='none';const sob=document.elementFromPoint(e.clientX,e.clientY);el.style.pointerEvents='';
  const alvo=sob&&sob.closest&&sob.closest(SEL);
  document.querySelectorAll('.pn-over').forEach(x=>x.classList.remove('pn-over'));
  dc.alvo=alvo&&alvo!==el&&alvo.parentNode===el.parentNode?alvo.dataset.pn:null;if(dc.alvo)alvo.classList.add('pn-over')});
document.addEventListener('pointerup',e=>{if(dc&&e.pointerId===dc.pid)fimCard(true)});
document.addEventListener('pointercancel',()=>fimCard(false));
addEventListener('keydown',e=>{if(e.key==='Escape'&&dc&&dc.on){e.stopImmediatePropagation();fimCard(false)}},true);
document.addEventListener('pointerdown',ev=>{if(!ev.target.closest||!ev.target.closest('.ch-line')){RH.tip&&(RH.tip.hidden=true);document.querySelectorAll('.ch-line [id=xh],.ch-line [id=xd]').forEach(e=>e.setAttribute('visibility','hidden'))}},{passive:true});
let rz;addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{if(RH.st.page==='painel')drawLine()},150)});
})();
