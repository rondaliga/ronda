/* ==========================================================================
   Núcleo · permissões por perfil (um único lugar para todas as regras de acesso)

     Administrador : todas as telas (inclusive Cadastros)
     Gestor        : Painel, Nova ronda, Histórico e Não conformidades
     Inspetor      : "Nova ronda" e "Histórico" (este mostra apenas as rondas feitas por ele)

   Rondas: uma ronda com responsável só é vista/realizada por ele (o Administrador
   vê e realiza todas); uma ronda com responsável "Todos" é vista e realizada por todos
   os usuários com acesso a Nova ronda. Perfil desconhecido é tratado como Inspetor (menor privilégio).

   Atenção: estas regras controlam a INTERFACE. O banco compartilhado é protegido
   apenas pelo código de acesso da equipe (veja LEIA-ME.md).
   ========================================================================== */
(()=>{
const RH=window.RH,st=RH.st;

const PAGES={
  admin:['painel','ronda','historico','ncs','cadastros'],
  gestor:['painel','ronda','historico','ncs'],
  inspetor:['ronda','historico']
};
const pagesOf=()=>PAGES[st.me&&st.me.role]||PAGES.inspetor;
const gerencia=()=>!!st.me&&['admin','gestor'].includes(st.me.role);

RH.access={
  PAGES,
  can:p=>!!st.me&&pagesOf().includes(p),
  firstPage:()=>pagesOf()[0],
  gerencia,
  /* o histórico deve ser restrito às rondas do próprio usuário? (todo perfil que não gerencia, inclusive desconhecido) */
  soPropriasRondas:()=>!!st.me&&!gerencia(),
  /* a execução/documento de ronda `r` pode ser vista pelo usuário logado? */
  rondaFeitaVisivel:r=>!!st.me&&(gerencia()||(r.inspId?r.inspId===st.me.id:r.inspNome===st.me.nome)),
  /* a ronda cadastrada `m` aparece para o usuário `u`? */
  rondaVisivel:(m,u)=>!!u&&m.ativo!==false&&(u.role==='admin'||!m.responsavelId||m.responsavelId===u.id),
  canEditNC:()=>gerencia()&&st.canWrite!==false,
  canDeleteNC:()=>gerencia()&&st.canWrite!==false,
  canDeleteRonda:()=>gerencia()&&st.canWrite!==false
};
})();
