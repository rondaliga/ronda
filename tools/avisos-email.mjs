#!/usr/bin/env node
/* ==========================================================================
   Avisos por e-mail — roda no GitHub Actions (.github/workflows/avisos-email.yml) a cada ~10 min.
   Lê o banco (Supabase) pelas MESMAS funções do aplicativo (rh_pull / rh_put_many, com o código de acesso da equipe)
   e envia, por e-mail, aos responsáveis:
     • NC nova com severidade >= a configurada (padrão: Alta);
     • ronda em atraso (mesma regra do painel, usando js/core/agenda.js);
     • relatório periódico (semanal ou mensal) de conformidade, aos gestores e administradores (Cadastros → Hospital).
   O que já foi avisado fica no documento `avisos/estado` do próprio banco (nada é enviado duas vezes).
   Na 1ª execução só registra a linha de base (não envia o histórico antigo).

   Segredos (GitHub → Settings → Secrets and variables → Actions):
     RONDA_CODIGO   código de acesso da equipe (o mesmo pedido ao abrir o app)
     EMAIL_API_KEY  chave da API do provedor de e-mail
     EMAIL_FROM     e-mail remetente (verificado no provedor)
   Opcionais: EMAIL_PROVIDER (brevo | resend; padrão brevo), EMAIL_FROM_NAME, SITE_URL, RONDA_URL, RONDA_KEY.
   Uso:  node tools/avisos-email.mjs            (normal)
         node tools/avisos-email.mjs --teste    (envia um e-mail de teste aos administradores)
         node tools/avisos-email.mjs --relatorio (envia aos administradores o relatório do último período completo, para conferir)
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
const novoEstado=()=>({v:1,seq:0,pend:{},relat:{},cfg:{},users:{},salas:{},modelos:{},lastRun:{},enviados:{},ultimaExec:0,ultimoEnvio:0,total:0,erro:''});
const col=p=>p.slice(0,p.indexOf('/')),id=p=>p.slice(p.indexOf('/')+1);

/* aplica as linhas novas do banco ao cache do estado; devolve as NCs novas */
export function aplicar(estado,rows){
  const ncs=[];
  for(const r of rows){
    const c=col(r.p),i=id(r.p);
    if(r.seq>estado.seq)estado.seq=r.seq;
    if(c==='config'&&i==='main')estado.cfg=r.deleted?{}:{hospital:r.d.hospital||'',meta:+r.d.meta||95,avisos:r.d.avisos||{}};
    else if(c==='users')r.deleted?delete estado.users[i]:estado.users[i]={nome:r.d.nome||'',email:(r.d.email||'').trim(),role:r.d.role||'',ativo:r.d.ativo!==false};
    else if(c==='salas')r.deleted?delete estado.salas[i]:estado.salas[i]={nome:r.d.nome||'',setor:r.d.setor||'',ativo:r.d.ativo!==false,responsavelId:r.d.responsavelId||''};
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

/* ---------- relatório periódico (semanal ou mensal) ---------- */
export const REL_PADRAO={semanal:{dia:1,hora:7},mensal:{dia:1,hora:7}};   /* semanal: dia = dia da semana (0 = domingo); mensal: dia do mês (1–28) */
const cfgRel=r=>{const modo=r&&(r.modo==='semanal'||r.modo==='mensal')?r.modo:'off',p=REL_PADRAO[modo]||{};
  const hora=Math.min(23,Math.max(0,Number.isFinite(+r?.hora)&&r?.hora!==''&&r?.hora!=null?Math.floor(+r.hora):p.hora??7));
  let dia=Number.isFinite(+r?.dia)&&r?.dia!==''&&r?.dia!=null?Math.floor(+r.dia):p.dia;
  dia=modo==='mensal'?Math.min(28,Math.max(1,dia)):Math.min(6,Math.max(0,dia));
  return {modo,dia,hora}};
/* último instante programado que já passou (data/hora local do servidor, TZ do fluxo) */
export function programada(rel,agora){
  const c=cfgRel(rel);if(c.modo==='off')return null;
  const a=new Date(agora);
  if(c.modo==='semanal'){const d=new Date(a.getFullYear(),a.getMonth(),a.getDate(),c.hora);
    d.setDate(d.getDate()-((d.getDay()-c.dia+7)%7));if(d>a)d.setDate(d.getDate()-7);return d.getTime()}
  let d=new Date(a.getFullYear(),a.getMonth(),c.dia,c.hora);if(d>a)d=new Date(a.getFullYear(),a.getMonth()-1,c.dia,c.hora);return d.getTime()}
/* período coberto: semanal = 7 dias completos terminando à 0 h do dia programado; mensal = mês civil anterior. `ant` = período anterior, para comparar */
export function periodoRelatorio(modo,prog){
  const p=new Date(prog);
  if(modo==='mensal'){const fim=new Date(p.getFullYear(),p.getMonth(),1),ini=new Date(p.getFullYear(),p.getMonth()-1,1),aIni=new Date(p.getFullYear(),p.getMonth()-2,1);
    const nome=ini.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    return {modo,ini:+ini,fim:+fim,aIni:+aIni,aFim:+ini,rotulo:nome,nome:'mensal'}}
  const fim=new Date(p.getFullYear(),p.getMonth(),p.getDate()),ini=new Date(fim),aIni=new Date(fim);ini.setDate(ini.getDate()-7);aIni.setDate(aIni.getDate()-14);
  const ult=new Date(fim);ult.setDate(ult.getDate()-1);
  const r=`${new Date(ini).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} a ${dia(ult)}`;
  return {modo,ini:+ini,fim:+fim,aIni:+aIni,aFim:+ini,rotulo:r,nome:'semanal'}}
const media=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
export function calcularRelatorio({rondas,ncs,salas},per,agora=Date.now()){
  const em=(t,a,b)=>t>=a&&t<b,rs=rondas.filter(r=>em(r.ts,per.ini,per.fim)),ra=rondas.filter(r=>em(r.ts,per.aIni,per.aFim));
  const conf=a=>{const c=a.reduce((s,r)=>s+(r.c||0),0),n=a.reduce((s,r)=>s+(r.nc||0),0);return c+n?c/(c+n)*100:null};
  const cur=conf(rs),ant=conf(ra);
  const execs=a=>new Set(a.map(r=>r.execId||r.id)).size;
  const reg=ncs.filter(n=>em(n.ts,per.ini,per.fim)),regA=ncs.filter(n=>em(n.ts,per.aIni,per.aFim));
  const porSev=a=>[1,2,3,4].map(s=>a.filter(n=>+n.sev===s).length);
  const resolv=ncs.filter(n=>n.status==='resolvida'&&n.resolvidoEm&&em(n.resolvidoEm,per.ini,per.fim));
  const abertas=ncs.filter(n=>n.status!=='resolvida');
  const tipos={};reg.forEach(n=>{const k=n.tipoNome||'Sem tipo';tipos[k]=(tipos[k]||0)+1});
  const lt=Object.entries(tipos).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));let ac=0;
  const pareto=lt.slice(0,5).map(([l,v])=>{ac+=v;return {l,v,acum:ac/reg.length*100}});
  const st={};rs.forEach(r=>{const s=r.setor||'Sem setor';(st[s]??={c:0,n:0});st[s].c+=r.c||0;st[s].n+=r.nc||0});
  const setores=Object.entries(st).filter(([,x])=>x.c+x.n>0).map(([l,x])=>({l,n:x.n,pct:x.n/(x.c+x.n)*100})).sort((a,b)=>b.n-a.n||b.pct-a.pct||a.l.localeCompare(b.l)).slice(0,5);
  const ex=new Map();rs.forEach(r=>{if(r.dur>0&&r.dur<=8*36e5)ex.set(r.execId||r.id,r.dur)});
  const ativas=Object.entries(salas).filter(([,s])=>s.ativo!==false),vistas=new Set(rs.map(r=>r.salaId).filter(Boolean));
  const cob=ativas.length?{ok:ativas.filter(([i])=>vistas.has(i)).length,total:ativas.length}:null;
  return {conf:cur,confAnt:ant,delta:cur!=null&&ant!=null?cur-ant:null,execs:execs(rs),execsAnt:execs(ra),
    itens:rs.reduce((s,r)=>s+(r.c||0)+(r.nc||0),0),ina:rs.reduce((s,r)=>s+(r.ina||0),0),
    ncReg:reg.length,ncRegAnt:regA.length,sev:porSev(reg),sevAnt:porSev(regA),
    resolvidas:resolv.length,tempoResolver:media(resolv.map(n=>n.resolvidoEm-n.ts).filter(x=>x>=0)),
    abertas:abertas.length,graves:abertas.filter(n=>+n.sev>=3).length,antigas:abertas.filter(n=>agora-(n.ts||agora)>7*864e5).length,
    pareto,setores,tempoRonda:media([...ex.values()]),execsComTempo:ex.size,cobertura:cob}}
