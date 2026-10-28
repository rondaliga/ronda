/* ==========================================================================
   Cadastros (somente administrador): Rondas, Salas, Equipamentos,
   Tipos de NC, Usuários e dados do hospital / backup.
   Cada entidade é descrita em ENT (colunas da tabela + campos do formulário).
   ========================================================================== */
(()=>{
const RH=window.RH;
const {$,esc,uid,S,st,byId,userName,ic,empty,toast,modal,closeModal,sevPill,actPill,ROLE,SEV}=RH;

const optsSetor=()=>[...new Set([...S.salas.map(s=>s.setor),...S.equipamentos.map(RH.setorEq)].filter(Boolean))].sort((a,b)=>a.localeCompare(b));
const usersAtivos=()=>S.users.filter(u=>u.ativo!==false);
/* setores das salas de uma ronda, cada setor uma única vez (ordem alfabética) */
const setoresDa=m=>[...new Set([...(m.salaIds||[]).map(id=>byId(S.salas,id)).filter(Boolean).map(x=>x.setor||'Sem setor'),...RH.equipsDaRonda(m).map(e=>RH.setorEq(e)||'Sem setor')])].sort((a,b)=>a.localeCompare(b));

/* quem pode realizar a ronda: texto + selo */
function acessoRonda(m){
  if(!m.responsavelId)return '<span class="pill okp">Todos os inspetores</span>';
  const u=byId(S.users,m.responsavelId);
  if(!u||u.ativo===false)return `<span class="pill late">Responsável inativo</span>`;
  return `<span class="pill inf">Somente ${esc(u.nome)}</span>`;
}

/* coluna "Presença": código cadastrado? quantas antenas? */
const presencaCol=x=>x.codigoLocal?`<span class="mono">${esc(x.codigoLocal)}</span><small>${RH.local.parseBssids(x.bssids).lista.length?RH.local.parseBssids(x.bssids).lista.length+' antena(s)':'sem antena cadastrada'}</small>`:'<span class="pill off">Sem código</span>';

const TIPO_CK={sala:'Sala',equipamento:'Equipamento',ambos:'Sala e equipamento'};
const ENT={
 modelos:{col:'modelos',nome:'Rondas',um:'ronda',
  cols:[['Nome da ronda',m=>`<b>${esc(m.nome)}</b>`],['Setores',m=>setoresDa(m).map(esc).join(', ')||'—'],['Quem realiza',acessoRonda],['Dias e horários',m=>esc(RH.agenda.resumo(m))],['Situação',actPill]],
  fields:[
   {k:'nome',l:'Nome da ronda',req:1,full:1,hint:'Ex.: Ronda UTI · plantão diurno'},
   {k:'responsavelId',l:'Responsável pela ronda',t:'select',full:1,opts:()=>usersAtivos().map(u=>[u.id,u.nome+(u.cargo?' · '+u.cargo:'')]),blank:'Todos',
    hint:'Somente o responsável escolhido vê e realiza esta ronda. Com "Todos", todos os inspetores podem realizá-la.'},
   {k:'ativo',l:'Ronda ativa',t:'check',def:true,full:1},
   {k:'agenda',l:'Dias e horários da ronda',t:'agenda',full:1},
   {k:'salaIds',l:'Setor (salas e equipamentos)',t:'salas',full:1}]},
 salas:{col:'salas',nome:'Salas',um:'sala',
  cols:[['Sala',s=>`<b>${esc(s.nome)}</b><small>${esc(s.andar||'')}</small>`],['Setor',s=>esc(s.setor||'—')],['Presença',presencaCol],['Responsável pela sala',s=>esc(userName(s.responsavelId))],['Equipamentos no setor',s=>S.equipamentos.filter(e=>s.setor&&RH.setorEq(e)===s.setor).length],['Rondas',s=>S.modelos.filter(m=>(m.salaIds||[]).includes(s.id)).length||'<span class="pill late">Fora de rondas</span>'],['Situação',actPill]],
  tabs:[['geral','Geral'],['presenca','Presença no local']],
  fields:[{k:'nome',l:'Nome da sala / ambiente',req:1,full:1,tab:'geral'},{k:'setor',l:'Setor',req:1,list:optsSetor,hint:'Ex.: UTI, Centro Cirúrgico, Emergência',tab:'geral'},{k:'andar',l:'Andar / bloco',tab:'geral'},
   {k:'responsavelId',l:'Responsável pela sala (recebe as NCs)',t:'select',full:1,opts:()=>usersAtivos().map(u=>[u.id,u.nome+(u.cargo?' · '+u.cargo:'')]),blank:'Todos',tab:'geral'},
   {k:'itens',l:'Checklist',t:'items',full:1,tab:'geral'},
   {k:'ativo',l:'Sala ativa (aparece nas rondas)',t:'check',def:true,full:1,tab:'geral'},
   {k:'codigoLocal',l:'Código de barras do local',t:'codigo',full:1,hint:'Valor do código (Code 128, QR etc.) impresso e fixado neste local. Deixe vazio para não verificar a presença aqui.',tab:'presenca'},
   {k:'bssids',l:'Antenas Wi-Fi (BSSID) que cobrem este local',t:'bssids',full:1,hint:'Um por linha, ex.: aa:bb:cc:dd:ee:ff. Use aa:bb:cc:dd:*:* para antenas com vários rádios. Só é conferido no aplicativo Android.',tab:'presenca'}],
  canDel:s=>S.modelos.some(m=>(m.salaIds||[]).includes(s.id))?'Esta sala faz parte de uma ronda. Remova-a da ronda antes de excluir. Ou apenas desative a sala.':''},
 equipamentos:{col:'equipamentos',nome:'Equipamentos',um:'equipamento',
  cols:[['Equipamento',e=>`<div style="display:flex;gap:10px;align-items:center">${RH.thumbEq(e)}<div><b>${esc(e.nome)}</b></div></div>`],['Setor',e=>esc(RH.setorEq(e)||'—')],['Presença',presencaCol],['Situação',actPill]],
  tabs:[['geral','Geral'],['presenca','Presença no local']],
  fields:[{k:'nome',l:'Nome do equipamento',req:1,full:1,tab:'geral'},
   {k:'setor',l:'Setor',req:1,full:1,list:optsSetor,hint:'Setor onde o equipamento fica. Ex.: UTI, Centro Cirúrgico',tab:'geral'},
   {k:'itens',l:'Checklist',t:'items',full:1,tab:'geral'},
   {k:'ativo',l:'Equipamento ativo',t:'check',def:true,full:1,tab:'geral'},
   {k:'codigoLocal',l:'Código de barras do local',t:'codigo',full:1,hint:'Valor do código (Code 128, QR etc.) impresso e fixado neste local. Deixe vazio para não verificar a presença aqui.',tab:'presenca'},
   {k:'bssids',l:'Antenas Wi-Fi (BSSID) que cobrem este local',t:'bssids',full:1,hint:'Um por linha, ex.: aa:bb:cc:dd:ee:ff. Use aa:bb:cc:dd:*:* para antenas com vários rádios. Só é conferido no aplicativo Android.',tab:'presenca'}]},
 tiposNC:{col:'tiposNC',nome:'Tipos de NC',um:'tipo de não conformidade',
  cols:[['Tipo',t=>`<b>${esc(t.nome)}</b>`],['Severidade padrão',t=>sevPill(t.sev||2)],['Orientação / ação esperada (exibida ao inspetor)',t=>t.orient?`<span style="white-space:normal">${esc(t.orient)}</span>`:'<small>—</small>'],['Registros',t=>S.ncs.filter(n=>n.tipoId===t.id).length]],
  fields:[{k:'nome',l:'Nome',req:1,full:1},{k:'sev',l:'Severidade padrão',t:'select',req:1,opts:()=>[1,2,3,4].map(s=>[s,s+' · '+SEV[s]]),def:2},
   {k:'orient',l:'Orientação / ação esperada',t:'textarea',full:1,sugerir:1,hint:'Sugerida automaticamente a partir do nome (você pode editar). Aparece como alerta para o inspetor ao registrar este tipo de não conformidade durante a ronda.'}]},
 users:{col:'users',nome:'Responsáveis e usuários',um:'usuário',
  cols:[['Nome',u=>`<b>${esc(u.nome)}</b><small>${esc(u.cargo||'')}</small>`],['Usuário',u=>`<span class="mono">${esc(u.login||'—')}</span>`],['Perfil',u=>ROLE[u.role]||'—'],['Acesso',u=>u.hash?actPill(u):'<span class="pill off">Sem senha</span>']],
  fields:[{k:'nome',l:'Nome completo',req:1},{k:'cargo',l:'Cargo / função',hint:'Ex.: Enfermeira, Engenheiro clínico'},{k:'login',l:'Usuário de acesso',req:1},{k:'senha',l:'Senha',t:'password',hint:RH.SENHA_REGRA+' Deixe em branco para manter a atual.'},
   {k:'role',l:'Perfil de acesso',t:'select',req:1,opts:()=>Object.entries(ROLE),def:'inspetor',full:1,hint:'Administrador: tudo. Gestor: painel, histórico e tratamento de NCs. Inspetor: apenas a tela Nova ronda.'},{k:'ativo',l:'Usuário ativo',t:'check',def:true,full:1}],
  canDel:u=>u.id===st.me.id?'Você não pode excluir o próprio usuário.':(u.role==='admin'&&S.users.filter(x=>x.role==='admin'&&x.ativo!==false).length<2?'É o único administrador ativo.':(S.modelos.some(m=>m.responsavelId===u.id)?'Este usuário é responsável por rondas. Troque o responsável das rondas antes de excluir. Ou apenas desative o usuário.':''))}
};
RH.ENT=ENT;

/* ---------- backup ---------- */
function backupCard(){
  const L=RH.store,rem=L.mode==='remote';
  return `<div class="card" style="max-width:560px;margin-top:14px"><h3>${rem?'Base compartilhada e backup':'Backup dos dados'}</h3>
  ${rem?`<p style="margin:0 0 6px;color:var(--ink2)"><span class="pill okp"><i></i>Conectado ao banco compartilhado</span><br>Todos os usuários da equipe veem os mesmos dados, atualizados a cada poucos segundos. Mesmo assim, exporte um backup de vez em quando.</p>`
  :`<p style="margin:0 0 6px;color:var(--ink2)">Neste modo os dados ficam salvos só no navegador deste aparelho e não são compartilhados. Para a equipe usar a mesma base, configure o banco compartilhado (veja o LEIA-ME). Exporte backups com frequência.</p>`}
  ${L.volatile()?'<p class="err">Atenção: este navegador bloqueou o armazenamento. Os dados serão perdidos ao fechar a aba.</p>':''}
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" data-act="exportBackup">Exportar backup (.json)</button><label class="btn" style="cursor:pointer">Importar backup<input class="sr" type="file" accept="application/json,.json" data-import></label>${rem?'<button class="btn" data-act="changeCode">Trocar código de acesso neste aparelho</button>':''}</div></div>`;
}

/* ---------- página ---------- */
RH.pages.cadastros=()=>{
  const tabs=[...Object.keys(ENT),'hospital'],nm=k=>k==='hospital'?'Hospital':ENT[k].nome;
  if(!tabs.includes(st.cadTab))st.cadTab='modelos';
  let body='';
  if(st.cadTab==='hospital'){
    const demo=['users','salas','equipamentos','checklists','tiposNC','modelos','rondas','ncs'].reduce((n,c)=>n+S[c].filter(x=>x.demo).length,0);
    body=`<form id="f-cfg" class="card" style="max-width:560px;display:grid;gap:14px"><h3>Dados do hospital</h3><label class="field"><span>Nome do hospital</span><input type="text" name="hospital" value="${esc(S.cfg.hospital||'')}" required></label>
    <label class="field"><span>Meta de conformidade (%)</span><input type="number" name="meta" min="50" max="100" value="${+S.cfg.meta||95}"></label>
    ${(()=>{const p=RH.local.politica(),o=(v,l,c)=>`<option value="${v}" ${c===v?'selected':''}>${l}</option>`;return `<label class="field"><span>Presença no local (código de barras)</span><select name="valLocal">${o('off','Desligada',p.modo)}${o('registrar','Registrar leitura (não bloqueia)',p.modo)}${o('exigir','Exigir leitura para liberar o checklist',p.modo)}</select><small>Vale para salas e equipamentos que tenham código cadastrado.</small></label>
    <label class="field"><span>Antena Wi-Fi (BSSID)</span><select name="valBssid">${o('se_disponivel','Conferir quando o aparelho conseguir ler',p.bssid)}${o('exigir','Exigir (rejeita aparelhos que não leem o BSSID)',p.bssid)}</select><small>Só o aplicativo Android lê o BSSID; navegador comum e iPhone não leem.</small></label>`})()}<div><button class="btn pri" type="submit">Salvar</button></div></form>
    <div class="card" style="max-width:560px;margin-top:14px"><h3>Dados de exemplo</h3><p style="margin:0 0 12px;color:var(--ink2)">${demo?`Há ${demo} registros de exemplo no sistema. Remova-os antes de começar a usar de verdade.`:'Carregue salas, equipamentos, checklists, rondas e 4 semanas de execuções fictícias para conhecer o painel.'}</p>
    <div class="prog-seed" id="seed-prog" hidden><i></i></div>
    ${demo?`<button class="btn bad" data-act="wipeDemo">Remover dados de exemplo</button>`:`<button class="btn" data-act="seedDemo">Carregar dados de exemplo</button>`}</div>${backupCard()}`;
  }else{
    const E=ENT[st.cadTab],all=[...S[E.col]].sort((a,b)=>(a.nome||'').localeCompare(b.nome||'')),bulk=!!BULK[st.cadTab],rows=bulk?visiveis():all;
    const th=bulk?`<th class="th-sel"><input type="checkbox" data-act="selAll" id="sel-all" aria-label="Selecionar todos os itens exibidos"></th>`:'';
    const tr=r=>`<tr data-act="editEnt" data-id="${r.id}"${bulk&&st.sel.has(keyOf(r.id))?' class="sel"':''}>${bulk?`<td class="td-sel" data-act="selRow" data-id="${r.id}"><input type="checkbox" aria-label="Selecionar ${esc(r.nome||'')}" ${st.sel.has(keyOf(r.id))?'checked':''}></td>`:''}${E.cols.map(c=>`<td>${c[1](r)}</td>`).join('')}<td class="td-act"><button type="button" class="btn sm" data-act="dupEnt" data-id="${r.id}" title="Duplicar este cadastro" aria-label="Duplicar ${esc(r.nome||'')}">${ic('copy',14)} Duplicar</button></td></tr>`;
    body=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><small>${bulk&&rows.length!==all.length?`${rows.length} de ${all.length} exibidos`:`${rows.length} cadastrado${rows.length===1?'':'s'}`} · clique em uma linha para editar ou use Duplicar${bulk?' · marque as caixas para ações em lote':''}</small><span style="display:flex;gap:8px;flex-wrap:wrap">${['salas','equipamentos'].includes(st.cadTab)?`<button class="btn" data-act="etqOpen">${ic('copy',16)} Imprimir etiquetas</button>`:''}<button class="btn pri" data-act="newEnt">${ic('plus',16)} Adicionar ${E.um}</button></span></div>
    ${bulk?filtrosHtml():''}
    ${rows.length?`<div class="tw"><table><thead><tr>${th}${E.cols.map(c=>`<th>${c[0]}</th>`).join('')}<th class="th-act"><span class="sr">Ações</span></th></tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>`:all.length?empty('Nenhum cadastro com estes filtros','Ajuste ou limpe os filtros para ver os demais.'):empty(`Nenhum cadastro em ${E.nome}`,'Use o botão Adicionar para criar o primeiro.')}
    ${bulk?`<div class="bulk-spacer"></div><div id="bulk-bar" class="bulkbar" role="region" aria-label="Ações em lote" ${selKeys().length?'':'hidden'}>${barHtml()}</div>`:''}`;
  }
  return `<div class="top"><div><h1>Cadastros</h1><p>Rondas, salas, equipamentos, tipos de não conformidade e usuários.</p></div></div>
  <div class="tabs" role="tablist">${tabs.map(k=>`<button role="tab" data-act="cadTab" data-k="${k}" aria-selected="${st.cadTab===k}">${nm(k)}</button>`).join('')}</div>${body}`;
};

/* ==========================================================================
   Seleção e ações em lote (abas Salas e Equipamentos)
   - st.sel : chaves 's:<id>' (sala) · 'e:<id>' (equipamento) · 'c:<id>' (checklist), o mesmo
              formato da ordem de percurso das rondas. Salas e equipamentos podem ser marcados
              em abas diferentes e entrar juntos na mesma ronda.
   - st.CF  : filtros de cada aba (Setor/Andar em Salas; Setor em Equipamentos).
   - A lógica de "entrar em uma ronda" fica em js/features/ronda.js (RH.rondaPlano / RH.rondaAdicionar).
   ========================================================================== */
const BULK={salas:'s:',equipamentos:'e:'};
const COL_DE={s:'salas',e:'equipamentos'};
const SEMSETOR='__sem';
st.sel=st.sel||new Set();
st.CF=st.CF||{salas:{setor:'',andar:''},equipamentos:{setor:''}};
const keyOf=id=>BULK[st.cadTab]+id;
const existe=k=>byId(S[COL_DE[k[0]]]||[],k.slice(2));
const nomeDe=k=>existe(k)?.nome||'';
const setorDe=(tab,x)=>(tab==='salas'?x.setor:RH.setorEq(x))||'';
const porNome=(a,b)=>(a.nome||'').localeCompare(b.nome||'');
const nomes=(keys,max=6)=>{const n=keys.map(nomeDe);return n.slice(0,max).map(esc).join(', ')+(n.length>max?` e mais ${n.length-max}`:'')};
const plural=(n,s,p)=>`${n} ${n===1?s:p}`;

/* seleção da aba atual, já sem registros que deixaram de existir */
function selKeys(){
  for(const k of [...st.sel])if(!existe(k))st.sel.delete(k);
  const tipos=['s','e'];
  return [...st.sel].filter(k=>tipos.includes(k[0]))}

/* ---------- filtros ---------- */
function normFiltros(){
  const tab=st.cadTab,f=st.CF[tab];if(!f)return;
  const vale=(k,fn)=>{if(f[k]&&f[k]!==SEMSETOR&&!S[tab].some(x=>fn(x)===f[k]))f[k]=''};   /* valor que não existe mais */
  vale('setor',x=>setorDe(tab,x));vale('andar',x=>x.andar||'')}
function visiveis(){
  normFiltros();
  const tab=st.cadTab,f=st.CF[tab]||{};
  return [...S[tab]].filter(x=>{
    const sd=setorDe(tab,x);
    if(f.setor&&(f.setor===SEMSETOR?sd:sd!==f.setor))return false;
    if(f.andar&&(x.andar||'')!==f.andar)return false;
    return true}).sort(porNome)}
function filtrosHtml(){
  const tab=st.cadTab,f=st.CF[tab];if(!f)return '';
  const rows=S[tab],uniq=a=>[...new Set(a.filter(Boolean))].sort((x,y)=>x.localeCompare(y,'pt-BR',{numeric:true}));
  const campo=(k,l,vals,extra='')=>`<label class="field"><span>${l}</span><select data-cf="${k}"><option value="">Todos</option>${extra}${vals.map(v=>`<option value="${esc(v)}" ${f[k]===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
  const semSetor=rows.some(x=>!setorDe(tab,x));
  return `<div class="bulk-filters">${campo('setor','Setor',uniq(rows.map(x=>setorDe(tab,x))),semSetor?`<option value="${SEMSETOR}" ${f.setor===SEMSETOR?'selected':''}>Sem setor</option>`:'')}
  ${tab==='salas'?campo('andar','Andar / bloco',uniq(rows.map(x=>x.andar))):''}
  ${Object.values(f).some(Boolean)?`<button type="button" class="btn sm" data-act="cfClear">Limpar filtros</button>`:''}</div>`}

/* ---------- barra flutuante ---------- */
function barHtml(){
  const ks=selKeys(),ns=ks.filter(k=>k[0]==='s').length,ne=ks.filter(k=>k[0]==='e').length,n=ks.length;
  const vis=new Set(visiveis().map(x=>keyOf(x.id))),fora=ks.filter(k=>k.startsWith(BULK[st.cadTab])&&!vis.has(k)).length;
  const det=[ns?plural(ns,'sala','salas'):'',ne?plural(ne,'equipamento','equipamentos'):'',fora?`${fora} fora dos filtros`:''].filter(Boolean).join(' · ');
  const lote=true;
  return `<div class="bulk-n" aria-live="polite"><b>${n}</b> selecionado${n===1?'':'s'}<small>${det}</small></div>
  <div class="bulk-a">${lote?`<button type="button" class="btn sm" data-act="bkLink">${ic('clip',14)} Vincular a ronda</button><button type="button" class="btn sm" data-act="bkSetor">${ic('set',14)} Alterar setor</button><button type="button" class="btn sm pri" data-act="bkRonda">${ic('plus',14)} Criar ronda com selecionados</button>`:''}<button type="button" class="btn sm bad" data-act="bkDel">${ic('trash',14)} Excluir selecionados</button><button type="button" class="btn sm" data-act="selClear">${ic('x',14)} Limpar</button></div>`}
/* atualiza barra, "selecionar todos" e linhas sem redesenhar a tela (mantém foco e rolagem) */
function refreshSel(){
  const bar=$('#bulk-bar');if(!bar)return;
  const ks=selKeys();bar.hidden=!ks.length;if(ks.length)bar.innerHTML=barHtml();
  const rows=visiveis(),on=rows.filter(r=>st.sel.has(keyOf(r.id))).length,h=$('#sel-all');
  if(h){h.checked=!!rows.length&&on===rows.length;h.indeterminate=on>0&&on<rows.length}
  document.querySelectorAll('tbody tr[data-id]').forEach(tr=>{const s=st.sel.has(keyOf(tr.dataset.id));tr.classList.toggle('sel',s);const cb=tr.querySelector('.td-sel input');if(cb)cb.checked=s})}
RH.after.cadastros=refreshSel;

/* ---------- janelas ---------- */
const mHead=t=>`<div class="mh"><h3 style="font-size:16px">${t}</h3><button class="ic-btn" data-act="closeModal" aria-label="Fechar">${ic('x',16)}</button></div>`;
const linhas=L=>L.map(([c,t])=>`<div class="bk-l ${c}">${t}</div>`).join('');

/* o que acontece ao vincular: dest = 'm:<idRonda>' */
function planoLink(dest,keys){
  const t=dest[0],id=dest.slice(2),L=[];
  if(t==='m'){
    const p=RH.rondaPlano(id,keys),s=p.skip;
    L.push([p.add.length?'ok':'warn',`${plural(p.add.length,'item será adicionado','itens serão adicionados')} ao fim da ronda “${esc(p.m.nome)}”.`]);
    if(s.ja.length)L.push(['warn',`${plural(s.ja.length,'já faz parte desta ronda','já fazem parte desta ronda')}: ${nomes(s.ja)}.`]);
    if(s.outra.length)L.push(['warn',`${plural(s.outra.length,'já pertence a outra ronda','já pertencem a outras rondas')} (um item só pode estar em uma ronda): ${nomes(s.outra)}.`]);
    if(s.inativo.length)L.push(['warn',`${plural(s.inativo.length,'está inativo','estão inativos')} e não entra${s.inativo.length===1?'':'m'} em rondas: ${nomes(s.inativo)}.`]);
    return{add:p.add,L,nome:p.m.nome,ign:keys.length-p.add.length}}
  return{add:[],L,nome:'',ign:keys.length}}
function prevLink(){
  const v=$('#bk-dest').value,B=st.BM,btn=$('#bk-ok');
  if(!v||!B){$('#bk-prev').innerHTML='';btn.disabled=true;return}
  const p=planoLink(v,B.keys);
  $('#bk-prev').innerHTML=linhas(p.L);btn.disabled=!p.add.length;btn.textContent=p.add.length?`Vincular ${p.add.length}`:'Vincular'}
function bkLink(){
  const ks=selKeys().filter(k=>k[0]!=='c');if(!ks.length)return;
  const ms=[...S.modelos].sort(porNome);
  if(!ms.length){toast('Cadastre uma ronda antes de vincular.','bad');return}
  st.BM={tipo:'link',keys:ks};
  modal(`${mHead('Vincular '+plural(ks.length,'item','itens')+' a ronda')}
  <form id="f-bk-link" autocomplete="off"><div class="mb"><div class="bk-resumo">${nomes(ks,8)}</div>
  <label class="field"><span>Vincular a *</span><select name="dest" id="bk-dest" data-bk-dest required><option value="">Selecione uma ronda…</option>
  ${ms.length?`<optgroup label="Rondas (acrescenta ao fim do percurso)">${ms.map(m=>`<option value="m:${esc(m.id)}">${esc(m.nome)}${m.ativo===false?' (inativa)':''}</option>`).join('')}</optgroup>`:''}
  </select></label>
  <div id="bk-prev" aria-live="polite"></div></div>
  <div class="mf"><button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn pri" type="submit" id="bk-ok" disabled>Vincular</button></div></form>`)}
RH.ON_SUBMIT['f-bk-link']=async f=>{
  const dest=f.dest.value,B=st.BM;if(!dest||!B||B.tipo!=='link')return;
  const p=planoLink(dest,B.keys);if(!p.add.length)return;
  const btn=$('#bk-ok');btn.disabled=true;
  const ok=await RH.safe(async()=>{
    await RH.rondaAdicionar(dest.slice(2),B.keys);
    return true});
  if(!ok){btn.disabled=false;return}
  st.BM=null;closeModal();refreshSel();
  toast(`${plural(p.add.length,'item vinculado','itens vinculados')} a “${p.nome}”.${p.ign?` ${plural(p.ign,'ignorado','ignorados')}.`:''}`)};

function bkSetor(){
  const ks=selKeys().filter(k=>k[0]!=='c');if(!ks.length)return;
  st.BM={tipo:'setor',keys:ks};
  modal(`${mHead('Alterar setor de '+plural(ks.length,'item','itens'))}
  <form id="f-bk-setor" autocomplete="off"><div class="mb"><div class="bk-resumo">${nomes(ks,8)}</div>
  <label class="field"><span>Novo setor *</span><input type="text" name="setor" id="bk-setor" list="dl-bk-setor" required><datalist id="dl-bk-setor">${optsSetor().map(o=>`<option value="${esc(o)}">`).join('')}</datalist><small>Escolha um setor existente ou digite um novo. Vale para as salas e para os equipamentos selecionados.</small></label>
  <div class="err" id="bk-err" role="alert"></div></div>
  <div class="mf"><button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn pri" type="submit" id="bk-ok">Alterar setor</button></div></form>`)}
RH.ON_SUBMIT['f-bk-setor']=async f=>{
  const B=st.BM,novo=f.setor.value.trim();if(!B||B.tipo!=='setor')return;
  if(!novo){$('#bk-err').textContent='Informe o novo setor.';return}
  const mudar=B.keys.filter(k=>setorDe(COL_DE[k[0]],existe(k)||{})!==novo);
  if(!mudar.length){$('#bk-err').textContent='Todos os itens selecionados já estão neste setor.';return}
  const btn=$('#bk-ok');btn.disabled=true;
  const ok=await RH.safe(async()=>{for(const k of mudar)await RH.upd(COL_DE[k[0]],k.slice(2),{setor:novo});return true});
  if(!ok){btn.disabled=false;return}
  B.keys.forEach(k=>st.sel.delete(k));st.BM=null;closeModal();refreshSel();   /* saíram do filtro atual: a seleção termina aqui */
  toast(`Setor alterado para “${novo}” em ${plural(mudar.length,'item','itens')}.`)};

function bkDel(){
  const ks=selKeys();if(!ks.length)return;
  const ok=[],bloq=[];
  ks.forEach(k=>{const E=ENT[COL_DE[k[0]]],b=E.canDel?E.canDel(existe(k)):'';(b?bloq:ok).push([k,b])});
  const emRonda=ok.filter(([k])=>k[0]==='e'&&RH.rondaDoItem(k)).length;
  st.BM={tipo:'del',ok:ok.map(x=>x[0])};
  modal(`${mHead('Excluir '+plural(ks.length,'cadastro','cadastros')+'?')}
  <div class="mb">${ok.length?`<div class="bk-l bad"><b>${plural(ok.length,'será excluído permanentemente','serão excluídos permanentemente')}:</b> ${nomes(ok.map(x=>x[0]),10)}.<br>Esta ação não pode ser desfeita.${emRonda?`<br>${plural(emRonda,'equipamento faz','equipamentos fazem')} parte de rondas e ${emRonda===1?'será removido':'serão removidos'} delas.`:''}</div>`:''}
  ${bloq.length?`<div class="bk-l warn"><b>${plural(bloq.length,'não pode ser excluído','não podem ser excluídos')}:</b><ul>${bloq.slice(0,5).map(([k,b])=>`<li><b>${esc(nomeDe(k))}</b> — ${esc(b)}</li>`).join('')}</ul>${bloq.length>5?`<small>e mais ${bloq.length-5}</small>`:''}</div>`:''}</div>
  <div class="mf"><button type="button" class="btn" data-act="closeModal">Cancelar</button><button type="button" class="btn bad" data-act="bkDelGo" ${ok.length?'':'disabled'}>${ic('trash',16)} Excluir ${ok.length}</button></div>`)}
async function bkDelGo(el){
  const B=st.BM;if(!B||B.tipo!=='del'||!B.ok.length)return;
  el.disabled=true;let n=0;
  const ok=await RH.safe(async()=>{for(const k of B.ok){await RH.del(COL_DE[k[0]],k.slice(2));st.sel.delete(k);n++}return true});
  st.BM=null;closeModal();refreshSel();
  if(ok)toast(`${plural(n,'cadastro excluído','cadastros excluídos')}.`)}

/* cria a ronda já preenchida com a seleção (salas e equipamentos juntos) */
function bkRonda(){
  const ks=selKeys().filter(k=>k[0]!=='c');if(!ks.length)return;
  const p=RH.rondaPlano('',ks),ign=ks.length-p.add.length;
  if(!p.add.length){toast('Nenhum item selecionado pode entrar em uma nova ronda: já pertencem a outras rondas ou estão inativos.','bad');return}
  const sets=[...new Set(p.add.map(k=>setorDe(COL_DE[k[0]],existe(k))).filter(Boolean))];
  openEnt('modelos',null,null,{ordem:p.add,nome:sets.length===1?'Ronda '+sets[0]:''});
  if(ign)toast(`${plural(ign,'item ignorado','itens ignorados')}: já pertencem a outras rondas ou estão inativos.`)}

/* ---------- formulário ---------- */
const fotoPrev=()=>st.M.foto.thumb&&!st.M.foto.remove?`<img class="thumb" style="width:72px;height:72px" src="${st.M.foto.thumb}" alt="Foto atual">`:`<div class="thumb" style="width:72px;height:72px">${ic('dev',26)}</div>`;
const itemsHtml=()=>st.M.items.map((it,i)=>`<div class="irow"><input type="text" data-itx="${i}" value="${esc(it.t)}" placeholder="Ex.: Equipamento limpo e sem avarias" aria-label="Item ${i+1}"><button type="button" class="ic-btn" data-act="itUp" data-i="${i}" aria-label="Subir">${ic('up',14)}</button><button type="button" class="ic-btn" data-act="itDn" data-i="${i}" aria-label="Descer">${ic('dn',14)}</button><button type="button" class="ic-btn" data-act="itDel" data-i="${i}" aria-label="Remover">${ic('trash',14)}</button></div>`).join('')||'<div class="hint" style="margin-bottom:8px">Nenhum item. Adicione os pontos que o inspetor deve verificar.</div>';

/* Setor (salas e equipamentos): sequência de percurso numerada (1°, 2°, ...) */
const ordNome=k=>{const id=k.slice(2),x=k[0]==='s'?byId(S.salas,id):byId(S.equipamentos,id);return x};
/* "Liberar com": uma sala/equipamento da ronda funciona como chave; ao ler o código dele (e conferir a antena dele) os vinculados são liberados */
function libSel(k){
  const lib=st.M.liberacao,o=st.M.ordem,nDep=Object.values(lib).filter(v=>v===k).length;
  if(o.length<2)return '';
  if(nDep)return `<small class="mono" title="Os locais vinculados são liberados ao ler o código deste">Libera ${nDep}</small>`;
  const opts=o.filter(x=>x!==k&&!lib[x]&&ordNome(x)).map(x=>`<option value="${esc(x)}" ${lib[k]===x?'selected':''}>${esc(ordNome(x).nome)}</option>`).join('');
  return `<select data-lib="${esc(k)}" aria-label="Liberar com" style="max-width:190px"><option value="">Código próprio</option>${opts}</select>`}
function ordemHtml(){
  const o=st.M.ordem;
  return o.map((k,i)=>{const x=ordNome(k);if(!x)return '';const sala=k[0]==='s',inat=x.ativo===false?' <small>(inativ'+(sala?'a':'o')+')</small>':'';
    return `<div class="irow ord-row"><span class="ord-n" aria-label="Posição ${i+1}">${i+1}°</span><span class="ord-t"><span class="tag ${sala?'tag-s':'tag-e'}">${sala?'Sala':'Equipamento'}</span> ${esc(x.nome)}${inat} <small>${esc((sala?x.setor:RH.setorEq(x))||'Sem setor')}</small></span>${libSel(k)}<button type="button" class="ic-btn" data-act="ordUp" data-i="${i}" aria-label="Subir">${ic('up',14)}</button><button type="button" class="ic-btn" data-act="ordDn" data-i="${i}" aria-label="Descer">${ic('dn',14)}</button><button type="button" class="ic-btn" data-act="ordDel" data-i="${i}" aria-label="Remover">${ic('trash',14)}</button></div>`}).join('')||'<div class="hint" style="margin-bottom:8px">Nenhuma sala ou equipamento. Adicione na ordem em que a inspeção deve ser feita.</div>'}
/* salas e equipamentos já vinculados a outra ronda não podem ser escolhidos novamente */
const usadosEmOutras=()=>new Set(S.modelos.filter(m=>m.id!==st.M.id).flatMap(m=>RH.ordemDaRonda(m)));
function ordemOpts(){
  const usados=new Set([...st.M.ordem,...usadosEmOutras()]),sn=x=>x||'Sem setor',g={};
  S.salas.filter(s=>s.ativo!==false&&!usados.has('s:'+s.id)).forEach(s=>(g[sn(s.setor)]??=[]).push(['s:'+s.id,'Sala · '+s.nome]));
  S.equipamentos.filter(e=>e.ativo!==false&&!usados.has('e:'+e.id)).forEach(e=>(g[sn(RH.setorEq(e))]??=[]).push(['e:'+e.id,'Equipamento · '+e.nome]));
  const ks=Object.keys(g).sort((a,b)=>a.localeCompare(b));
  return '<option value="">Selecione uma sala ou equipamento…</option>'+ks.map(k=>`<optgroup label="${esc(k)}">${g[k].map(([v,n])=>`<option value="${esc(v)}">${esc(n)}</option>`).join('')}</optgroup>`).join('')}
const ordemRefresh=()=>{$('#ord-list').innerHTML=ordemHtml();$('#ord-add').innerHTML=ordemOpts()};
function salasPicker(f){
  return `<div class="full"><span class="hint" style="font-weight:600;color:var(--ink2)">${esc(f.l)} *</span><div id="ord-list" style="margin-top:6px">${ordemHtml()}</div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0"><select id="ord-add" aria-label="Adicionar sala ou equipamento" style="flex:1;min-width:200px">${ordemOpts()}</select><button type="button" class="btn sm" data-act="ordAdd">${ic('plus',14)} Adicionar</button></div>
  <small>Itens já vinculados a outra ronda não aparecem na lista. Salas e equipamentos são inspecionados na ordem numerada (1° é o primeiro), com os itens a verificar de cada um.</small>
  <small style="display:block;margin-top:4px"><b>Liberar com:</b> para bloquear vários locais e liberá-los todos de uma vez, escolha em cada um a sala/equipamento-chave. Ao ler o código da chave (na antena Wi-Fi dela) todos os vinculados são liberados.</small></div>`}

/* dias da semana + horários em que a ronda deve ser realizada */
const horasHtml=()=>st.M.horarios.map((h,i)=>`<div class="irow"><input type="time" data-hx="${i}" value="${esc(h)}" required aria-label="Horário ${i+1}"><button type="button" class="ic-btn" data-act="agDelH" data-i="${i}" aria-label="Remover horário">${ic('trash',14)}</button></div>`).join('')||'<div class="hint" style="margin-bottom:8px">Nenhum horário. Adicione ao menos um.</div>';
function agendaPicker(f){
  const on=new Set(st.M.dias);
  return `<div class="full"><span class="hint" style="font-weight:600;color:var(--ink2)">${esc(f.l)} *</span>
  <div class="dias" id="ag-dias" style="margin-top:6px">${RH.agenda.DIAS.map((n,i)=>`<label class="dia"><input type="checkbox" data-dia value="${i}" ${on.has(i)?'checked':''}> ${n}</label>`).join('')}</div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0"><button type="button" class="btn sm" data-act="agDias" data-v="todos">Todos os dias</button><button type="button" class="btn sm" data-act="agDias" data-v="uteis">Segunda a sexta</button></div>
  <div id="ag-horas">${horasHtml()}</div>
  <button type="button" class="btn sm" data-act="agAddH">${ic('plus',14)} Adicionar horário</button>
  <div><small>A ronda deve ser feita em cada dia marcado, em cada horário. Fica "em atraso" 1 hora depois do horário sem ser realizada.</small></div></div>`}

function fieldHtml(f,v){
  const cls=f.full?'field full':'field',id='ff-'+f.k;
  if(f.t==='check')return `<label class="chk ${f.full?'full':''}"><input type="checkbox" name="${f.k}" id="${id}" ${v?'checked':''}> ${esc(f.l)}</label>`;
  if(f.t==='salas')return salasPicker(f,v);
  if(f.t==='agenda')return agendaPicker(f);
  if(f.t==='items')return `<div class="full"><span class="hint" style="font-weight:600;color:var(--ink2)">${esc(f.l)}</span><div id="items" style="margin-top:8px">${itemsHtml()}</div><button type="button" class="btn sm" data-act="itAdd">${ic('plus',14)} Adicionar item</button></div>`;
  if(f.t==='photo')return `<div class="full"><span class="hint" style="font-weight:600;color:var(--ink2)">${esc(f.l)}</span><div style="display:flex;gap:12px;align-items:center;margin-top:8px;flex-wrap:wrap"><div id="foto-prev">${fotoPrev()}</div><label class="btn sm" style="cursor:pointer">${ic('cam',16)} Escolher imagem<input class="sr" type="file" accept="image/*" id="ff-foto" data-ent-foto></label><button type="button" class="btn sm" data-act="rmEntFoto">Remover</button></div></div>`;
  let inp;
  if(f.t==='codigo')inp=`<div style="display:flex;gap:8px"><input type="text" name="${f.k}" id="${id}" value="${esc(v??'')}" autocomplete="off" autocapitalize="characters" spellcheck="false" class="mono" style="flex:1"><button type="button" class="btn sm" data-act="genCodigo" style="min-height:38px">Gerar código</button></div>`;
  else if(f.t==='bssids')inp=`<textarea name="${f.k}" id="${id}" rows="3" class="mono" spellcheck="false" autocapitalize="off">${esc(v||'')}</textarea><div><button type="button" class="btn sm" data-act="capBssid">${ic('check',14)} Ler a antena deste aparelho agora</button></div>`;
  else if(f.t==='select')inp=`<select name="${f.k}" id="${id}" ${f.req?'required':''}>${f.blank!==undefined?`<option value="">${f.blank}</option>`:''}${f.opts().map(([o,l])=>`<option value="${esc(o)}" ${String(v)===String(o)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  else if(f.t==='textarea')inp=`<textarea name="${f.k}" id="${id}">${esc(v||'')}</textarea>${f.sugerir?`<div><button type="button" class="btn sm" data-act="genOrient">${ic('check',14)} Gerar sugestão a partir do nome</button></div>`:''}`;
  else if(f.t==='password')inp=`<div style="display:flex;gap:8px"><input type="text" class="pw" name="${f.k}" id="${id}" value="" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" style="flex:1"><button type="button" class="btn sm" data-act="genPw" style="min-height:38px">Gerar senha forte</button></div>`;
  else inp=`<input type="${f.t||'text'}" name="${f.k}" id="${id}" value="${esc(v??'')}" ${f.req?'required':''} ${f.list?`list="dl-${f.k}"`:''}>${f.list?`<datalist id="dl-${f.k}">${f.list().map(o=>`<option value="${esc(o)}">`).join('')}</datalist>`:''}`;
  return `<label class="${cls}"><span>${esc(f.l)}${f.req?' *':''}</span>${inp}${f.hint?`<small>${esc(f.hint)}</small>`:''}</label>`;
}

/* duplicar: abre o formulário de novo cadastro já preenchido com os dados do original */
function preparaCopia(ent,d){
  d.nome=(d.nome||'')+' (cópia)';
  if(ent==='users'){d.login='';d.hash=null;d.salt=null}
  if(ent==='salas'||ent==='equipamentos')d.codigoLocal='';   /* o código identifica um único local */
  if(ent==='checklists'||ent==='salas'||ent==='equipamentos')d.itens=(d.itens||[]).map(x=>({...x,id:'i'+uid()}));
  delete d.id;delete d.demo}
function openEnt(ent,id,dupId,pre){
  const E=ENT[ent],d=id||dupId?{...byId(S[E.col],id||dupId)}:{};
  if(dupId)preparaCopia(ent,d);
  if((ent==='salas'||ent==='equipamentos')&&!(d.itens||[]).length&&d.checklistId)d.itens=(byId(S.checklists,d.checklistId)?.itens||[]).map(x=>({...x}));   /* cadastro antigo: traz os itens do checklist vinculado */
  if(pre&&pre.nome)d.nome=pre.nome;
  if(ent==='equipamentos'&&!d.setor)d.setor=RH.setorEq(d);
  st.M={ent,id,ordem:ent==='modelos'?(pre?.ordem?[...pre.ordem]:dupId?[]:RH.ordemDaRonda(d)):null,fromBulk:!!pre,liberacao:ent==='modelos'&&!dupId?{...(d.liberacao||{})}:{},items:(d.itens||[]).map(x=>({...x})),foto:{thumb:d.thumb||null,fotoId:d.fotoId||null,full:null,remove:false},armed:false};
  if((ent==='checklists'||ent==='salas'||ent==='equipamentos')&&!st.M.items.length)st.M.items=[{id:'i'+uid(),t:''}];
  /* agenda da ronda (padrão: segunda a sexta às 08:00; ronda antiga sem agenda: todos os dias) */
  st.M.dias=RH.agenda.temAgenda(d)?[...d.dias]:(id?[0,1,2,3,4,5,6]:[1,2,3,4,5]);
  st.M.horarios=RH.agenda.temAgenda(d)?[...d.horarios]:['08:00'];
  st.M.orientManual=!!(d.orient||'').trim();
  const fieldHtml2=f=>fieldHtml(f,d[f.k]??(f.def??(f.t==='check'?false:f.t==='salas'?[]:'')));
  modal(`<div class="mh"><h3 style="font-size:16px">${dupId?'Duplicar':id?'Editar':'Adicionar'} ${E.um}</h3><button class="ic-btn" data-act="closeModal" aria-label="Fechar">${ic('x',16)}</button></div>
  <form id="f-ent" autocomplete="off" ${E.tabs?'novalidate':''}>${E.tabs?`<div class="tabs ent-tabs" role="tablist" style="padding:0 20px;margin-bottom:0">${E.tabs.map(([k,l],i)=>`<button type="button" role="tab" id="et-${k}" aria-controls="ep-${k}" data-act="entTab" data-k="${k}" aria-selected="${i===0}">${l}</button>`).join('')}</div>`:''}<div class="mb">${E.tabs?E.tabs.map(([k],i)=>`<div class="fg" role="tabpanel" id="ep-${k}" aria-labelledby="et-${k}" ${i?'hidden':''}>${E.fields.filter(f=>f.tab===k).map(fieldHtml2).join('')}</div>`).join(''):`<div class="fg">${E.fields.map(fieldHtml2).join('')}</div>`}<div class="err" id="ent-err" role="alert"></div></div>
  <div class="mf">${id?`<button type="button" class="btn bad sp" data-act="delEnt" id="btn-del">${ic('trash',16)} Excluir</button>`:''}<button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></form>`,true);
  if(ent==='tiposNC'&&!st.M.orientManual&&d.nome)$('#ff-orient').value=RH.sugerirOrientacao(d.nome);
}

function entTab(el){
  const k=el.dataset.k;
  document.querySelectorAll('#f-ent .ent-tabs [role=tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.k===k)));
  document.querySelectorAll('#f-ent [role=tabpanel]').forEach(p=>{p.hidden=p.id!=='ep-'+k})}

async function saveEnt(form){
  const M=st.M,E=ENT[M.ent],err=m=>{$('#ent-err').textContent=m},data={},old=M.id?byId(S[E.col],M.id):null;
  for(const f of E.fields){
    if(f.t==='photo')continue;
    if(f.t==='items'){data[f.k]=M.items.filter(x=>x.t.trim()).map(x=>({id:x.id,t:x.t.trim()}));if(M.ent==='checklists'&&!data[f.k].length)return err('Adicione ao menos um item ao checklist.');continue}
    if(f.t==='agenda'){
      const dias=[...form.querySelectorAll('[data-dia]:checked')].map(x=>+x.value),hs=[...new Set(M.horarios.filter(RH.agenda.validaHora))].sort();
      if(!dias.length)return err('Marque ao menos um dia da semana para a ronda.');
      if(!hs.length)return err('Informe ao menos um horário para a ronda.');
      data.dias=dias;data.horarios=hs;continue}
    if(f.t==='salas'){data.ordem=M.ordem.filter(k=>ordNome(k));data[f.k]=data.ordem.filter(k=>k[0]==='s').map(k=>k.slice(2));data.equipIds=data.ordem.filter(k=>k[0]==='e').map(k=>k.slice(2));{const uso=usadosEmOutras(),rep=data.ordem.find(k=>uso.has(k));if(rep)return err((rep[0]==='s'?'A sala ':'O equipamento ')+ordNome(rep).nome+' já está vinculad'+(rep[0]==='s'?'a':'o')+' a outra ronda.')}
    if(!data.ordem.length)return err('Marque ao menos uma sala ou um equipamento para a ronda.');
    {const lib={};Object.entries(M.liberacao).forEach(([d,k])=>{if(d!==k&&data.ordem.includes(d)&&data.ordem.includes(k)&&!M.liberacao[k])lib[d]=k});
     const sem=[...new Set(Object.values(lib))].map(ordNome).find(x=>x&&!x.codigoLocal);
     if(sem)return err(`Para liberar vários locais com "${sem.nome}", cadastre um código de barras nele (Cadastros → Salas/Equipamentos).`);
     data.liberacao=lib}
    continue}
    if(f.t==='check'){data[f.k]=form.elements[f.k].checked;continue}
    if(f.t==='password')continue;
    let v=(form.elements[f.k].value||'').trim();
    if(f.t==='number')v=v===''?null:+v;
    if(f.k==='sev')v=+v;
    if(f.req&&(v===''||v==null)){if(f.tab)entTab({dataset:{k:f.tab}});return err(`Preencha o campo: ${f.l}`)}
    data[f.k]=v}
  if(M.ent==='salas'||M.ent==='equipamentos'){const e=RH.local.validaCadastro(data,M.ent,M.id);if(e)return err(e)}
  if(M.ent==='users'){
    const login=data.login.toLowerCase();
    if(S.users.some(u=>u.id!==M.id&&(u.login||'').toLowerCase()===login))return err('Já existe um usuário com este login.');
    data.login=login;
    const pw=form.elements.senha.value;
    if(pw){const pe=RH.checkSenha(pw);if(pe)return err(pe);data.salt=uid()+uid();data.hash=await RH.hash(pw,data.salt)}
    else if(!old?.hash)return err('Defina uma senha para este usuário.');
    if(old&&old.id===st.me.id&&(data.ativo===false||data.role!=='admin'))return err('Você não pode remover o próprio acesso de administrador.');
    if(old&&data.ativo===false){const n=S.modelos.filter(m=>m.responsavelId===old.id&&m.ativo!==false).length;if(n)return err(`Este usuário é responsável por ${n} ronda${n>1?'s':''}. Troque o responsável antes de desativar.`)}
  }
  if(M.ent==='modelos'){
    data.responsavelId=data.responsavelId||'';data.freq=null;
    /* horários anteriores à criação/alteração da agenda não contam como "atraso" */
    if(!old||JSON.stringify([old.dias,old.horarios])!==JSON.stringify([data.dias,data.horarios]))data.agendaDesde=Date.now()}
  if(M.ent==='tiposNC'&&!data.orient)data.orient=RH.sugerirOrientacao(data.nome);
  const id=M.id||(E.col[0]+uid());
  if(M.ent==='equipamentos'){
    if(M.foto.remove){data.thumb=null;data.fotoId=null}
    else if(M.foto.full){const fid=M.foto.fotoId||'f'+uid();const okf=await RH.safe(async()=>{await RH.put('fotos',fid,{data:M.foto.full});return true});if(!okf)return;data.thumb=M.foto.thumb;data.fotoId=fid}
    else{data.thumb=M.foto.thumb;data.fotoId=M.foto.fotoId}
  }
  const rec=old?{...old,...data}:data;delete rec.id;
  if(M.ent==='salas'||M.ent==='equipamentos')rec.checklistId='';   /* os itens agora ficam no próprio cadastro */
  if(M.ent==='equipamentos'){delete rec.patrimonio;delete rec.categoria;delete rec.obs}   /* campos removidos do cadastro */
  const ok=await RH.safe(async()=>{await RH.put(E.col,id,rec);return true});
  if(ok){const lote=M.fromBulk;closeModal();if(lote){(data.ordem||[]).forEach(k=>st.sel.delete(k));refreshSel()}toast(lote?`Ronda criada com ${(data.ordem||[]).length} item(ns) da seleção.`:'Cadastro salvo.')}
}

async function deleteEnt(){
  const M=st.M,E=ENT[M.ent],d=byId(S[E.col],M.id),b=E.canDel&&E.canDel(d);
  if(b){$('#ent-err').textContent=b;return}
  if(!M.armed){M.armed=true;$('#btn-del').textContent='Confirmar exclusão';return}
  if(await RH.safe(async()=>{await RH.del(E.col,M.id);return true})){closeModal();toast('Cadastro excluído.')}
}

/* ---------- etiquetas com QR Code / código de barras ---------- */
const comCodigo=()=>S[st.cadTab].filter(x=>x.ativo!==false&&x.codigoLocal).sort((a,b)=>((a.setor||RH.setorEq(a)||'')+a.nome).localeCompare((b.setor||RH.setorEq(b)||'')+b.nome));
const semCodigo=()=>S[st.cadTab].filter(x=>x.ativo!==false&&!x.codigoLocal);
function etqGrid(){
  const fmt=st.etqFmt||'qr',rows=comCodigo();
  if(!rows.length)return '<div class="empty"><b>Nenhum local com código</b>Cadastre o código em cada local (use "Gerar código" no cadastro).</div>';
  return rows.map(x=>{
    let img;try{img=fmt==='qr'?RH.barcode.qrSvg(x.codigoLocal):RH.barcode.code128Svg(x.codigoLocal)}catch(e){img=`<small class="err">${esc(e.message)}</small>`}
    return `<div class="etq ${fmt}"><div class="etq-img">${img}</div><div class="etq-t"><b>${esc(x.nome)}</b><span>${esc((st.cadTab==='salas'?x.setor:RH.setorEq(x))||'')}${x.andar?' · '+esc(x.andar):''}</span><code>${esc(x.codigoLocal)}</code><small>Ronda Hospitalar · leia ao chegar neste local</small></div></div>`}).join('')}
function etqBar(){
  const fmt=st.etqFmt||'qr',n=semCodigo().length;
  return `<span>Formato:</span><button type="button" class="btn sm" data-act="etqFmt" data-v="qr" aria-pressed="${fmt==='qr'}">QR Code</button><button type="button" class="btn sm" data-act="etqFmt" data-v="c128" aria-pressed="${fmt==='c128'}">Código de barras</button>
  ${n?`<span class="pill late">${n} sem código</span>`:''}`}
function etqOpen(){
  const E=ENT[st.cadTab];
  modal(`<div class="mh"><h3 style="font-size:16px">Etiquetas · ${E.nome}</h3><button class="ic-btn" data-act="closeModal" aria-label="Fechar">${ic('x',16)}</button></div>
  <div class="mb"><div class="no-print etq-bar" id="etq-bar">${etqBar()}</div><small class="no-print">Imprima em tamanho real (100%), preto sobre branco, e recorte nas linhas. Teste a leitura com o app antes de colar.</small><div class="etq-grid" id="etq-grid">${etqGrid()}</div></div>
  <div class="mf"><button type="button" class="btn" data-act="closeModal">Fechar</button><button type="button" class="btn pri" data-act="etqPrint">${ic('check',16)} Imprimir</button></div>`,true)}

/* ---------- eventos ---------- */
Object.assign(RH.ACT,{
  selRow:(el,e)=>{const cb=el.querySelector('input'),k=keyOf(el.dataset.id);if(e.target!==cb)cb.checked=!cb.checked;cb.checked?st.sel.add(k):st.sel.delete(k);refreshSel()},
  selAll:el=>{visiveis().forEach(r=>el.checked?st.sel.add(keyOf(r.id)):st.sel.delete(keyOf(r.id)));refreshSel()},
  selClear:()=>{selKeys().forEach(k=>st.sel.delete(k));refreshSel()},
  cfClear:()=>{const f=st.CF[st.cadTab];if(f)Object.keys(f).forEach(k=>f[k]='');RH.renderView(true)},
  bkLink,bkSetor,bkDel,bkDelGo,bkRonda,
  etqOpen,
  etqFmt:el=>{st.etqFmt=el.dataset.v;$('#etq-grid').innerHTML=etqGrid();$('#etq-bar').innerHTML=etqBar()},
  etqPrint:()=>{document.body.classList.add('print-modal');const f=()=>{document.body.classList.remove('print-modal');removeEventListener('afterprint',f)};addEventListener('afterprint',f);print()},
  agDias:el=>{document.querySelectorAll('[data-dia]').forEach(c=>{const d=+c.value;c.checked=el.dataset.v==='todos'||(d>=1&&d<=5)})},
  agAddH:()=>{st.M.horarios.push('');$('#ag-horas').innerHTML=horasHtml();const i=document.querySelectorAll('[data-hx]');i[i.length-1]?.focus()},
  agDelH:el=>{st.M.horarios.splice(+el.dataset.i,1);$('#ag-horas').innerHTML=horasHtml()},
  genOrient:()=>{const n=($('#ff-nome')?.value||'').trim();if(!n){toast('Digite primeiro o nome do tipo.','bad');return}
    $('#ff-orient').value=RH.sugerirOrientacao(n);st.M.orientManual=false},
  cadTab:el=>{st.cadTab=el.dataset.k;try{sessionStorage.setItem('rh_cadtab',st.cadTab)}catch(e){}RH.renderView()},
  newEnt:()=>openEnt(st.cadTab), editEnt:el=>openEnt(st.cadTab,el.dataset.id), dupEnt:el=>openEnt(st.cadTab,null,el.dataset.id),
  delEnt:deleteEnt,entTab,
  itAdd:()=>{st.M.items.push({id:'i'+uid(),t:''});$('#items').innerHTML=itemsHtml();const i=document.querySelectorAll('[data-itx]');i[i.length-1]?.focus()},
  itDel:el=>{st.M.items.splice(+el.dataset.i,1);$('#items').innerHTML=itemsHtml()},
  ordAdd:()=>{const v=$('#ord-add').value;if(v){st.M.ordem.push(v);ordemRefresh()}},
  ordDel:el=>{const [k]=st.M.ordem.splice(+el.dataset.i,1),lib=st.M.liberacao;delete lib[k];Object.keys(lib).forEach(d=>{if(lib[d]===k)delete lib[d]});ordemRefresh()},
  ordUp:el=>{const i=+el.dataset.i,o=st.M.ordem;if(i>0){[o[i-1],o[i]]=[o[i],o[i-1]];ordemRefresh()}},
  ordDn:el=>{const i=+el.dataset.i,o=st.M.ordem;if(i<o.length-1){[o[i+1],o[i]]=[o[i],o[i+1]];ordemRefresh()}},
  itUp:el=>{const i=+el.dataset.i,M=st.M;if(i>0){[M.items[i-1],M.items[i]]=[M.items[i],M.items[i-1]];$('#items').innerHTML=itemsHtml()}},
  itDn:el=>{const i=+el.dataset.i,M=st.M;if(i<M.items.length-1){[M.items[i+1],M.items[i]]=[M.items[i],M.items[i+1]];$('#items').innerHTML=itemsHtml()}},
  rmEntFoto:()=>{st.M.foto.remove=true;st.M.foto.full=null;$('#foto-prev').innerHTML=fotoPrev()},
  genPw:()=>{const pw=RH.senhaForte();const i=document.getElementById('ff-senha');i.value=pw;i.classList.add('show');const h=i.closest('label').querySelector('small');if(h)h.textContent='Anote esta senha e entregue ao usuário. Depois de salvar ela não poderá ser exibida de novo.'},
  seedDemo:async el=>{el.disabled=true;st.busy=true;await RH.seedDemo('#seed-prog');st.busy=false;toast('Dados de exemplo carregados.');RH.renderView(true)},
  wipeDemo:async el=>{el.disabled=true;st.busy=true;await RH.wipeDemo();st.busy=false;RH.renderView(true)},
  exportBackup:async el=>{el.disabled=true;try{const b=new Blob([await RH.store.exportJSON()],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='ronda-hospitalar-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast('Backup exportado.')}catch(e){toast('Não foi possível exportar o backup.','bad')}el.disabled=false},
  changeCode:()=>RH.store.changeCode(),
  genCodigo:()=>{$('#ff-codigoLocal').value=RH.local.gerarCodigo(st.cadTab==='salas'?'S':'E')},
  capBssid:async el=>{
    el.disabled=true;const r=await RH.local.lerBssid();el.disabled=false;
    if(!r.ok){toast(r.msg,'bad');return}
    const t=$('#ff-bssids'),l=RH.local.parseBssids(t.value).lista;
    if(!l.includes(r.valor))l.push(r.valor);t.value=l.join('\n');toast('Antena '+r.valor+' adicionada.')},
});
RH.ON_CHANGE.push(async el=>{
  if(el.dataset.cf){const f=st.CF[st.cadTab];if(f){f[el.dataset.cf]=el.value;RH.renderView(true)}return true}
  if(el.dataset.bkDest!=null){prevLink();return true}
  if(el.dataset.lib!=null){if(el.value)st.M.liberacao[el.dataset.lib]=el.value;else delete st.M.liberacao[el.dataset.lib];ordemRefresh();return true}
  if(el.dataset.import!=null){if(el.files[0]){try{const n=await RH.store.importJSON(await el.files[0].text());toast(n+' registros importados.')}catch(err){toast(err.message||'Não foi possível importar o arquivo.','bad')}el.value=''}return true}
  if(el.dataset.entFoto!=null){if(el.files[0]){try{Object.assign(st.M.foto,await RH.processImg(el.files[0]),{remove:false});$('#foto-prev').innerHTML=fotoPrev()}catch(err){toast('Não foi possível ler a imagem.','bad')}}return true}
  return false});
RH.ON_INPUT.push(el=>{
  if(el.dataset.itx!=null){st.M.items[+el.dataset.itx].t=el.value;return true}
  if(el.dataset.hx!=null){st.M.horarios[+el.dataset.hx]=el.value;return true}
  /* Tipos de NC: a orientação acompanha o nome enquanto a pessoa não a editar à mão */
  if(st.M&&st.M.ent==='tiposNC'){
    if(el.id==='ff-nome'&&!st.M.orientManual){$('#ff-orient').value=RH.sugerirOrientacao(el.value);return true}
    if(el.id==='ff-orient'){st.M.orientManual=el.value.trim()!=='';return true}}
  return false});
RH.ON_SUBMIT['f-ent']=saveEnt;
RH.ON_SUBMIT['f-cfg']=async f=>{
  const ok=await RH.safe(async()=>{await RH.put('config','main',{...S.cfg,hospital:f.hospital.value.trim(),meta:+f.meta.value||95,valLocal:f.valLocal.value,valBssid:f.valBssid.value});return true});
  if(ok){toast('Dados salvos.');st.screen='';RH.renderRoot()}};
})();
