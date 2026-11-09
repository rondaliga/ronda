/* ==========================================================================
   Telas de acesso: login e primeiro acesso (criação do administrador).
   ========================================================================== */
(()=>{
const RH=window.RH;
const {$,esc,S,st,ic}=RH;

const authSide=()=>`<div class="auth-l"><div class="brand"><div class="logo">${ic('cross',20)}</div><div><b>${esc(S.cfg.hospital||'Ronda Hospitalar')}</b><span>Gestão de rondas hospitalares</span></div></div>
<div><h2>Rondas de segurança e qualidade assistencial.</h2><p>Registre as rondas, trate as não conformidades e acompanhe os indicadores de cada setor.</p></div>
<ul><li>${ic('clip')} Rondas com checklists por sala e por equipamento</li><li>${ic('alert')} Não conformidades com foto, severidade e prazo</li><li>${ic('dash')} Painel de indicadores por setor e período</li></ul></div>`;

RH.views={
  noaccess(){RH.$('#app').innerHTML=`<div class="auth-r" style="min-height:100%"><div class="auth-card"><h1>Ronda Hospitalar</h1><p>Não foi possível abrir o armazenamento de dados neste aparelho. Feche o aplicativo, abra-o novamente e, se o erro continuar, fale com o administrador.</p></div></div>`},
  login(){
    $('#app').innerHTML=`<div class="auth">${authSide()}<div class="auth-r"><form class="auth-card" id="f-login" autocomplete="on">
    <div><h1>Entrar</h1><p style="color:var(--ink2);margin:4px 0 0">Acesse com seu usuário e senha.</p></div>
    <label class="field"><span>Usuário</span><input type="text" name="login" id="lg-login" autocomplete="username" required></label>
    <label class="field"><span>Senha</span><input type="password" name="senha" id="lg-senha" autocomplete="current-password" required></label>
    <div class="err" id="lg-err" role="alert"></div>
    <button class="btn pri" type="submit">Entrar</button><p class="auth-aviso">Acesso restrito a colaboradores autorizados. Suas ações ficam registradas com o seu nome.</p></form></div></div>`},
  setup(){
    $('#app').innerHTML=`<div class="auth">${authSide()}<div class="auth-r"><form class="auth-card" id="f-setup">
    <div><h1>Primeiro acesso</h1><p style="color:var(--ink2);margin:4px 0 0">Crie o administrador e dê nome ao hospital. Depois você cadastra usuários, salas, equipamentos, checklists e rondas.</p></div>
    <label class="field"><span>Nome do hospital</span><input type="text" name="hospital" id="st-h" value="Liga Contra o Câncer" required></label>
    <label class="field"><span>Seu nome completo</span><input type="text" name="nome" id="st-n" required></label>
    <label class="field"><span>Usuário de acesso</span><input type="text" name="login" id="st-l" autocomplete="username" required></label>
    <label class="field"><span>Senha</span><input type="password" name="senha" id="st-s" autocomplete="new-password" minlength="8" required><small style="color:var(--muted)">${esc(RH.SENHA_REGRA)}</small></label>
    <label class="chk"><input type="checkbox" name="demo" id="st-d"> Carregar dados de exemplo (apenas para conhecer o sistema; podem ser removidos depois)</label>
    <div class="err" id="st-err" role="alert"></div>
    <div class="prog-seed" id="st-prog" hidden><i></i></div>
    <button class="btn pri" type="submit" id="st-btn">Criar e entrar</button></form></div></div>`}
};

RH.ON_SUBMIT['f-login']=async f=>{
  const l=f.login.value.trim().toLowerCase(),u=S.users.find(x=>(x.login||'').toLowerCase()===l&&x.ativo!==false),er=$('#lg-err');er.textContent='';
  if(!u||!u.hash||await RH.hash(f.senha.value,u.salt)!==u.hash){er.textContent='Usuário ou senha incorretos.';return}
  st.me=u;try{sessionStorage.setItem('rh_uid',u.id)}catch(x){}setTimeout(()=>RH.migrarLuz&&RH.migrarLuz(),500);setTimeout(()=>RH.limparFotos&&RH.limparFotos(),4000);
  st.screen='';st.page=RH.access.firstPage();try{sessionStorage.removeItem('rh_page');sessionStorage.removeItem('rh_cadtab')}catch(x){}RH.renderRoot();
};

RH.ON_SUBMIT['f-setup']=async f=>{
  const er=$('#st-err');er.textContent='';
  const pe=RH.checkSenha(f.senha.value);if(pe){er.textContent=pe;return}
  const btn=$('#st-btn');btn.disabled=true;st.busy=true;
  try{
    const salt=RH.uid()+RH.uid(),id='u'+RH.uid(),login=f.login.value.trim().toLowerCase();
    const u={nome:f.nome.value.trim(),cargo:'Administrador do sistema',login,role:'admin',ativo:true,salt,hash:await RH.hash(f.senha.value,salt)};
    await RH.put('config','main',{hospital:f.hospital.value.trim(),meta:95});
    if(f.demo.checked)await RH.seedDemo('#st-prog');
    await RH.put('users',id,u);st.me={id,...u};try{sessionStorage.setItem('rh_uid',id)}catch(x){}
    st.busy=false;st.screen='';st.page='painel';RH.renderRoot();
  }catch(x){st.busy=false;console.error(x);er.textContent='Não foi possível criar o acesso. Tente novamente.';btn.disabled=false}
};
})();