const pc=n=>n==null?'—':n.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const dur=ms=>{if(ms==null)return '—';const m=Math.round(ms/6e4);if(m<60)return Math.max(1,m)+' min';const h=ms/36e5;return h<48?h.toLocaleString('pt-BR',{maximumFractionDigits:1})+' h':Math.round(h/24)+' dias'};
export function montarRelatorio({hospital,per,d,meta=95,siteUrl}){
  const pre=`[Ronda${hospital?' · '+hospital:''}]`,tipo=per.nome==='mensal'?'mensal':'semanal',vs=per.nome==='mensal'?'mês anterior':'semana anterior';
  const assunto=`${pre} Relatório ${tipo} · ${per.rotulo}: ${d.conf==null?'sem rondas no período':pc(d.conf)+' de conformidade'}`;
  const dl=d.delta==null?'':` (${d.delta>=0?'+':'−'}${Math.abs(d.delta).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})} p.p. vs. ${vs})`;
  const metaTxt=d.conf==null?'':d.conf>=meta?`dentro da meta de ${meta}%`:`abaixo da meta de ${meta}%`;
  const dn=(a,b)=>b==null?'':` (${a-b>=0?'+':'−'}${Math.abs(a-b)} vs. ${vs})`;
  const sevTxt=d.sev.map((n,i)=>n?`${n} ${SEV[i+1].toLowerCase()}${n>1&&i<3?'s':''}`:'').filter(Boolean).join(' · ')||'nenhuma';
  const L=[`RELATÓRIO ${tipo.toUpperCase()} · ${per.rotulo}`,'',
    `Conformidade: ${d.conf==null?'sem rondas no período':pc(d.conf)+dl+' · '+metaTxt}`,
    `Rondas executadas: ${d.execs}${dn(d.execs,d.execsAnt)} · itens verificados: ${d.itens}${d.ina?` · inacessíveis: ${d.ina}`:''}`,
    `NCs registradas: ${d.ncReg}${dn(d.ncReg,d.ncRegAnt)} · ${sevTxt}`,
    `NCs resolvidas: ${d.resolvidas}${d.tempoResolver!=null?` · tempo médio até resolver: ${dur(d.tempoResolver)}`:''}`,
    `Não resolvidas hoje: ${d.abertas} (${d.graves} Alta/Crítica · ${d.antigas} há mais de 7 dias)`];
  if(d.tempoRonda!=null)L.push(`Tempo médio por ronda: ${dur(d.tempoRonda)} (${d.execsComTempo} execuções com tempo registrado)`);
  if(d.cobertura)L.push(`Salas verificadas no período: ${d.cobertura.ok} de ${d.cobertura.total}`);
  if(d.pareto.length){L.push('','Principais tipos de NC (Pareto):');d.pareto.forEach(p=>L.push(`  ${p.l}: ${p.v} (${Math.round(p.acum)}% acumulado)`))}
  if(d.setores.length){L.push('','Setores com mais NCs:');d.setores.forEach(s=>L.push(`  ${s.l}: ${s.n} NC · ${pc(s.pct)} dos itens`))}
  if(siteUrl)L.push('','Abrir o aplicativo: '+siteUrl);
  L.push('','Relatório automático da Ronda Hospitalar.');
  const kpi=(t,v,s,cor)=>`<td style="padding:10px 12px;background:#f6f8f9;border-radius:6px;vertical-align:top"><div style="font-size:12px;color:#46606a">${esc(t)}</div><div style="font-size:22px;font-weight:700;color:${cor||'#0e2830'}">${esc(v)}</div><div style="font-size:12px;color:#46606a">${esc(s||'')}</div></td>`;
  const corC=d.conf==null?'#0e2830':d.conf>=meta?'#1b7f3a':'#b4232a';
  const tab=(tit,lin)=>lin.length?`<h3 style="font-size:14px;margin:18px 0 6px">${esc(tit)}</h3><table style="border-collapse:collapse;width:100%;font-size:13px">${lin.map(c=>`<tr>${c.map((x,i)=>`<td style="padding:5px 8px;border-bottom:1px solid #e1e8eb${i?';text-align:right;white-space:nowrap':''}">${esc(x)}</td>`).join('')}</tr>`).join('')}</table>`:'';
  const html=`<div style="font:14px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#0e2830;max-width:600px"><h2 style="font-size:17px;margin:0 0 2px">Relatório ${tipo} de conformidade</h2><div style="color:#46606a;margin:0 0 14px">${esc(hospital||'')}${hospital?' · ':''}${esc(per.rotulo)}</div>
<table role="presentation" style="border-spacing:8px;width:100%;margin:0 -8px"><tr>${kpi('Conformidade',pc(d.conf),(dl.replace(/^ \(|\)$/g,'')||'')+(metaTxt?(dl?' · ':'')+metaTxt:''),corC)}${kpi('Rondas executadas',String(d.execs),dn(d.execs,d.execsAnt).trim().replace(/^\(|\)$/g,''))}</tr><tr>${kpi('NCs registradas',String(d.ncReg),sevTxt)}${kpi('Não resolvidas hoje',String(d.abertas),`${d.graves} Alta/Crítica · ${d.antigas} há +7 dias`,d.graves?'#b4232a':'')}</tr></table>
<p style="margin:10px 0 0;color:#46606a">NCs resolvidas no período: <b>${d.resolvidas}</b>${d.tempoResolver!=null?` · tempo médio até resolver: <b>${esc(dur(d.tempoResolver))}</b>`:''}${d.tempoRonda!=null?`<br>Tempo médio por ronda: <b>${esc(dur(d.tempoRonda))}</b>`:''}${d.cobertura?`<br>Salas verificadas: <b>${d.cobertura.ok} de ${d.cobertura.total}</b>`:''}</p>
${tab('Principais tipos de NC (Pareto)',d.pareto.map(p=>[p.l,String(p.v),Math.round(p.acum)+'% acumulado']))}${tab('Setores com mais NCs',d.setores.map(s=>[s.l,s.n+' NC',pc(s.pct)+' dos itens']))}
${siteUrl?`<p><a href="${esc(siteUrl)}" style="background:#0a6c7d;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Abrir o aplicativo</a></p>`:''}<p style="color:#6b7f87;font-size:12px">Relatório automático da Ronda Hospitalar.</p></div>`;
  return {assunto,texto:L.join('\n'),html}}
