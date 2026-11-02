/* ==========================================================================
   Dados de exemplo (fictícios) para conhecer o sistema. Todos os registros recebem
   demo:true e podem ser removidos em Cadastros → Hospital → "Remover dados de exemplo".
   ========================================================================== */
(()=>{
const RH=window.RH;
const {$,S,sod,toast}=RH;

function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

RH.seedDemo=async barId=>{
  const rnd=mulberry(42),pick=a=>a[Math.floor(rnd()*a.length)],docs=[],D=(c,id,d)=>docs.push([c,id,{...d,demo:true}]);
  const U=[['u1','Marina Albuquerque','Enfermeira RT · UTI','gestor'],['u2','Carlos Menezes','Engenheiro clínico','gestor'],['u3','Juliana Prado','Enfermeira · Centro Cirúrgico','inspetor'],['u4','Ricardo Teixeira','Técnico de segurança do trabalho','inspetor'],['u5','Patrícia Lima','Farmacêutica responsável','inspetor']];
  U.forEach(([i,n,c,r])=>D('users','demo_'+i,{nome:n,cargo:c,login:'demo.'+i,role:r,ativo:true}));
  const T=[['t1','Higienização deficiente',2,'Refazer a limpeza terminal e registrar.'],['t2','Equipamento com falha',3,'Retirar de uso e acionar a engenharia clínica.'],['t3','Calibração ou manutenção vencida',3,'Agendar a manutenção e sinalizar o equipamento.'],['t4','Medicamento ou insumo vencido',4,'Descartar conforme o PGRSS e repor o estoque.'],['t5','Temperatura fora da faixa',3,'Verificar o equipamento e avaliar o descarte dos itens.'],['t6','Alarme inoperante',4,'Testar, reparar e validar antes de reutilizar.'],['t7','Sinalização ou rota de fuga obstruída',2,'Desobstruir imediatamente.'],['t8','Falta de EPI',2,'Repor os EPIs no ponto de uso.'],['t9','Registro ou documentação incompleta',1,'Completar o registro com o responsável.']];
  T.forEach(([i,n,s,o])=>D('tiposNC','demo_'+i,{nome:n,sev:s,orient:o}));
  const CL={
   ca:['Sala · Área crítica','sala',['Limpeza e organização do ambiente','Temperatura entre 20 e 24 °C','Sinalização de segurança visível','EPIs disponíveis no ponto de uso','Descarte de perfurocortantes dentro do limite','Extintor com validade em dia','Saídas e rotas de fuga desobstruídas','Pontos de gases medicinais sem vazamentos']],
   cp:['Sala · Apoio e assistência','sala',['Limpeza e organização do ambiente','Lavatório com sabonete e papel toalha','Lixeiras identificadas e tampadas','Iluminação e climatização adequadas','Extintor com validade em dia']],
   es:['Equipamento · Suporte à vida','equipamento',['Integridade física, sem avarias','Cabos e conexões íntegros','Alarmes testados e audíveis','Bateria carregada','Etiqueta de calibração em dia','Limpeza e desinfecção realizadas']],
   et:['Equipamento · Esterilização','equipamento',['Integridade física, sem avarias','Indicador biológico/químico do ciclo conferido','Registro do ciclo preenchido','Porta e vedação íntegras','Etiqueta de manutenção em dia']],
   er:['Equipamento · Refrigeração de medicamentos','equipamento',['Temperatura entre 2 e 8 °C','Registro de temperatura do turno','Porta e vedação íntegras','Sem alimentos ou itens estranhos']],
   ee:['Equipamento · Carro de emergência','equipamento',['Lacre íntegro','Desfibrilador testado','Medicamentos dentro da validade','Laringoscópio e cânulas completos','Checklist de conferência assinado']]};
  Object.entries(CL).forEach(([k,[n,t,it]])=>D('checklists','demo_c'+k,{nome:n,tipo:t,itens:it.map((x,j)=>({id:'i'+j,t:x}))}));
  const SL=[['s1','UTI Adulto 01','UTI','2º andar','u1','ca',.09],['s2','UTI Adulto 02','UTI','2º andar','u1','ca',.05],['s3','UTI Neonatal','UTI','2º andar','u1','ca',.04],['s4','Centro Cirúrgico · Sala 1','Centro Cirúrgico','3º andar','u3','ca',.07],['s5','Centro Cirúrgico · Sala 2','Centro Cirúrgico','3º andar','u3','ca',.12],['s6','Emergência · Sala Vermelha','Emergência','Térreo','u4','ca',.1],['s7','Enfermaria 3A','Enfermaria','3º andar','u4','cp',.06],['s8','Farmácia Central','Farmácia','1º andar','u5','cp',.08],['s9','Central de Material Esterilizado','CME','Subsolo','u2','ca',.11],['s10','Diagnóstico por Imagem','Imagem','Térreo','u2','cp',.05]];
  SL.forEach(([i,n,s,a,r,c])=>D('salas','demo_'+i,{nome:n,setor:s,andar:a,responsavelId:'demo_'+r,checklistId:'demo_c'+c,ativo:true}));
  const EQ=[['e1','Ventilador pulmonar','Suporte à vida','s1','es',200],['e2','Monitor multiparamétrico','Suporte à vida','s1','es',90],['e3','Bomba de infusão','Suporte à vida','s2','es',45],['e4','Ventilador pulmonar','Suporte à vida','s2','es',-12],['e5','Incubadora neonatal','Suporte à vida','s3','es',150],['e6','Monitor multiparamétrico','Suporte à vida','s3','es',20],
   ['e7','Aparelho de anestesia','Suporte à vida','s4','es',120],['e8','Foco cirúrgico','Apoio cirúrgico','s4','es',300],['e9','Aparelho de anestesia','Suporte à vida','s5','es',60],['e10','Desfibrilador','Suporte à vida','s5','es',-3],
   ['e11','Carro de emergência','Emergência','s6','ee',400],['e12','Desfibrilador','Suporte à vida','s6','es',75],['e13','Aspirador cirúrgico','Suporte à vida','s6','es',180],['e14','Carro de emergência','Emergência','s7','ee',400],
   ['e15','Refrigerador de medicamentos','Refrigeração','s8','er',365],['e16','Refrigerador de vacinas','Refrigeração','s8','er',250],['e17','Autoclave 1','Esterilização','s9','et',30],['e18','Autoclave 2','Esterilização','s9','et',110],['e19','Termodesinfectora','Esterilização','s9','et',200],['e20','Tomógrafo','Diagnóstico','s10','es',160]];
  EQ.forEach(([i,n,c,s,k,d])=>D('equipamentos','demo_'+i,{nome:n,setor:SL.find(x=>x[0]===s)[2],checklistId:'demo_c'+k,ativo:true,thumb:null,fotoId:null}));

  /* rondas cadastradas ("Nome da ronda"): responsável vazio = todos os inspetores */
  const MD=[['m1','Ronda UTI · plantão diurno',['s1','s2','s3'],'u1',24],['m2','Ronda Centro Cirúrgico',['s4','s5'],'u3',24],['m3','Ronda Emergência e Enfermaria',['s6','s7'],'',24],['m4','Ronda Farmácia e CME',['s8','s9'],'u5',48],['m5','Ronda Diagnóstico por Imagem',['s10'],'',48]];
  const TODOS=[0,1,2,3,4,5,6],UTEIS=[1,2,3,4,5],AG={m1:[TODOS,['08:00']],m2:[UTEIS,['08:00']],m3:[TODOS,['10:00','22:00']],m4:[UTEIS,['09:00']],m5:[TODOS,['14:00']]};
  MD.forEach(([i,n,ss,r])=>D('modelos','demo_'+i,{nome:n,descricao:'',salaIds:ss.map(s=>'demo_'+s),equipIds:EQ.filter(e=>ss.includes(e[3])).map(e=>'demo_'+e[0]),responsavelId:r?'demo_'+r:'',dias:AG[i][0],horarios:AG[i][1],agendaDesde:Date.now()-30*864e5,ativo:true}));

  /* 4 semanas de execuções fictícias */
  const day=864e5,now=Date.now(),NOMES={u1:'Marina Albuquerque',u2:'Carlos Menezes',u3:'Juliana Prado',u4:'Ricardo Teixeira',u5:'Patrícia Lima'};
  for(let d=27;d>=0;d--)MD.forEach(([mid,mnome,ss,resp])=>{
    if(rnd()>.6&&d>0)return; if(d===0&&rnd()>.35)return;
    const ts=sod(now-d*day)+(6+Math.floor(rnd()*14))*36e5+Math.floor(rnd()*3600e3); if(ts>now)return;
    const inspK=resp||pick(['u3','u4','u5']),insp=NOMES[inspK],execId='demo_x'+mid+'_'+d;
    ss.forEach(sid=>{
      const [, sn,setor,, sresp,ck,q]=SL.find(x=>x[0]===sid);
      const itens=[],ncs=[],p=q*(.75+.5*d/27);
      const alv=[{a:'s',i:'demo_'+sid,n:sn,cl:CL[ck]},...EQ.filter(e=>e[3]===sid).map(e=>({a:'e',i:'demo_'+e[0],n:e[1],cl:CL[e[4]],eq:e}))];
      alv.forEach(al=>al.cl[2].forEach(t=>{const r=rnd()<p?'NC':(rnd()<.04?'IN':'C');itens.push({a:al.a,i:al.i,n:al.n,t,r,...(r==='IN'?{just:'Local inacessível durante a ronda (exemplo).'}:{})});if(r==='NC')ncs.push({al,t})}));
      const c=itens.filter(x=>x.r==='C').length,nc=ncs.length,ina=itens.length-c-nc,rid='demo_r'+sid+'_'+d;
      D('rondas',rid,{ts,execId,modeloId:'demo_'+mid,modeloNome:mnome,salaId:'demo_'+sid,salaNome:sn,setor,inspId:'demo_'+inspK,inspNome:insp,c,nc,ina,pct:c+nc?Math.round(c/(c+nc)*1000)/10:100,obs:'',itens});
      ncs.forEach((x,j)=>{
        const txt=x.t.toLowerCase();
        const ti=txt.includes('limpeza')||txt.includes('lixeira')||txt.includes('lavatório')?'t1':txt.includes('calibra')||txt.includes('manutenção')||txt.includes('etiqueta')?'t3':txt.includes('temperatura')?'t5':txt.includes('alarme')?'t6':txt.includes('validade')&&txt.includes('medic')?'t4':txt.includes('sinaliza')||txt.includes('saídas')||txt.includes('extintor')?'t7':txt.includes('epi')?'t8':txt.includes('registro')||txt.includes('checklist')||txt.includes('lacre')?'t9':rnd()<.5?'t2':'t9';
        const tp=T.find(t=>t[0]===ti),sev=Math.max(1,Math.min(4,tp[2]+(rnd()<.2?-1:rnd()<.15?1:0)));
        const r=rnd(),age=d,st=age>10?(r<.86?'resolvida':r<.95?'tratamento':'aberta'):age>3?(r<.45?'resolvida':r<.75?'tratamento':'aberta'):(r<.1?'resolvida':r<.4?'tratamento':'aberta');
        const desc={t1:'Superfície com resíduos e limpeza fora do padrão.',t2:'Equipamento apresentou falha durante a verificação.',t3:'Etiqueta de manutenção vencida ou ausente.',t4:'Item com validade expirada encontrado no ponto de uso.',t5:'Temperatura registrada fora da faixa preconizada.',t6:'Alarme sem resposta no teste de funcionamento.',t7:'Rota ou sinalização com obstrução parcial.',t8:'EPI indisponível no ponto de uso.',t9:'Registro do turno incompleto ou sem assinatura.'}[ti];
        D('ncs','demo_n'+sid+'_'+d+'_'+j,{ts,rondaId:rid,execId,modeloId:'demo_'+mid,modeloNome:mnome,salaId:'demo_'+sid,salaNome:sn,setor,eqId:x.al.eq?'demo_'+x.al.eq[0]:null,eqNome:x.al.eq?x.al.eq[1]:'',itemTexto:x.t,tipoId:'demo_'+ti,tipoNome:tp[1],sev,desc,thumb:null,fotoId:null,status:st,resp:'demo_'+sresp,prazo:ts+[0,14,7,3,1][sev]*day,inspNome:insp,resolucao:st==='resolvida'?'Ação corretiva executada e conferida pelo responsável.':'',resolvidoEm:st==='resolvida'?ts+(4+Math.floor(rnd()*70))*36e5:null});
      });
    });
  });

  /* grava em paralelo, com barra de progresso */
  let done=0;const tot=docs.length,tick=()=>{const bar=$(barId);if(bar){bar.hidden=false;bar.firstChild.style.width=(done/tot*100)+'%'}};
  let i=0;await Promise.all(Array.from({length:6},async()=>{while(i<docs.length){const [c,id,d]=docs[i++];try{await RH.put(c,id,d)}catch(e){console.error(e)}done++;tick()}}));
};

RH.wipeDemo=async()=>{
  const all=[];['users','salas','equipamentos','checklists','tiposNC','modelos','rondas','ncs'].forEach(c=>S[c].filter(x=>x.demo).forEach(x=>all.push([c,x.id])));
  let i=0;await Promise.all(Array.from({length:6},async()=>{while(i<all.length){const [c,id]=all[i++];try{await RH.del(c,id)}catch(e){console.error(e)}}}));
  toast('Dados de exemplo removidos.');
};
})();
