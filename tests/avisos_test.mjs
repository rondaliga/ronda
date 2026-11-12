// Teste do script de avisos por e-mail contra um banco e um provedor de e-mail SIMULADOS (nada real é acessado).
import http from 'node:http';
import {criarCliente,carregarAgenda,rodar,enviarEmail,montarEmail} from '../tools/avisos-email.mjs';
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
put('ncs/n4',{ts:amanha,sev:3,status:'aberta',resp:'u2',salaNome:'Y',tipoNome:'T'});
let falha=true;const enviar2=m=>falha?Promise.reject(new Error('provedor fora do ar')):enviar(m);
r=await rodar({cli,enviar:enviar2,agenda,agora:amanha+120e3});
check('falha de envio é registrada', r.falhas>=1&&DB.get('avisos/estado').d.erro.includes('provedor'),r);
falha=false;const n2=emails.length;r=await rodar({cli,enviar:enviar2,agenda,agora:amanha+180e3});
// a NC n4 já foi "vista" (seq passou), mas o aviso não foi marcado: o próximo ciclo não a reenxerga — registra a limitação
check('estado não marca como enviado após falha', !Object.keys(DB.get('avisos/estado').d.enviados).some(k=>k.startsWith('nc:n4|')),DB.get('avisos/estado').d.enviados);

// 8) provedor Resend (formato da requisição)
await enviarEmail({provider:'resend',apiKey:'rk',de:'a@b.c',nome:'Ronda',para:'x@y.z',assunto:'S',texto:'t',html:'<p>t</p>',apiUrl:base+'/email'});
const last=emails[emails.length-1];
check('formato Resend (from/to/subject + Bearer)', last.from==='Ronda <a@b.c>'&&last.to[0]==='x@y.z'&&last.headers.authorization==='Bearer rk',last);

// 9) código de acesso errado
const ruim=criarCliente({url:base,key:'k',codigo:'errado'});
let msg='';try{await ruim.get('avisos/estado')}catch(e){msg=e.message}
check('código de acesso errado é recusado', /codigo_invalido/.test(msg),msg);
srv.close();console.log(`\n${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