/* lê o banco inteiro e devolve rondas, NCs e salas para o relatório */
async function dadosRelatorio(cli,estado){
  const rows=await cli.pull(0),rondas=[],ncs=[];
  for(const r of rows){if(r.deleted)continue;const c=col(r.p);if(c==='rondas')rondas.push({id:id(r.p),...r.d});else if(c==='ncs')ncs.push({id:id(r.p),...r.d})}
  return {rondas,ncs,salas:estado.salas}}
const destRelatorio=(estado,soAdmin)=>Object.values(estado.users).filter(u=>u.ativo&&u.email&&(u.role==='admin'||(!soAdmin&&u.role==='gestor')));

export async function enviarEmail({provider='brevo',apiKey,de,nome='Ronda Hospitalar',para,assunto,texto,html,fetchImpl=fetch,apiUrl}){
  let url,headers,body;
  if(provider==='resend'){url=apiUrl||'https://api.resend.com/emails';headers={'Content-Type':'application/json',Authorization:'Bearer '+apiKey};body={from:`${nome} <${de}>`,to:[para],subject:assunto,html,text:texto}}
  else{url=apiUrl||'https://api.brevo.com/v3/smtp/email';headers={'Content-Type':'application/json','api-key':apiKey,accept:'application/json'};body={sender:{name:nome,email:de},to:[{email:para}],subject:assunto,htmlContent:html,textContent:texto}}
  const r=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify(body)});
  if(!r.ok)throw new Error(`e-mail (${provider}) HTTP ${r.status}: ${(await r.text()).slice(0,200)}`)}

