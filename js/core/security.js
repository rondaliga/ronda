/* ==========================================================================
   Núcleo · senhas
   - hash   : guarda apenas o hash PBKDF2-SHA256 (600 mil iterações em senhas novas; contas antigas, com 60 mil, são atualizadas no próximo login)
              com sal por usuário.
              Requer HTTPS (ou localhost), pois usa crypto.subtle.
   - checkSenha : regra de senha do sistema (mínimo 8 caracteres e 1 símbolo especial).
   - senhaForte : gera uma senha aleatória que cumpre a regra.
   ========================================================================== */
(()=>{
const RH=window.RH;
const enc=s=>new TextEncoder().encode(s);
RH.HASH_ITER=600000;   /* iterações das senhas novas; o valor de cada conta fica em u.iter (ausente = 60 mil, contas antigas) */
RH.hash=async(pw,salt,iter)=>{
  const k=await crypto.subtle.importKey('raw',enc(pw),'PBKDF2',false,['deriveBits']);
  const b=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc(salt),iterations:iter||60000,hash:'SHA-256'},k,256);
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')};

/* após um login correto, regrava o hash de uma conta antiga com o número atual de iterações */
RH.rehash=async(u,pw)=>{
  if((u.iter||60000)>=RH.HASH_ITER)return;
  try{const salt=RH.uid()+RH.uid(),hash=await RH.hash(pw,salt,RH.HASH_ITER);await RH.upd('users',u.id,{salt,hash,iter:RH.HASH_ITER})}catch(e){console.error('atualização do hash',e)}};

RH.SENHA_REGRA='Mínimo de 8 caracteres, com pelo menos 1 símbolo especial (ex.: ! @ # $ % & *).';
/* devolve '' se a senha é válida; senão, a mensagem do problema. Símbolo = qualquer caractere que não seja letra ou número */
RH.checkSenha=pw=>{
  pw=String(pw??'');
  if(pw.length<8)return 'A senha precisa ter ao menos 8 caracteres.';
  if(!/[^\p{L}\p{N}\s]/u.test(pw))return 'A senha precisa ter ao menos 1 símbolo especial (ex.: ! @ # $ % & *).';
  return ''};

RH.senhaForte=(n=14)=>{
  const L='abcdefghijkmnpqrstuvwxyz',U='ABCDEFGHJKLMNPQRSTUVWXYZ',D='23456789',Y='!@#$%&*?',ALL=L+U+D+Y;
  const rnd=m=>crypto.getRandomValues(new Uint32Array(1))[0]%m;
  const out=[L[rnd(L.length)],U[rnd(U.length)],D[rnd(D.length)],Y[rnd(Y.length)]];
  while(out.length<n)out.push(ALL[rnd(ALL.length)]);
  for(let i=out.length-1;i>0;i--){const j=rnd(i+1);[out[i],out[j]]=[out[j],out[i]]}   // embaralha
  return out.join('')};
})();
