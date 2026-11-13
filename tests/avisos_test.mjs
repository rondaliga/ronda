// Teste do script de avisos por e-mail contra um banco e um provedor de e-mail SIMULADOS (nada real é acessado).
import http from 'node:http';
import {criarCliente,carregarAgenda,rodar,enviarEmail,montarEmail,programada,periodoRelatorio,calcularRelatorio} from '../tools/avisos-email.mjs';
process.env.TZ='America/Fortaleza';
let ok=0,bad=0;const check=(n,c,x)=>{c?ok++:bad++;console.log((c?'  OK   ':'  FAIL ')+n+(!c&&x?'  -> '+JSON.stringify(x):''))};

const DB=new Map();let SEQ=0;const emails=[];const CODE='equipe-123';
const put=(p,d)=>{DB.set(p,{seq:++SEQ,d,deleted:d===null})};
const srv=http.createServer((req,res)=>{
  let b='';req.on('data',c=>b+=c);req.on('end',()=>{
    const j=b?JSON.parse(b):{};res.setHeader('content-type','application/json');
    if(req.url.startsWith('/email')){emails.push({...j,headers:req.headers});return res.end('{"ok":1}')}
    const fn=req.url.split('/rpc/')[1];
    if(j.p_code!==CODE){res.statusCode=400;return res.end('{"message":"codigo_invalido"}')}
    if(fn==='rh_pull')return res.end(JSON.stringify([...DB].filter(([p,v])=>v.seq>(j.p_since||0)&&(j.p_fotos||!p.startsWith('fotos/'))).map(([p,v])=>({seq:v.seq,p,d:v.d,deleted:v.deleted})).sort((a,b)=>a.seq-b.seq)));
    if(fn==='rh_get'){const v=DB.get(j.p_path);return res.end(JSON.stringify(v&&!v.deleted?v.d:null))}
    if(fn==='rh_put_many'){j.p_items.forEach(i=>put(i.p,i.d));return res.end(String(j.p_items.length))}
    res.statusCode=404;res.end('{}')})});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+srv.address().port;
const cli=criarCliente({url:base,key:'anon-key',codigo:CODE});
const agenda=carregarAgenda();
const enviar=m=>enviarEmail({provider:'brevo',apiKey:'k',de:'ronda@hospital.org',para:m.para,assunto:m.assunto,texto:m.texto,html:m.html,apiUrl:base+'/email'});

/* cenário: sexta-feira 14/11/2026 10:00 (fuso Fortaleza); ronda diária às 08:00 sem execução → atrasada */
const agora=new Date('2026-11-13T10:00:00-03:00').getTime();
put('config/main',{hospital:'Liga Contra o Câncer',avisos:{ativo:true,sevMin:3,copiaAdmin:true}});
put('users/u1',{nome:'Ana Admin',role:'admin',ativo:true,email:'ana@h.org'});
put('users/u2',{nome:'Rita Resp',role:'inspetor',ativo:true,email:'rita@h.org'});
put('users/u3',{nome:'Sem Email',role:'inspetor',ativo:true});
put('salas/s1',{nome:'Sala Vermelha',setor:'Emergência',responsavelId:'u2'});
put('modelos/m1',{nome:'Ronda Emergência',ativo:true,responsavelId:'u2',dias:[0,1,2,3,4,5,6],horarios:['08:00'],agendaDesde:agora-5*864e5});
put('rondas/r0',{modeloId:'m1',ts:agora-30*36e5});
put('ncs/velha',{ts:agora-10*864e5,sev:4,status:'aberta',resp:'u2',salaNome:'Sala Vermelha'});

// 1) primeira execução: só linha de base
let r=await rodar({cli,enviar,agenda,agora});
check('1ª execução registra a linha de base e não envia nada', r.primeira&&emails.length===0&&DB.has('avisos/estado'),r);

