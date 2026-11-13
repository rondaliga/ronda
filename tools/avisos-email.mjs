#!/usr/bin/env node
/* ==========================================================================
   Avisos por e-mail — roda no GitHub Actions (.github/workflows/avisos-email.yml) a cada ~10 min.
   Lê o banco (Supabase) pelas MESMAS funções do aplicativo (rh_pull / rh_put_many, com o código de acesso da equipe)
   e envia, por e-mail, aos responsáveis:
     • NC nova com severidade >= a configurada (padrão: Alta);
     • ronda em atraso (mesma regra do painel, usando js/core/agenda.js).
   O que já foi avisado fica no documento `avisos/estado` do próprio banco (nada é enviado duas vezes).
   Na 1ª execução só registra a linha de base (não envia o histórico antigo).

   Segredos (GitHub → Settings → Secrets and variables → Actions):
     RONDA_CODIGO   código de acesso da equipe (o mesmo pedido ao abrir o app)
     EMAIL_API_KEY  chave da API do provedor de e-mail
     EMAIL_FROM     e-mail remetente (verificado no provedor)
   Opcionais: EMAIL_PROVIDER (brevo | resend; padrão brevo), EMAIL_FROM_NAME, SITE_URL, RONDA_URL, RONDA_KEY.
   Uso:  node tools/avisos-email.mjs            (normal)
         node tools/avisos-email.mjs --teste    (envia um e-mail de teste aos administradores)
   ========================================================================== */
process.env.TZ=process.env.TZ||'America/Fortaleza';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const RAIZ=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const SEV={1:'Baixa',2:'Média',3:'Alta',4:'Crítica'};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fdt=t=>new Date(t).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
const dia=t=>new Date(t).toLocaleDateString('pt-BR');

/* ---------- configuração e agenda ---------- */
export function lerConfig(raiz=RAIZ){
  const src=fs.readFileSync(path.join(raiz,'js/config.js'),'utf8');
  const g=k=>(src.match(new RegExp(k+'\\s*:\\s*["\']([^"\']*)["\']'))||[])[1]||'';
  return {url:(process.env.RONDA_URL||g('supabaseUrl')).replace(/\/+$/,''),key:process.env.RONDA_KEY||g('supabaseKey')}}
export function carregarAgenda(raiz=RAIZ){
  const w={RH:{}};new Function('window',fs.readFileSync(path.join(raiz,'js/core/agenda.js'),'utf8'))(w);return w.RH.agenda}

/* ---------- acesso ao banco (mesmas funções do aplicativo) ---------- */
export function criarCliente({url,key,codigo,fetchImpl=fetch}){
  const h={'Content-Type':'application/json',apikey:key};if(key.startsWith('eyJ'))h.Authorization='Bearer '+key;
  const rpc=async(fn,args)=>{
    const r=await fetchImpl(`${url}/rest/v1/rpc/${fn}`,{method:'POST',headers:h,body:JSON.stringify({p_code:codigo,...args})});
    const t=await r.text();if(!r.ok)throw new Error(`${fn}: HTTP ${r.status} ${t.slice(0,200)}`);return t?JSON.parse(t):null};
  return {
    pull:async desde=>{const todas=[];let de=desde;for(;;){const rows=await rpc('rh_pull',{p_since:de,p_fotos:false})||[];if(!rows.length)break;todas.push(...rows);de=rows[rows.length-1].seq;if(rows.length<1000)break}return todas},
    get:p=>rpc('rh_get',{p_path:p}),
    put:(p,d)=>rpc('rh_put_many',{p_items:[{p,d}]})}}

/* ---------- estado guardado no banco (documento avisos/estado) ---------- */
const novoEstado=()=>({v:1,seq:0,pend:{},cfg:{},users:{},salas:{},modelos:{},lastRun:{},enviados:{},ultimaExec:0,ultimoEnvio:0,total:0,erro:''});
const col=p=>p.slice(0,p.indexOf('/')),id=p=>p.slice(p.indexOf('/')+1);