/* ---------- execução ---------- */
export async function rodar({cli,enviar,agenda,agora=Date.now(),siteUrl='',teste=false,relatorioAgora=false,log=console.log}){
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
  const resumo={primeira,enviados:0,nc:0,atraso:0,falhas:0,teste,relatorio:0};
  if(relatorioAgora){   /* conferência manual: último período completo, só para administradores; não altera o estado */
    const rel=cfgRel(estado.cfg.avisos?.relatorio),modo=rel.modo==='off'?'semanal':rel.modo,prog=programada({...rel,modo,dia:rel.modo==='off'?REL_PADRAO.semanal.dia:rel.dia,hora:rel.hora},agora);
    const dest=destRelatorio(estado,true);if(!dest.length)throw new Error('Nenhum administrador ativo com e-mail cadastrado (Cadastros → Usuários).');
    const per=periodoRelatorio(modo,prog),m=montarRelatorio({hospital,per,d:calcularRelatorio(await dadosRelatorio(cli,estado),per,agora),meta:estado.cfg.meta||95,siteUrl});
    for(const u of dest){await enviar({para:u.email,...m});resumo.enviados++;resumo.relatorio++}
    return resumo}
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
  /* relatório periódico: na 1ª vez (ou ao mudar a frequência) só marca o ponto de partida; depois envia 1 vez por período */
  try{
    const rel=cfgRel(av.relatorio);estado.relat=estado.relat||{};
    if(av.ativo&&!primeira&&rel.modo!=='off'){
      const prog=programada(rel,agora),chave=`${rel.modo}|${rel.dia}|${rel.hora}`;
      if(estado.relat.ultimo==null||estado.relat.modo!==rel.modo){estado.relat={modo:rel.modo,ultimo:prog};log('Relatório periódico: ponto de partida registrado.')}
      else if(prog>estado.relat.ultimo&&agora-prog<72*36e5){
        const dest=destRelatorio(estado,false),per=periodoRelatorio(rel.modo,prog);
        if(!dest.length){estado.relat={modo:rel.modo,ultimo:prog};log('Relatório periódico: nenhum gestor ou administrador com e-mail.')}
        else{
          const m=montarRelatorio({hospital,per,d:calcularRelatorio(await dadosRelatorio(cli,estado),per,agora),meta:estado.cfg.meta||95,siteUrl});
          const ja=estado.relat.enviados||{};let falhou=0;
          for(const u of dest){if(ja[u.email.toLowerCase()]===prog)continue;
            try{await enviar({para:u.email,...m});ja[u.email.toLowerCase()]=prog;resumo.relatorio++;resumo.enviados++;estado.ultimoEnvio=agora}
            catch(e){falhou++;resumo.falhas++;estado.erro=String(e.message||e).slice(0,300);log('Falha no relatório para '+u.email+': '+estado.erro)}}
          estado.relat=falhou?{modo:rel.modo,ultimo:estado.relat.ultimo,enviados:ja}:{modo:rel.modo,ultimo:prog}}}
      else if(prog>estado.relat.ultimo)estado.relat={modo:rel.modo,ultimo:prog};   /* passou de 72 h (ex.: fluxo parado): pula, sem enviar relatório velho */
    }else if(!av.ativo||rel.modo==='off')estado.relat={}
  }catch(e){estado.erro=('Relatório: '+(e.message||e)).slice(0,300);log(estado.erro)}
  /* 4) limpeza e gravação do estado */
  Object.keys(estado.enviados).forEach(k=>{if(agora-estado.enviados[k]>864e5*30)delete estado.enviados[k]});
  estado.ultimaExec=agora;estado.total=(estado.total||0)+resumo.enviados;
  await cli.put('avisos/estado',estado);
  return resumo}