// 2) nova NC grave + ronda atrasada → e-mails ao responsável e ao admin (cópia)
put('ncs/n1',{ts:agora-5*6e4,sev:4,status:'aberta',resp:'u2',setor:'Emergência',salaNome:'Sala Vermelha',tipoNome:'Equipamento com defeito',itemTexto:'Alarme',desc:'Alarme inoperante <b>teste</b>',inspNome:'Ricardo',prazo:agora+864e5});
put('ncs/n2',{ts:agora-5*6e4,sev:1,status:'aberta',resp:'u2',salaNome:'Sala Vermelha',tipoNome:'Limpeza',itemTexto:'Piso',desc:'sujo'});   // baixa: não avisa
r=await rodar({cli,enviar,agenda,agora});
const por=Object.fromEntries(emails.map(e=>[e.to[0].email,e]));
check('NC grave e ronda atrasada geram 2 e-mails (responsável + admin)', emails.length===2&&por['rita@h.org']&&por['ana@h.org'],emails.map(e=>e.to[0].email));
check('um único e-mail por pessoa reúne os dois avisos', /2 avisos: 1 NC e 1 ronda atrasada/.test(por['rita@h.org'].subject),por['rita@h.org']?.subject);
check('NC baixa não gera aviso', !emails.some(e=>/sujo|Limpeza/.test(e.textContent)));
check('texto do e-mail traz local e descrição, sem prazo', /Sala Vermelha/.test(por['rita@h.org'].textContent)&&/Alarme inoperante/.test(por['rita@h.org'].textContent)&&!/prazo/.test(por['rita@h.org'].textContent));
check('HTML é escapado (sem injeção)', !por['rita@h.org'].htmlContent.includes('<b>teste</b>')&&por['rita@h.org'].htmlContent.includes('&lt;b&gt;'));
check('remetente e chave do provedor usados', por['rita@h.org'].sender.email==='ronda@hospital.org'&&por['rita@h.org'].headers['api-key']==='k');

// 3) mesma situação de novo: nada é reenviado
const n0=emails.length;r=await rodar({cli,enviar,agenda,agora:agora+15*6e4});
check('não reenvia o que já foi avisado', emails.length===n0&&r.enviados===0,r);

// 4) ronda realizada → deixa de estar atrasada; novo slot atrasado no dia seguinte gera novo aviso
put('rondas/r1',{modeloId:'m1',ts:agora+60*6e4});
const amanha=new Date('2026-11-14T10:00:00-03:00').getTime();
r=await rodar({cli,enviar,agenda,agora:amanha});
check('novo horário perdido gera novo aviso de atraso', emails.length===n0+2&&r.atraso>=1,{n:emails.length,r});

// 5) avisos desligados: nada é enviado, mas o estado avança
put('config/main',{hospital:'Liga Contra o Câncer',avisos:{ativo:false}});
put('ncs/n3',{ts:amanha-6e4,sev:4,status:'aberta',resp:'u2',salaNome:'X'});
const n1=emails.length;r=await rodar({cli,enviar,agenda,agora:amanha+60e3});
check('com os avisos desligados nada é enviado', emails.length===n1,r);

// 6) e-mail de teste aos administradores
r=await rodar({cli,enviar,agenda,agora:amanha,teste:true});
check('--teste envia ao administrador', r.teste&&r.enviados===1&&emails[emails.length-1].to[0].email==='ana@h.org'&&/teste/i.test(emails[emails.length-1].subject),r);

// 7) falha do provedor: não marca como enviado e tenta de novo na próxima execução
put('config/main',{hospital:'H',avisos:{ativo:true,sevMin:3,copiaAdmin:false}});
put('ncs/n4',{ts:amanha,sev:4,status:'aberta',resp:'u2',salaNome:'Y',tipoNome:'T'});
let falha=true;const enviar2=m=>falha?Promise.reject(new Error('provedor fora do ar')):enviar(m);
r=await rodar({cli,enviar:enviar2,agenda,agora:amanha+120e3});
check('falha de envio é registrada', r.falhas>=1&&DB.get('avisos/estado').d.erro.includes('provedor'),r);
falha=false;const n2=emails.length;r=await rodar({cli,enviar:enviar2,agenda,agora:amanha+180e3});
check('após a falha, a NC é reenviada na execução seguinte', emails.length>n2&&emails.slice(n2).some(e=>/Y/.test(e.textContent)),{n2,total:emails.length,r});
const n3=emails.length;await rodar({cli,enviar:enviar2,agenda,agora:amanha+240e3});
check('e não é enviada outra vez depois', !emails.slice(n3).some(e=>/\bY\b/.test(e.textContent)));

