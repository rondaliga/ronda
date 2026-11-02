/* ==========================================================================
   Aplicação: estrutura da tela (menu lateral), navegação, despacho de eventos
   e inicialização. As telas ficam em js/features/*.js e se registram em
   RH.pages / RH.ACT / RH.ON_CHANGE / RH.ON_INPUT / RH.ON_SUBMIT.
   ========================================================================== */
(async()=>{
const RH=window.RH;
const {$,esc,S,st,F,NF,HF,ic}=RH;

const PAGES=[['painel','Painel','dash'],['ronda','Nova ronda','clip'],['historico','Histórico','hist'],['ncs','Não conformidades','alert'],['cadastros','Cadastros','set']];
const allowedPages=()=>PAGES.filter(p=>RH.access.can(p[0]));

/* ---------- raiz: decide qual tela mostrar ---------- */
RH.renderRoot=auto=>{
  if(st.busy)return;
  const sc=!st.db?'noaccess':!st.me?(S.users.length?'login':'setup'):'app';
  if(sc!==st.screen){st.screen=sc;if(sc==='app')renderShell();else RH.views[sc]();return}
  if(sc==='app')RH.renderView(false,auto);
};

function renderShell(){
  const me=st.me,ini=me.nome.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
  if(!RH.access.can(st.page))st.page=RH.access.firstPage();
  $('#app').innerHTML=`<div class="app"><aside class="side"><div class="brand"><div class="logo">${ic('cross',20)}</div><div><b>${esc(S.cfg.hospital||'Ronda Hospitalar')}</b><span>Ronda e conformidade</span></div></div>
  <nav class="nav" id="nav" aria-label="Principal">${allowedPages().map(p=>`<button data-act="nav" data-p="${p[0]}">${ic(p[2])}<span>${p[1]}</span></button>`).join('')}</nav>
  <div class="side-foot"><div class="me"><div class="avatar">${esc(ini)}</div><div><b>${esc(me.nome)}</b><span>${RH.ROLE[me.role]||''}</span></div></div>
  <div class="row"><button class="ghost-d" data-act="minhaSenha" aria-label="Alterar minha senha" title="Alterar minha senha">${ic('key')}<span>Senha</span></button><button class="ghost-d" data-act="theme" aria-label="Alternar tema">${ic('moon')}<span>Tema</span></button><button class="ghost-d" data-act="logout" aria-label="Sair">${ic('out')}<span>Sair</span></button></div></div></aside>
  <div class="work"><div class="topbar"><div class="clock" aria-label="Data e horário atuais"><time id="rh-time" class="hora"></time><div class="dt"><b id="rh-date"></b><span id="rh-turno"></span></div></div>
  <div class="r">${RH.store&&RH.store.mode==='remote'?'':'<span class="sync loc" title="Os dados ficam só neste aparelho"><i></i>Modo local</span>'}<span class="role">${esc(RH.ROLE[me.role]||'')}</span></div></div>
  <main id="main"></main><footer class="foot">Informações confidenciais · uso interno da instituição</footer></div></div>`;
  tickClock();clearInterval(RH.clockT);RH.clockT=setInterval(tickClock,1000);
  RH.renderView();
}

/* relógio da barra superior: hora, data por extenso e turno (manhã 6–12 h, tarde 12–18 h, noite 18–6 h) */
function tickClock(){
  const t=document.getElementById('rh-time');if(!t){clearInterval(RH.clockT);return}
  const d=new Date(),h=d.getHours(),hh=d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  if(t.textContent!==hh){t.textContent=hh;t.dateTime=d.toISOString();
    const ds=d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
    document.getElementById('rh-date').textContent=ds.charAt(0).toUpperCase()+ds.slice(1);
    document.getElementById('rh-turno').textContent='Turno da '+(h>=6&&h<12?'manhã':h>=12&&h<18?'tarde':'noite')}
}

RH.go=p=>{if(!RH.access.can(p))return;st.page=p;try{sessionStorage.setItem('rh_page',p)}catch(e){}RH.renderView(true);scrollTo(0,0)};

RH.renderView=(force,auto)=>{
  const m=$('#main');if(!m||st.busy||!st.me)return;
  /* atualização automática (dados mudaram em outro aparelho): não redesenha enquanto a pessoa digita/escolhe num campo */
  if(auto&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'')&&m.contains(document.activeElement))return;
  if(!RH.access.can(st.page))st.page=RH.access.firstPage();
  if(!st.R)RH.rondaDraft?.restore();  /* recarregou/voltou: recupera o rascunho da ronda em andamento */
  const page=st.page;
  document.querySelectorAll('#nav button').forEach(b=>{
    const on=b.dataset.p===page;if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    const d=b.querySelector('.dot'),isR=b.dataset.p==='ronda';
    if(isR&&st.R&&!d)b.insertAdjacentHTML('beforeend','<i class="dot" title="Ronda em andamento"></i>');
    if(d&&!(isR&&st.R))d.remove()});
  /* ronda em andamento: não redesenha a cada atualização de dados (preserva o que foi digitado) */
  if(page==='ronda'&&st.R){if(!force&&m.querySelector('.rhead'))return;m.innerHTML=RH.rondaForm();RH.rondaProgress();return}
  const ro=st.canWrite===false?`<div class="banner">Seu acesso é somente leitura: você pode consultar, mas não registrar dados.</div>`:'';
  m.innerHTML=ro+RH.pages[page]();
  RH.after[page]?.();
};

RH.logout=()=>{st.me=null;st.R=null;try{localStorage.removeItem('rh_resume');sessionStorage.removeItem('rh_uid');sessionStorage.removeItem('rh_page');sessionStorage.removeItem('rh_cadtab')}catch(e){}st.screen='';RH.renderRoot()};

/* ---------- ações do menu e do modal ---------- */
Object.assign(RH.ACT,{
  nav:el=>RH.go(el.dataset.p),
  theme:()=>{const d=document.documentElement,cur=d.dataset.theme||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'),next=cur==='dark'?'light':'dark';d.dataset.theme=next;try{localStorage.setItem('rh_theme',next)}catch(e){}if(st.page==='painel')setTimeout(()=>RH.after.painel(),0)},
  /* a ronda em andamento fica salva como rascunho (por usuário) e volta no próximo acesso */
  logout:()=>{RH.rondaDraft?.save();RH.logout()},
  closeModal:RH.closeModal,
  ovClose:()=>{} /* clicar fora da janela não fecha: use o X, Cancelar ou Esc */
});

/* ---------- despacho de eventos ---------- */
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');if(!el)return;
  if(el.tagName==='TR'&&e.target.closest('button,a'))return;
  RH.ACT[el.dataset.act]?.(el,e)});