/* ---------- linha de comando ---------- */
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const teste=process.argv.includes('--teste'),relatorioAgora=process.argv.includes('--relatorio'),{url,key}=lerConfig(),codigo=process.env.RONDA_CODIGO||'';
  const falta=[!url&&'supabaseUrl (js/config.js)',!key&&'supabaseKey (js/config.js)',!codigo&&'segredo RONDA_CODIGO',!process.env.EMAIL_API_KEY&&'segredo EMAIL_API_KEY',!process.env.EMAIL_FROM&&'segredo EMAIL_FROM'].filter(Boolean);
  if(falta.length){console.error('Faltam: '+falta.join(', '));process.exit(1)}
  const repo=process.env.GITHUB_REPOSITORY||'',siteUrl=process.env.SITE_URL||(repo?`https://${repo.split('/')[0]}.github.io/${repo.split('/')[1]}/`:'');
  const cli=criarCliente({url,key,codigo});
  const enviar=m=>enviarEmail({provider:process.env.EMAIL_PROVIDER||'brevo',apiKey:process.env.EMAIL_API_KEY,de:process.env.EMAIL_FROM,nome:process.env.EMAIL_FROM_NAME||'Ronda Hospitalar',apiUrl:process.env.EMAIL_API_URL,...m});
  rodar({cli,enviar,agenda:carregarAgenda(),siteUrl,teste,relatorioAgora}).then(r=>{console.log(JSON.stringify(r));process.exit(r.falhas?1:0)}).catch(e=>{console.error('ERRO: '+e.message);process.exit(1)})}