// 7b) horário por NC: Crítica na hora; Média e Alta só depois de 8 h e se ainda estiverem abertas
put('config/main',{hospital:'H',avisos:{ativo:true,sevMin:2,copiaAdmin:false}});
const T0=amanha+3*864e5,nc=(id,sev,sala)=>put('ncs/'+id,{ts:T0,sev,status:'aberta',resp:'u2',salaNome:sala,tipoNome:'T',itemTexto:'Item '+sala});
nc('d1',3,'SalaD1');nc('d2',2,'SalaD2');nc('d3',3,'SalaD3');nc('d4',4,'SalaD4');
let k=emails.length;await rodar({cli,enviar,agenda,agora:T0+60e3});
let txt=emails.slice(k).map(e=>e.textContent).join('\n');
check('Crítica é avisada na hora', /SalaD4/.test(txt),txt);
check('Média e Alta não são avisadas na hora', !/SalaD1|SalaD2|SalaD3/.test(txt),txt);
put('ncs/d3',{ts:T0,sev:3,status:'resolvida',resp:'u2',salaNome:'SalaD3'});
k=emails.length;await rodar({cli,enviar,agenda,agora:T0+4*36e5});
check('com 4 h ainda não envia Média/Alta', !emails.slice(k).some(e=>/SalaD1|SalaD2/.test(e.textContent)));
k=emails.length;await rodar({cli,enviar,agenda,agora:T0+8*36e5+60e3});
txt=emails.slice(k).map(e=>e.textContent).join('\n');
check('com 8 h, Média e Alta abertas são avisadas', /SalaD1/.test(txt)&&/SalaD2/.test(txt),txt);
check('o e-mail informa que continua aberta', /Ainda aberta 8 horas/.test(txt),txt);
check('NC resolvida antes das 8 h não é avisada', !/SalaD3/.test(txt));
check('Crítica não é reenviada', !/SalaD4/.test(txt));
k=emails.length;await rodar({cli,enviar,agenda,agora:T0+9*36e5});
check('Média/Alta não são reenviadas', !emails.slice(k).some(e=>/SalaD1|SalaD2/.test(e.textContent)));
const pend=Object.keys(DB.get('avisos/estado').d.pend);
check('fila de espera fica vazia depois de enviar', pend.length===0,pend);

// 7c) relatório periódico (semanal) aos gestores e administradores
const L=s=>new Date(s+':00-03:00').getTime();
check('programada semanal: segunda 08:00 → hoje 07:00', programada({modo:'semanal',dia:1,hora:7},L('2026-11-23T08:00'))===L('2026-11-23T07:00'));
check('programada semanal: segunda 06:00 → segunda anterior', programada({modo:'semanal',dia:1,hora:7},L('2026-11-23T06:00'))===L('2026-11-16T07:00'));
check('programada mensal: dia 1 às 7 h', programada({modo:'mensal',dia:1,hora:7},L('2026-12-01T08:00'))===L('2026-12-01T07:00')&&programada({modo:'mensal',dia:1,hora:7},L('2026-11-13T10:00'))===L('2026-11-01T07:00'));
check('programada: desligado = nulo; dia do mês limitado a 28', programada({modo:'off'},agora)===null&&programada({modo:'mensal',dia:31,hora:7},L('2026-11-30T08:00'))===L('2026-11-28T07:00'));
const pS=periodoRelatorio('semanal',L('2026-11-23T07:00')),pM=periodoRelatorio('mensal',L('2026-12-01T07:00'));
check('período semanal: 7 dias completos antes da segunda', pS.ini===L('2026-11-16T00:00')&&pS.fim===L('2026-11-23T00:00')&&pS.aIni===L('2026-11-09T00:00')&&pS.rotulo==='16/11 a 22/11/2026',pS);
check('período mensal: mês civil anterior', pM.ini===L('2026-11-01T00:00')&&pM.fim===L('2026-12-01T00:00')&&pM.aIni===L('2026-10-01T00:00')&&/novembro de 2026/.test(pM.rotulo),pM);

