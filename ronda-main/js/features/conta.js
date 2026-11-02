/* ==========================================================================
   Minha conta: o próprio usuário altera a sua senha (botão "Senha" no menu lateral).
   Pede a senha atual, exige a regra de senha do sistema (RH.checkSenha) e confirmação.
   ========================================================================== */
(()=>{
const RH=window.RH;
const {$,esc,ic,toast,modal,closeModal,st}=RH;

function abrir(){
  modal(`<div class="mh"><h3 style="font-size:16px">Alterar minha senha</h3><button class="ic-btn" data-act="closeModal" aria-label="Fechar">${ic('x',16)}</button></div>
  <form id="f-pw" autocomplete="off"><div class="mb">
  <label class="field"><span>Senha atual</span><input type="password" name="atual" id="pw-atual" autocomplete="current-password" required></label>
  <label class="field"><span>Nova senha</span><input type="password" name="nova" id="pw-nova" autocomplete="new-password" minlength="8" required><small>${esc(RH.SENHA_REGRA)}</small></label>
  <label class="field"><span>Confirmar nova senha</span><input type="password" name="conf" id="pw-conf" autocomplete="new-password" required></label>
  <label class="chk"><input type="checkbox" data-pw-ver> Mostrar senhas</label>
  <div class="err" id="pw-err" role="alert"></div></div>
  <div class="mf"><button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn pri" type="submit" id="pw-ok">Salvar nova senha</button></div></form>`);
}

RH.ON_SUBMIT['f-pw']=async f=>{
  const er=$('#pw-err'),u=st.me;er.textContent='';
  if(!u)return;
  const atual=f.atual.value,nova=f.nova.value;
  if(!u.hash||await RH.hash(atual,u.salt)!==u.hash){er.textContent='A senha atual está incorreta.';return}
  const p=RH.checkSenha(nova);if(p){er.textContent=p;return}
  if(nova!==f.conf.value){er.textContent='A confirmação não confere com a nova senha.';return}
  if(nova===atual){er.textContent='A nova senha precisa ser diferente da atual.';return}
  const b=$('#pw-ok');b.disabled=true;
  const salt=RH.uid()+RH.uid(),hash=await RH.hash(nova,salt);
  const ok=await RH.safe(async()=>{await RH.upd('users',u.id,{salt,hash});return true});
  if(ok){closeModal();toast('Senha alterada com sucesso.')}else b.disabled=false;
};

RH.ACT.minhaSenha=abrir;
RH.ON_CHANGE.push(el=>{
  if(el.dataset.pwVer!=null){['pw-atual','pw-nova','pw-conf'].forEach(id=>{const i=document.getElementById(id);if(i)i.type=el.checked?'text':'password'});return true}
  return false});
})();