document.addEventListener('change',async e=>{
  const el=e.target;
  for(const h of RH.ON_CHANGE){if(await h(el,e))return}
  if(el.dataset.set&&el.dataset.live==null){const [o,k]=el.dataset.set.split(':');({F,NF,HF})[o][k]=el.dataset.num?+el.value:el.value;RH.renderView()}
});
document.addEventListener('input',e=>{for(const h of RH.ON_INPUT){if(h(e.target,e))return}});
document.addEventListener('submit',e=>{e.preventDefault();const h=RH.ON_SUBMIT[e.target.id];if(h)h(e.target)});
/* a ronda é salva sozinha (rascunho); só avisa se o navegador não conseguiu gravar o rascunho */
addEventListener('beforeunload',e=>{if(st.R&&st.draftErr){e.preventDefault();e.returnValue=''}});

/* ---------- início ---------- */
try{const th=localStorage.getItem('rh_theme');if(th)document.documentElement.dataset.theme=th}catch(e){}
$('#app').innerHTML='<div class="auth-r" style="min-height:100%"><p style="color:var(--muted)">Carregando…</p></div>';
try{st.db=await RH.store.open()}catch(e){console.error(e);st.db=null}
if(!st.db){st.screen='';RH.renderRoot();return}
RH.syncAll();
})();