/* aplica as linhas novas do banco ao cache do estado; devolve as NCs novas */
export function aplicar(estado,rows){
  const ncs=[];
  for(const r of rows){
    const c=col(r.p),i=id(r.p);
    if(r.seq>estado.seq)estado.seq=r.seq;
    if(c==='config'&&i==='main')estado.cfg=r.deleted?{}:{hospital:r.d.hospital||'',avisos:r.d.avisos||{}};
    else if(c==='users')r.deleted?delete estado.users[i]:estado.users[i]={nome:r.d.nome||'',email:(r.d.email||'').trim(),role:r.d.role||'',ativo:r.d.ativo!==false};
    else if(c==='salas')r.deleted?delete estado.salas[i]:estado.salas[i]={nome:r.d.nome||'',setor:r.d.setor||'',responsavelId:r.d.responsavelId||''};
    else if(c==='modelos')r.deleted?delete estado.modelos[i]:estado.modelos[i]={nome:r.d.nome||'',ativo:r.d.ativo!==false,dias:r.d.dias,horarios:r.d.horarios,agendaDesde:r.d.agendaDesde,freq:r.d.freq,responsavelId:r.d.responsavelId||''};
    else if(c==='rondas'&&!r.deleted&&r.d.modeloId&&r.d.ts>(estado.lastRun[r.d.modeloId]||0))estado.lastRun[r.d.modeloId]=r.d.ts;
    else if(c==='ncs'&&!r.deleted)ncs.push({id:i,...r.d})}
  return ncs}

/* ---------- decisão: quem recebe o quê ---------- */
/* Regra de horário por NC: Crítica (4) é avisada na hora; Média (2) e Alta (3) só depois de `horas` (padrão 8 h)
   do registro, e apenas se ainda estiverem abertas. `estado.pend` guarda as NCs que aguardam esse prazo
   (e também as que falharam no envio, para tentar de novo). `vencidas` = NCs de `pend` já lidas do banco. */
export const HORAS_PADRAO=8;
export function decidir(estado,ncsNovas,agenda,agora,vencidas=[]){
  const av=Object.assign({ativo:false,sevMin:3,copiaAdmin:true,horas:HORAS_PADRAO},estado.cfg.avisos||{});
  estado.pend=estado.pend||{};
  const espera=(+av.horas>=0?+av.horas:HORAS_PADRAO)*36e5;
  const admins=Object.entries(estado.users).filter(([,u])=>u.role==='admin'&&u.ativo&&u.email).map(([i,u])=>({id:i,...u}));
  const dest=uid=>{
    const out=new Map(),u=uid&&estado.users[uid];
    if(u&&u.ativo&&u.email)out.set(u.email.toLowerCase(),u);
    if(av.copiaAdmin||!out.size)admins.forEach(a=>out.set(a.email.toLowerCase(),a));
    return [...out.keys()]};
  const itens=[];
  for(const n of ncsNovas){
    const key='nc:'+n.id,sev=+n.sev||0;
    if(sev<av.sevMin||n.status!=='aberta'){delete estado.pend[n.id];continue}
    if(sev>=4){if(agora-(n.ts||0)<=36e5*36)itens.push({tipo:'nc',key,para:dest(n.resp),nc:n});continue}
    if(!estado.pend[n.id])estado.pend[n.id]={due:(n.ts||agora)+espera}}
  for(const n of vencidas)itens.push({tipo:'nc',key:'nc:'+n.id,para:dest(n.resp),nc:{...n,horas:Math.max(0,Math.round((agora-(n.ts||agora))/36e5))}});
  for(const [mid,m] of Object.entries(estado.modelos)){
    if(!m.ativo)continue;
    const last=estado.lastRun[mid]??null;
    if(!agenda.atrasada(m,last,agora))continue;
    const slot=agenda.temAgenda(m)?agenda.ultimo(m,agora):(last||0);
    itens.push({tipo:'atraso',key:`atraso:${mid}:${slot}`,para:dest(m.responsavelId),ronda:m,slot,temAgenda:agenda.temAgenda(m)})}
  return {av,itens}}