put('users/u4',{nome:'Gil Gestor',role:'gestor',ativo:true,email:'gil@h.org'});
put('users/u5',{nome:'Inativo Gestor',role:'gestor',ativo:false,email:'off@h.org'});
put('config/main',{hospital:'Liga Contra o Câncer',meta:95,avisos:{ativo:true,sevMin:2,copiaAdmin:false,relatorio:{modo:'semanal',dia:1,hora:7}}});
put('salas/s2',{nome:'Sala Azul',setor:'UTI',ativo:true});
const rel=emails=>emails.filter(e=>/Relatório/.test(e.subject));
let k2=emails.length;r=await rodar({cli,enviar,agenda,agora:T0+10*36e5});
check('relatório: 1ª vez só registra o ponto de partida', rel(emails.slice(k2)).length===0&&DB.get('avisos/estado').d.relat.modo==='semanal'&&DB.get('avisos/estado').d.relat.ultimo===L('2026-11-16T07:00'),DB.get('avisos/estado').d.relat);
put('rondas/p1',{execId:'x0',modeloId:'m9',salaId:'s2',setor:'UTI',ts:L('2026-11-11T12:00'),c:80,nc:20,ina:0,dur:30*6e4});
put('rondas/p2',{execId:'x1',modeloId:'m9',salaId:'s2',setor:'UTI',ts:L('2026-11-18T12:00'),c:90,nc:10,ina:2,dur:20*6e4});
put('rondas/p3',{execId:'x2',modeloId:'m9',salaId:'s1',setor:'Emergência',ts:L('2026-11-19T12:00'),c:45,nc:5,ina:0,dur:40*6e4});
put('rondas/p4',{execId:'x3',modeloId:'m9',salaId:'s1',setor:'Emergência',ts:L('2026-11-30T12:00'),c:1,nc:99,ina:0});   /* fora do período */
for(let i=0;i<3;i++)put('ncs/q'+i,{ts:L('2026-11-18T12:00'),sev:2,status:i?'aberta':'resolvida',resolvidoEm:L('2026-11-18T14:00'),tipoNome:'Limpeza',setor:'UTI'});
put('ncs/q3',{ts:L('2026-11-19T12:00'),sev:3,status:'aberta',tipoNome:'Equipamento',setor:'Emergência',salaNome:'Sala Vermelha'});
k2=emails.length;r=await rodar({cli,enviar,agenda,agora:L('2026-11-22T20:00')});
check('antes da hora programada não envia relatório', rel(emails.slice(k2)).length===0);
k2=emails.length;r=await rodar({cli,enviar,agenda,agora:L('2026-11-23T08:00')});
const rm=rel(emails.slice(k2)),dest=rm.map(e=>e.to[0].email).sort();
check('relatório vai a gestor e administrador ativos com e-mail', dest.join()==='ana@h.org,gil@h.org'&&r.relatorio===2,{dest,r});
check('assunto traz o período e a conformidade', /Relatório semanal · 16\/11 a 22\/11\/2026: 90,0% de conformidade/.test(rm[0].subject),rm[0]?.subject);
check('texto: variação vs. semana anterior (+10,0 p.p.), abaixo da meta', /\+10,0 p\.p\./.test(rm[0].textContent)&&/abaixo da meta de 95%/.test(rm[0].textContent),rm[0]?.textContent);
check('texto: rondas, Pareto e setores', /Rondas executadas: 2/.test(rm[0].textContent)&&/Limpeza: 3 \(38% acumulado\)/.test(rm[0].textContent)&&/Emergência/.test(rm[0].textContent)&&/UTI/.test(rm[0].textContent),rm[0]?.textContent);
check('texto: resolvidas e tempo médio de 2 h', /NCs resolvidas: 1 · tempo médio até resolver: 2 h/.test(rm[0].textContent),rm[0]?.textContent);
check('texto: tempo médio por ronda (30 min) e salas verificadas', /Tempo médio por ronda: 30 min/.test(rm[0].textContent)&&/Salas verificadas no período: 2 de 2/.test(rm[0].textContent),rm[0]?.textContent);
check('o período não conta rondas fora dele', !/99/.test(rm[0].textContent.split('\n')[2]));
check('HTML do relatório é válido para e-mail (sem script)', !/<script/i.test(rm[0].htmlContent)&&/Conformidade/.test(rm[0].htmlContent));
check('usuário inativo não recebe', !emails.some(e=>e.to[0].email==='off@h.org'));
k2=emails.length;await rodar({cli,enviar,agenda,agora:L('2026-11-23T08:30')});
check('relatório não é reenviado no mesmo período', rel(emails.slice(k2)).length===0);
// mudar a frequência para mensal: novo ponto de partida, sem enviar
put('config/main',{hospital:'Liga Contra o Câncer',meta:95,avisos:{ativo:true,sevMin:2,copiaAdmin:false,relatorio:{modo:'mensal',dia:1,hora:7}}});
k2=emails.length;await rodar({cli,enviar,agenda,agora:L('2026-11-23T09:00')});
check('trocar para mensal só registra novo ponto de partida', rel(emails.slice(k2)).length===0&&DB.get('avisos/estado').d.relat.modo==='mensal');
k2=emails.length;r=await rodar({cli,enviar,agenda,agora:L('2026-12-01T08:00')});
check('mensal: envia no dia 1 com o mês de novembro', rel(emails.slice(k2)).length===2&&/novembro de 2026/.test(rel(emails.slice(k2))[0].subject),rel(emails.slice(k2)).map(e=>e.subject));
// falha de envio: tenta de novo sem duplicar quem já recebeu
let ruimEnv=true;const env3=m=>ruimEnv&&m.para==='gil@h.org'?Promise.reject(new Error('fora do ar')):enviar(m);
put('config/main',{hospital:'H',meta:95,avisos:{ativo:true,sevMin:2,copiaAdmin:false,relatorio:{modo:'mensal',dia:2,hora:7}}});
await rodar({cli,enviar,agenda,agora:L('2026-12-01T09:00')});
k2=emails.length;r=await rodar({cli,enviar:env3,agenda,agora:L('2026-12-02T08:00')});
check('falha no relatório é registrada e o outro destinatário recebe', r.falhas>=1&&rel(emails.slice(k2)).map(e=>e.to[0].email).join()==='ana@h.org',{r,e:rel(emails.slice(k2)).map(e=>e.to[0].email)});
ruimEnv=false;k2=emails.length;await rodar({cli,enviar:env3,agenda,agora:L('2026-12-02T08:10')});
check('na tentativa seguinte só quem faltou recebe', rel(emails.slice(k2)).map(e=>e.to[0].email).join()==='gil@h.org',rel(emails.slice(k2)).map(e=>e.to[0].email));
k2=emails.length;await rodar({cli,enviar:env3,agenda,agora:L('2026-12-02T08:20')});
check('e depois não repete', rel(emails.slice(k2)).length===0);
// conferência manual (--relatorio): só administradores, não mexe no controle
const ultAntes=JSON.stringify(DB.get('avisos/estado').d.relat);
k2=emails.length;r=await rodar({cli,enviar,agenda,agora:L('2026-12-02T10:00'),relatorioAgora:true});
check('--relatorio envia só aos administradores e não altera o controle', rel(emails.slice(k2)).map(e=>e.to[0].email).join()==='ana@h.org'&&JSON.stringify(DB.get('avisos/estado').d.relat)===ultAntes,{r});
// relatório desligado
put('config/main',{hospital:'H',avisos:{ativo:true,sevMin:2,copiaAdmin:false,relatorio:{modo:'off'}}});
k2=emails.length;await rodar({cli,enviar,agenda,agora:L('2027-01-04T08:00')});
check('relatório desligado não envia', rel(emails.slice(k2)).length===0);
const cr=calcularRelatorio({rondas:[],ncs:[],salas:{}},pS,L('2026-11-23T08:00'));
check('sem dados: conformidade nula, sem erro', cr.conf==null&&cr.execs===0&&cr.pareto.length===0);

// 8) provedor Resend (formato da requisição)
await enviarEmail({provider:'resend',apiKey:'rk',de:'a@b.c',nome:'Ronda',para:'x@y.z',assunto:'S',texto:'t',html:'<p>t</p>',apiUrl:base+'/email'});
const last=emails[emails.length-1];
check('formato Resend (from/to/subject + Bearer)', last.from==='Ronda <a@b.c>'&&last.to[0]==='x@y.z'&&last.headers.authorization==='Bearer rk',last);

// 9) código de acesso errado
const ruim=criarCliente({url:base,key:'k',codigo:'errado'});
let msg='';try{await ruim.get('avisos/estado')}catch(e){msg=e.message}
check('código de acesso errado é recusado', /codigo_invalido/.test(msg),msg);
srv.close();console.log(`\n${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
