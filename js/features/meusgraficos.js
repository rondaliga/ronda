/* ==========================================================================
   Painel · widget "Meus gráficos"
   A pessoa monta o próprio conjunto de gráficos: cada item tem um tipo de gráfico
   e um local (hospital inteiro, um setor ou uma sala) independentes dos demais.
   A configuração fica neste aparelho (localStorage, uma por usuário) e o período
   é o mesmo do filtro "Período" do Painel.
   Integração: painel.js chama RH.mg.html() dentro de um cartão; as ações
   (engrenagem, adicionar, remover, trocar gráfico/local) estão em RH.ACT.mg*.
   ========================================================================== */
(()=>{
const RH=window.RH;
const {esc,S,F,pc,sod,fdm,ic,empty}=RH;
const MAX=8;                                  /* itens por usuário */
const chave=()=>'rh.painel.meus.v1.'+(RH.st.me?.id||'anon');

/* ---------- configuração salva ---------- */
let cfg=null,cfgDe=null;
const carregar=()=>{
  if(cfg&&cfgDe===chave())return cfg;
  let a=[];try{a=JSON.parse(localStorage.getItem(chave())||'[]')}catch(e){}
  cfg=(Array.isArray(a)?a:[]).filter(x=>x&&TIPOS[x.tipo]).slice(0,MAX).map(x=>({id:String(x.id||uid()),tipo:x.tipo,loc:typeof x.loc==='string'?x.loc:''}));
  cfgDe=chave();return cfg};
const salvar=()=>{try{localStorage.setItem(chave(),JSON.stringify(cfg))}catch(e){}};
const uid=()=>'g'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

/* ---------- locais ---------- */
const locais=()=>{
  const setores=[...new Set(S.salas.filter(s=>s.ativo!==false).map(s=>s.setor).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const salas=S.salas.filter(s=>s.ativo!==false).sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
  return {setores,salas}};
const locNome=v=>{if(!v)return 'Hospital inteiro';const {setores,salas}=locais();
  if(v.startsWith('s:')){const s=v.slice(2);return setores.includes(s)?'Setor · '+s:null}
  if(v.startsWith('r:')){const x=salas.find(z=>z.id===v.slice(2));return x?'Sala · '+x.nome:null}return null};
const locOpts=sel=>{const {setores,salas}=locais(),o=(v,t)=>`<option value="${esc(v)}" ${v===sel?'selected':''}>${esc(t)}</option>`;
  const orfa=sel&&locNome(sel)==null?`<option value="${esc(sel)}" selected>Local não encontrado</option>`:'';
  return o('','Hospital inteiro (todos os setores)')+orfa+(setores.length?`<optgroup label="Setores">${setores.map(s=>o('s:'+s,s)).join('')}</optgroup>`:'')+(salas.length?`<optgroup label="Salas">${salas.map(s=>o('r:'+s.id,s.nome+(s.setor?' · '+s.setor:''))).join('')}</optgroup>`:'')};
const doLocal=(v,x)=>!v||(v.startsWith('s:')?x.setor===v.slice(2):x.salaId===v.slice(2));

/* ---------- desenho: séries diárias em SVG próprio (linha ou colunas) ---------- */
function serie(pts,o){
  const nums=pts.map(p=>p.v).filter(v=>v!=null);if(!nums.length)return empty(o.vazio||'Sem dados no período');
  const W=360,H=150,L=36,R=8,T=10,B=22,n=pts.length,mx0=Math.max(...nums),mn0=Math.min(...nums);
  let lo,hi;
  if(o.faixa){lo=Math.max(0,Math.floor((Math.min(mn0,o.ref??mn0)-4)/10)*10);hi=100}
  else if(o.bar){lo=0;hi=Math.max(1,Math.ceil(mx0*1.1))}
  else{const b=o.band||[];lo=Math.floor(Math.min(mn0,...b)-1);hi=Math.ceil(Math.max(mx0,...b)+1)}
  const x=i=>L+(n<2?(W-L-R)/2:i*(W-L-R)/(n-1)),y=v=>T+(1-(v-lo)/(hi-lo||1))*(H-T-B),fm=o.fmt||(v=>String(v));
  const tk=[lo,(lo+hi)/2,hi].map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${L-5}" y="${y(v)+4}" text-anchor="end" fill="var(--muted)" font-size="10">${fm(Math.round(v*10)/10)}</text>`).join('');
  const ix=[0,Math.floor((n-1)/2),n-1].filter((v,i,a)=>a.indexOf(v)===i),xl=ix.map(i=>`<text x="${x(i)}" y="${H-6}" text-anchor="${i===0?'start':i===n-1?'end':'middle'}" fill="var(--muted)" font-size="10">${fdm(pts[i].t)}</text>`).join('');
  let ref='';
  if(o.ref!=null)ref=`<line x1="${L}" x2="${W-R}" y1="${y(o.ref)}" y2="${y(o.ref)}" stroke="var(--good)" stroke-dasharray="5 4" stroke-width="1.4"/><text x="${W-R}" y="${y(o.ref)-4}" text-anchor="end" fill="var(--ok)" font-size="10" font-weight="600">${esc(o.refTxt||'')}</text>`;
  if(o.band)ref=`<rect x="${L}" y="${y(o.band[1])}" width="${W-L-R}" height="${Math.max(1,y(o.band[0])-y(o.band[1]))}" fill="var(--good)" opacity=".14"/>`;
  let corpo='';
  if(o.bar){const bw=Math.max(1.5,(W-L-R)/n*.7);corpo=pts.map((p,i)=>p.v?`<rect x="${(x(i)-bw/2).toFixed(1)}" y="${y(p.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(lo)-y(p.v)).toFixed(1)}" rx="1.5" fill="${o.cor||'var(--c1)'}"/>`:'').join('')}
  else{let d='',pen=false;pts.forEach((p,i)=>{if(p.v==null){pen=false;return}d+=(pen?'L':'M')+x(i).toFixed(1)+' '+y(p.v).toFixed(1);pen=true});
    const ult=pts.map((p,i)=>p.v!=null?i:-1).filter(i=>i>=0).pop();
    const cp=v=>o.ref!=null&&v<o.ref?'var(--s3)':'var(--c1)';   /* ponto abaixo da meta fica vermelho */
    corpo=`<path d="${d}" fill="none" stroke="var(--c1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`+pts.map((p,i)=>p.v==null?'':`<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${i===ult?4:(n>31&&!(o.ref!=null&&p.v<o.ref))?0:2.5}" fill="${cp(p.v)}" stroke="var(--surface)" stroke-width="1.5"/>`).join('')}
  const alvo=pts.map((p,i)=>`<rect x="${(x(i)-(W-L-R)/n/2).toFixed(1)}" y="${T}" width="${((W-L-R)/n).toFixed(1)}" height="${H-T-B}" fill="transparent" data-tip="${esc(fdm(p.t)+': '+(p.v==null?'sem dados':(o.tip?o.tip(p):fm(Math.round(p.v*10)/10))))}"/>`).join('');
  return `<svg class="mg-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria||'')}">${tk}${ref}${xl}${corpo}${alvo}</svg>`}

/* ---------- tipos de gráfico ---------- */
const P=()=>RH.painelUi||{};
const cnt=(arr,f)=>{const m={};arr.forEach(x=>{const k=f(x);if(k)m[k]=(m[k]||0)+1});return Object.entries(m).map(([l,v])=>({l,v})).sort((a,b)=>b.v-a.v)};
const dias=d=>{const a=[];for(let i=0;i<d.days;i++)a.push({t:d.start+i*864e5,c:0,n:0,r:0,k:new Set(),nc:0,ts:0,tn:0,tfora:0});return a};
const idx=(d,ts)=>Math.min(d.days-1,Math.max(0,Math.floor((sod(ts)-d.start)/864e5)));
const sum=(txt,t)=>`<p class="mg-sum">${txt}</p>${t}`;
const TIPOS={
  conf:{nome:'Conformidade por dia',desc:'Linha da conformidade diária, com a meta do hospital',render:d=>{
    const s=dias(d);d.rs.forEach(r=>{const a=s[idx(d,r.ts)];a.c+=r.c||0;a.n+=r.nc||0});
    let C=0,N=0;d.rs.forEach(r=>{C+=r.c||0;N+=r.nc||0});
    const pg=C+N?C/(C+N)*100:null,abx=pg!=null&&pg<d.meta;
    return sum(pg!=null?`<b class="${abx?'badc':'good'}">${pc(pg)}</b> no período · ${abx?`abaixo da meta de ${d.meta}%`:`meta de ${d.meta}% atingida`}`:'Sem rondas no período',serie(s.map(a=>({t:a.t,v:a.c+a.n?a.c/(a.c+a.n)*100:null})),{faixa:1,ref:d.meta,refTxt:'Meta '+d.meta+'%',fmt:v=>v+'%',tip:p=>pc(p.v),aria:'Conformidade diária',vazio:'Sem rondas no período'}))}},
  ncdia:{nome:'Não conformidades por dia',desc:'Colunas com as NCs registradas a cada dia',render:d=>{
    const s=dias(d);d.ns.forEach(n=>s[idx(d,n.ts)].nc++);
    return sum(`<b>${d.ns.length}</b> NC${d.ns.length===1?'':'s'} no período`,d.ns.length?serie(s.map(a=>({t:a.t,v:a.nc})),{bar:1,cor:'var(--s3)',tip:p=>p.v+' NC'+(p.v===1?'':'s'),aria:'NCs por dia'}):empty('Nenhuma NC no período'))}},
  sev:{nome:'NCs por severidade',desc:'Quantidade de NCs em cada nível de severidade',render:d=>{
    const rows=[4,3,2,1].map(s=>({l:RH.SEV[s],v:d.ns.filter(n=>n.sev===s).length,c:`var(--s${s})`}));
    return d.ns.length?P().hbars(rows,{keepZero:1}):empty('Nenhuma NC no período')}},
  tipos:{nome:'Pareto por tipo de NC',desc:'Tipos de NC mais frequentes, com % acumulado',render:d=>P().paretoHtml(cnt(d.ns,n=>n.tipoNome))},
  situacao:{nome:'Situação das NCs',desc:'Abertas, em tratamento e resolvidas',render:d=>{
    const st={aberta:0,tratamento:0,resolvida:0},cor={aberta:'var(--s3)',tratamento:'var(--s1)',resolvida:'var(--good)'};d.ns.forEach(n=>st[n.status]=(st[n.status]||0)+1);
    const T=d.ns.length;if(!T)return empty('Nenhuma NC no período');
    return `<div class="seg-bar" role="img" aria-label="Distribuição por situação">${Object.keys(RH.ST).map(k=>st[k]?`<i style="flex:${st[k]};background:${cor[k]}" data-tip="${RH.ST[k]}: ${st[k]}"></i>`:'').join('')}</div><div class="legend">${Object.keys(RH.ST).map(k=>`<span><i style="background:${cor[k]}"></i>${RH.ST[k]} <b>${st[k]||0}</b> <small>(${Math.round((st[k]||0)/T*100)}%)</small></span>`).join('')}</div>`}},
  temp:{nome:'Temperatura',desc:'Média diária das leituras de temperatura e quantas ficaram fora da faixa',render:d=>{
    const s=dias(d);let tot=0,fora=0,faixa=null,mix=false;
    d.rs.forEach(r=>(r.itens||[]).forEach(i=>{if(!RH.ehTemp(i.t)||i.tv==null||isNaN(+i.tv))return;const a=s[idx(d,r.ts)];a.ts+=+i.tv;a.tn++;tot++;if(i.r==='NC'){fora++;a.tfora++}
      const m=/(-?[\d.,]+)\s*°C\s*a\s*(-?[\d.,]+)\s*°C/.exec(i.ideal||'');if(m){const f=[RH.numTemp(m[1]),RH.numTemp(m[2])];if(f[0]!=null&&f[1]!=null){if(!faixa)faixa=f;else if(faixa[0]!==f[0]||faixa[1]!==f[1])mix=true}}}));
    if(!tot)return empty('Sem leituras de temperatura no período','Aparecem quando um item de temperatura é respondido numa ronda.');
    return sum(`<b>${tot}</b> leitura${tot===1?'':'s'} · <b class="${fora?'badc':''}">${fora}</b> fora da faixa${faixa&&!mix?` · ideal ${RH.fmtIdeal(faixa[0],faixa[1])}`:''}`,
      serie(s.map(a=>({t:a.t,v:a.tn?a.ts/a.tn:null,n:a.tn,f:a.tfora})),{band:faixa&&!mix?faixa:null,fmt:v=>String(v).replace('.',','),tip:p=>`média ${(Math.round(p.v*10)/10).toLocaleString('pt-BR')} °C · ${p.n} leitura${p.n===1?'':'s'}${p.f?` · ${p.f} fora da faixa`:''}`,aria:'Temperatura média diária'}))}},
  prod:{nome:'Produtividade (rondas por dia)',desc:'Rondas realizadas a cada dia',render:d=>{
    const s=dias(d);d.rs.forEach(r=>s[idx(d,r.ts)].k.add(r.execId||r.id));
    const tot=new Set(d.rs.map(r=>r.execId||r.id)).size;
    return sum(tot?`<b>${tot}</b> ronda${tot===1?'':'s'} · média de ${(tot/d.days).toLocaleString('pt-BR',{maximumFractionDigits:1})} por dia`:'Sem rondas no período',tot?serie(s.map(a=>({t:a.t,v:a.k.size})),{bar:1,tip:p=>p.v+' ronda'+(p.v===1?'':'s'),aria:'Rondas por dia'}):empty('Sem rondas no período'))}},
  tempo:{nome:'Tempo médio por ronda',desc:'Duração média de cada ronda cadastrada',render:d=>{const r=P().tempoRondas(d.rs);return r.length?P().hbars(r,{w:78}):empty('Sem dados de tempo no período','O tempo é registrado nas rondas feitas a partir da versão 1.0.12.')}},
  salas:{nome:'Salas com menor conformidade',desc:'As 6 salas com menor conformidade no período',render:d=>{
    const m={};d.rs.forEach(r=>{if(!r.salaId)return;const a=m[r.salaId]??={n:r.salaNome||'Sala',c:0,x:0};a.c+=r.c||0;a.x+=r.nc||0});
    const rows=Object.values(m).filter(a=>a.c+a.x).map(a=>({l:a.n,v:a.c/(a.c+a.x)*100,t:Math.round(a.c/(a.c+a.x)*100)+'%',c:a.c/(a.c+a.x)*100>=d.meta?'var(--c1)':'var(--s3)'})).sort((a,b)=>a.v-b.v).slice(0,6);
    return rows.length?P().hbars(rows):empty('Sem rondas em salas no período')}}
};

/* ---------- dados de um item (período do Painel + local do item) ---------- */
function dados(it){
  const days=F.periodo||30,start=sod(Date.now()-(days-1)*864e5),ok=x=>doLocal(it.loc,x);
  return {days,start,meta:+S.cfg.meta||95,rs:S.rondas.filter(r=>r.ts>=start&&ok(r)),ns:S.ncs.filter(n=>n.ts>=start&&ok(n))}}

/* ---------- tela do widget ---------- */
const visao=()=>{const a=carregar();
  if(!a.length)return `<div class="empty"><b>Nenhum gráfico escolhido</b><span>Use a engrenagem para adicionar gráficos e escolher o local de cada um.</span></div>`;
  return `<div class="mg-grid">${a.map(it=>{const T=TIPOS[it.tipo],ln=locNome(it.loc);
    return `<article class="mg-item" data-mg-item="${esc(it.id)}" title="Segure o clique e arraste para mover"><h4>${esc(T.nome)}<small>${esc(ln||'Local não encontrado')}</small></h4>${ln==null?empty('Este local não existe mais','Abra a engrenagem e escolha outro local.'):T.render(dados(it))}</article>`}).join('')}</div>`};
const edicao=()=>{const a=carregar();
  return `<div class="mg-edit" role="group" aria-label="Configurar meus gráficos">${a.length?a.map((it,i)=>`<div class="mg-row">
    <label class="field"><span>Gráfico ${i+1}</span><select data-mg="tipo" data-id="${esc(it.id)}">${Object.entries(TIPOS).map(([k,t])=>`<option value="${k}" ${k===it.tipo?'selected':''}>${esc(t.nome)}</option>`).join('')}</select></label>
    <label class="field"><span>Local</span><select data-mg="loc" data-id="${esc(it.id)}">${locOpts(it.loc)}</select></label>
    <div class="mg-btns"><button type="button" class="btn sm" data-act="mgMove" data-id="${esc(it.id)}" data-d="-1" ${i===0?'disabled':''} aria-label="Mover o gráfico ${i+1} para cima" title="Mover para cima">↑</button><button type="button" class="btn sm" data-act="mgMove" data-id="${esc(it.id)}" data-d="1" ${i===a.length-1?'disabled':''} aria-label="Mover o gráfico ${i+1} para baixo" title="Mover para baixo">↓</button><button type="button" class="btn sm ghost" data-act="mgDel" data-id="${esc(it.id)}" aria-label="Remover gráfico ${i+1}">${ic('trash',16)}<span>Remover</span></button></div></div>`).join(''):'<p class="mg-hint">Nenhum gráfico ainda. Adicione o primeiro abaixo.</p>'}
    <div class="mg-actions"><button type="button" class="btn sm" data-act="mgAdd" ${a.length>=MAX?'disabled':''}>${ic('plus',14)} Adicionar gráfico</button>${a.length>=MAX?`<small>Limite de ${MAX} gráficos.</small>`:''}</div></div>`};
const corpo=()=>RH.st.mgEdit?edicao()+(carregar().length?`<h4 class="mg-prev">Prévia</h4>`+visao():''):visao();
const topo=()=>`<div class="mg-top"><small>Período do Painel (últimos ${F.periodo||30} dias) · cada gráfico usa o seu próprio local · segure o clique num gráfico e arraste para mover · salvo neste aparelho</small><button type="button" class="btn sm${RH.st.mgEdit?' pri':''}" data-act="mgEdit" aria-pressed="${!!RH.st.mgEdit}" aria-label="${RH.st.mgEdit?'Concluir a configuração dos gráficos':'Configurar meus gráficos'}">${ic(RH.st.mgEdit?'check':'gear',16)}<span>${RH.st.mgEdit?'Concluir':'Configurar'}</span></button></div>`;
const redesenhar=()=>{const el=document.getElementById('mg-root');if(el)el.innerHTML=topo()+`<div id="mg-body">${corpo()}</div>`};

RH.mg={html:()=>`<div id="mg-root">${topo()}<div id="mg-body">${corpo()}</div></div>`,tipos:Object.fromEntries(Object.entries(TIPOS).map(([k,v])=>[k,v.nome])),carregar,salvar};

Object.assign(RH.ACT,{
  mgEdit:()=>{RH.st.mgEdit=!RH.st.mgEdit;redesenhar()},
  mgAdd:()=>{const a=carregar();if(a.length>=MAX)return;a.push({id:uid(),tipo:'conf',loc:''});salvar();RH.st.mgEdit=true;redesenhar();
    document.querySelector('.mg-row:last-of-type select')?.focus()},
  mgMove:el=>{const a=carregar(),i=a.findIndex(x=>x.id===el.dataset.id),j=i+(+el.dataset.d);if(i<0||j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];salvar();redesenhar();
    document.querySelector(`[data-act=mgMove][data-id="${CSS.escape(el.dataset.id)}"][data-d="${el.dataset.d}"]:not([disabled])`)?.focus()},
  mgDel:el=>{cfg=carregar().filter(x=>x.id!==el.dataset.id);salvar();redesenhar()}});
RH.ON_CHANGE.push(el=>{
  if(!el.dataset.mg)return false;
  const it=carregar().find(x=>x.id===el.dataset.id);if(!it)return true;
  if(el.dataset.mg==='tipo'&&TIPOS[el.value])it.tipo=el.value;
  if(el.dataset.mg==='loc')it.loc=el.value;
  salvar();
  /* redesenha só a prévia (o foco continua no campo que a pessoa está usando) */
  const prev=document.querySelector('#mg-body .mg-grid');if(prev)prev.outerHTML=visao();else redesenhar();
  return true});

/* ---------- mover: segurar o clique (mouse/caneta) e arrastar sobre outro gráfico; no toque use ↑ ↓ na engrenagem ---------- */
const HOLD=350,MOVE=6;
let dr=null;
const fimDrag=ok=>{
  if(!dr)return;const d=dr;dr=null;clearTimeout(d.t);
  document.body.classList.remove('mg-dragging');
  if(d.on){d.el.classList.remove('mg-drag');d.el.style.transform='';d.el.style.zIndex='';
    document.querySelectorAll('.mg-over').forEach(x=>x.classList.remove('mg-over'));
    if(ok&&d.alvo&&d.alvo!==d.id){const a=carregar(),i=a.findIndex(x=>x.id===d.id),j=a.findIndex(x=>x.id===d.alvo);
      if(i>=0&&j>=0){const [m]=a.splice(i,1);a.splice(j,0,m);salvar()}}
    d.supr=true;setTimeout(()=>{d.supr=false},0);redesenhar();
    RH.toast&&ok&&d.alvo&&d.alvo!==d.id&&RH.toast('Gráfico movido.')}
  try{d.el.releasePointerCapture(d.pid)}catch(e){}};
document.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch'||e.button!==0)return;
  const el=e.target.closest&&e.target.closest('.mg-item');if(!el||e.target.closest('button,select,input,a'))return;
  fimDrag(false);
  dr={el,id:el.dataset.mgItem,pid:e.pointerId,x:e.clientX,y:e.clientY,on:false,alvo:null,
    t:setTimeout(()=>{if(!dr)return;dr.on=true;el.classList.add('mg-drag');document.body.classList.add('mg-dragging');try{el.setPointerCapture(dr.pid)}catch(_){}},HOLD)}});
document.addEventListener('pointermove',e=>{
  if(!dr||e.pointerId!==dr.pid)return;
  if(!dr.on){if(Math.hypot(e.clientX-dr.x,e.clientY-dr.y)>MOVE){clearTimeout(dr.t);dr=null}return}
  const el=dr.el;el.style.transform=`translate(${e.clientX-dr.x}px,${e.clientY-dr.y}px)`;el.style.zIndex=5;
  el.style.pointerEvents='none';const sob=document.elementFromPoint(e.clientX,e.clientY);el.style.pointerEvents='';
  const alvo=sob&&sob.closest&&sob.closest('.mg-item');
  document.querySelectorAll('.mg-over').forEach(x=>x.classList.remove('mg-over'));
  dr.alvo=alvo&&alvo!==el&&alvo.closest('#mg-body')?alvo.dataset.mgItem:null;
  if(dr.alvo)alvo.classList.add('mg-over')});
document.addEventListener('pointerup',e=>{if(dr&&e.pointerId===dr.pid)fimDrag(true)});
document.addEventListener('pointercancel',()=>fimDrag(false));
addEventListener('keydown',e=>{if(e.key==='Escape'&&dr&&dr.on){e.stopImmediatePropagation();fimDrag(false)}},true);
})();