/* ---------- e-mail ---------- */
export function montarEmail({hospital,itens,siteUrl}){
  const ncs=itens.filter(i=>i.tipo==='nc'),at=itens.filter(i=>i.tipo==='atraso');
  const pre=`[Ronda${hospital?' · '+hospital:''}]`;
  let assunto;
  if(itens.length===1&&ncs.length===1){const n=ncs[0].nc;assunto=`${pre} NC ${SEV[n.sev]||''} · ${n.setor||n.salaNome||''}: ${n.tipoNome||n.itemTexto||''}`}
  else if(itens.length===1)assunto=`${pre} Ronda atrasada: ${at[0].ronda.nome}`;
  else assunto=`${pre} ${itens.length} avisos: ${[ncs.length&&`${ncs.length} NC${ncs.length>1?'s':''}`,at.length&&`${at.length} ronda${at.length>1?'s':''} atrasada${at.length>1?'s':''}`].filter(Boolean).join(' e ')}`;
  const L=[],H=[];
  ncs.forEach(({nc:n})=>{
    const local=[n.salaNome,n.eqNome,n.setor].filter(Boolean).join(' · ');
    const aberta=n.horas>=1?`Ainda aberta ${n.horas} hora${n.horas>1?'s':''} após o registro.\n`:'';
    L.push(`NÃO CONFORMIDADE ${(SEV[n.sev]||'').toUpperCase()}\n${aberta}${local}\n${n.tipoNome||''} — ${n.itemTexto||''}\n${n.desc||''}\nRegistrada por ${n.inspNome||'—'} em ${fdt(n.ts)}\n`);
    H.push(`<div style="border-left:5px solid ${n.sev>=4?'#b4232a':'#d97706'};background:#f6f8f9;padding:12px 14px;margin:0 0 12px;border-radius:6px"><b style="font-size:15px">NC ${esc(SEV[n.sev]||'')} · ${esc(local)}</b><br><span style="color:#46606a">${esc(n.tipoNome||'')}${n.itemTexto?' — '+esc(n.itemTexto):''}</span><p style="margin:8px 0">${esc(n.desc||'')}</p>${n.horas>=1?`<p style="margin:0 0 8px;color:#b4232a"><b>Ainda aberta ${n.horas} hora${n.horas>1?'s':''} após o registro.</b></p>`:''}<small style="color:#46606a">Registrada por ${esc(n.inspNome||'—')} em ${esc(fdt(n.ts))}</small></div>`)});
  at.forEach(a=>{
    const quando=a.temAgenda?`prevista para ${fdt(a.slot)}`:'sem execução dentro da periodicidade';
    L.push(`RONDA ATRASADA\n${a.ronda.nome} — ${quando}.\n`);
    H.push(`<div style="border-left:5px solid #d97706;background:#f6f8f9;padding:12px 14px;margin:0 0 12px;border-radius:6px"><b style="font-size:15px">Ronda atrasada · ${esc(a.ronda.nome)}</b><br><span style="color:#46606a">${esc(quando)}.</span></div>`)});
  const link=siteUrl?`\nAbrir o aplicativo: ${siteUrl}\n`:'';
  const texto=L.join('\n')+link+'\nAviso automático da Ronda Hospitalar.';
  const html=`<div style="font:14px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#0e2830;max-width:560px">${H.join('')}${siteUrl?`<p><a href="${esc(siteUrl)}" style="background:#0a6c7d;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Abrir o aplicativo</a></p>`:''}<p style="color:#6b7f87;font-size:12px">Aviso automático da Ronda Hospitalar.</p></div>`;
  return {assunto,texto,html}}

export async function enviarEmail({provider='brevo',apiKey,de,nome='Ronda Hospitalar',para,assunto,texto,html,fetchImpl=fetch,apiUrl}){
  let url,headers,body;
  if(provider==='resend'){url=apiUrl||'https://api.resend.com/emails';headers={'Content-Type':'application/json',Authorization:'Bearer '+apiKey};body={from:`${nome} <${de}>`,to:[para],subject:assunto,html,text:texto}}
  else{url=apiUrl||'https://api.brevo.com/v3/smtp/email';headers={'Content-Type':'application/json','api-key':apiKey,accept:'application/json'};body={sender:{name:nome,email:de},to:[{email:para}],subject:assunto,htmlContent:html,textContent:texto}}
  const r=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify(body)});
  if(!r.ok)throw new Error(`e-mail (${provider}) HTTP ${r.status}: ${(await r.text()).slice(0,200)}`)}

/* ---------- execução ---------- */
export async function rodar({cli,enviar,agenda,agora=Date.now(),siteUrl='',teste=false,log=console.log}){
  /* 1) estado anterior (se existir) */
  const atual=await cli.get('avisos/estado');
  const primeira=!atual;
  const estado=Object.assign(novoEstado(),atual||{});
  /* 2) linhas novas (a 1ª execução lê tudo; as seguintes só o que mudou desde o último processamento) */
  const paraAplicar=await cli.pull(primeira?0:Math.max(0,estado.seq-100));
  const seqAntes=estado.seq;
  aplicar(estado,paraAplicar);
  /* só NCs realmente novas (seq acima do último processado) */
  const ncsNovas=primeira?[]:paraAplicar.filter(r=>r.seq>seqAntes&&r.p.startsWith('ncs/')&&!r.deleted).map(r=>({id:id(r.p),...r.d}));
  const hospital=estado.cfg.hospital||'';
  const resumo={primeira,enviados:0,nc:0,atraso:0,falhas:0,teste};
  if(teste){
    const admins=Object.values(estado.users).filter(u=>u.role==='admin'&&u.ativo&&u.email);
    if(!admins.length)throw new Error('Nenhum administrador ativo com e-mail cadastrado (Cadastros → Usuários).');
    for(const a of admins){await enviar({para:a.email,assunto:`[Ronda${hospital?' · '+hospital:''}] E-mail de teste`,texto:'Os avisos por e-mail da Ronda Hospitalar estão funcionando.',html:'<p>Os avisos por e-mail da <b>Ronda Hospitalar</b> estão funcionando.</p>'});resumo.enviados++}
    return resumo}
  if(primeira){log('Primeira execução: linha de base registrada (nenhum e-mail enviado).')}
  /* NCs que aguardavam o prazo (ou o reenvio) e já venceram: relê do banco para ver se continuam abertas */
  estado.pend=estado.pend||{};
  const venc=[],sevMin=+(estado.cfg.avisos?.sevMin)||3;
  if(!primeira&&estado.cfg.avisos?.ativo)for(const [pid,p] of Object.entries(estado.pend)){
    if(p.due>agora)continue;
    let d;try{d=await cli.get('ncs/'+pid)}catch(e){continue}
    if(d&&d.status==='aberta'&&(+d.sev||0)>=sevMin&&(p.tent||0)<20)venc.push({id:pid,...d});else delete estado.pend[pid]}
  const {av,itens}=primeira?{av:{ativo:false},itens:[]}:decidir(estado,ncsNovas,agenda,agora,venc);
  /* 3) envio, agrupado por destinatário; só marca como enviado o que deu certo */
  if(av.ativo){
    const por=new Map();
    for(const it of itens){
      const novos=it.para.filter(e=>!estado.enviados[`${it.key}|${e}`]);
      if(!it.para.length){estado.enviados[`${it.key}|sem-destino`]=agora;log(`Sem e-mail cadastrado para ${it.key}`);continue}
      novos.forEach(e=>{if(!por.has(e))por.set(e,[]);por.get(e).push(it)})}
    for(const [email,lista] of por){
      const m=montarEmail({hospital,itens:lista,siteUrl});
      try{await enviar({para:email,...m});lista.forEach(it=>{estado.enviados[`${it.key}|${email}`]=agora;it.tipo==='nc'?resumo.nc++:resumo.atraso++});resumo.enviados++;estado.ultimoEnvio=agora;estado.erro=''}
      catch(e){resumo.falhas++;estado.erro=String(e.message||e).slice(0,300);log('Falha ao enviar para '+email+': '+estado.erro)}}}
  /* NC avisada a todos os destinatários sai da fila; se algum envio falhou, volta para tentar de novo */
  for(const it of itens){if(it.tipo!=='nc')continue;const nid=it.nc.id;
    if(!it.para.length||it.para.every(e=>estado.enviados[`${it.key}|${e}`]))delete estado.pend[nid];
    else estado.pend[nid]={due:0,tent:((estado.pend[nid]&&estado.pend[nid].tent)||0)+1}}
  if(!av.ativo)estado.pend={};
  /* 4) limpeza e gravação do estado */
  Object.keys(estado.enviados).forEach(k=>{if(agora-estado.enviados[k]>864e5*30)delete estado.enviados[k]});
  estado.ultimaExec=agora;estado.total=(estado.total||0)+resumo.enviados;
  await cli.put('avisos/estado',estado);
  return resumo}

/* ---------- linha de comando ---------- */
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const teste=process.argv.includes('--teste'),{url,key}=lerConfig(),codigo=process.env.RONDA_CODIGO||'';
  const falta=[!url&&'supabaseUrl (js/config.js)',!key&&'supabaseKey (js/config.js)',!codigo&&'segredo RONDA_CODIGO',!process.env.EMAIL_API_KEY&&'segredo EMAIL_API_KEY',!process.env.EMAIL_FROM&&'segredo EMAIL_FROM'].filter(Boolean);
  if(falta.length){console.error('Faltam: '+falta.join(', '));process.exit(1)}
  const repo=process.env.GITHUB_REPOSITORY||'',siteUrl=process.env.SITE_URL||(repo?`https://${repo.split('/')[0]}.github.io/${repo.split('/')[1]}/`:'');
  const cli=criarCliente({url,key,codigo});
  const enviar=m=>enviarEmail({provider:process.env.EMAIL_PROVIDER||'brevo',apiKey:process.env.EMAIL_API_KEY,de:process.env.EMAIL_FROM,nome:process.env.EMAIL_FROM_NAME||'Ronda Hospitalar',apiUrl:process.env.EMAIL_API_URL,...m});
  rodar({cli,enviar,agenda:carregarAgenda(),siteUrl,teste}).then(r=>{console.log(JSON.stringify(r));process.exit(r.falhas?1:0)}).catch(e=>{console.error('ERRO: '+e.message);process.exit(1)})}
