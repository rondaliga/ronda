/* Testes das regras de validação de presença (sem navegador): node tests/local.test.js */
const assert=require('assert');
const S={salas:[],equipamentos:[],cfg:{}};
global.window={RH:{S,st:{},byId:(a,id)=>a.find(x=>x.id===id),setorEq:e=>e.setor||''}};
const L=require('../js/core/local.js');
let n=0;const t=(nome,fn)=>{fn();n++;console.log('  OK  '+nome)};

S.salas=[
 {id:'s1',nome:'UTI 01',setor:'UTI',codigoLocal:'RH-S-UTI01',bssids:'aa:bb:cc:dd:ee:01\naa:bb:cc:dd:ff:*'},
 {id:'s2',nome:'UTI 02',setor:'UTI',codigoLocal:'RH-S-UTI02',bssids:'aa:bb:cc:dd:ee:02'},
 {id:'s3',nome:'Farmácia',setor:'Farmácia',codigoLocal:'RH-S-FARM',bssids:''},
 {id:'s4',nome:'Sem código',setor:'X'}];
S.equipamentos=[{id:'e1',nome:'Monitor',setor:'UTI',codigoLocal:'RH-E-MON1'}];
const pol={bssid:'se_disponivel'},polX={bssid:'exigir'};
const ok=v=>({ok:true,valor:v}),semBssid={ok:false,valor:'',msg:'sem leitura'};
const alvo=id=>L.alvoDoBloco({tipo:'sala',salaId:id});

t('normBssid aceita formatos e rejeita falsos',()=>{
  assert.strictEqual(L.normBssid('AA-BB-CC-DD-EE-01'),'aa:bb:cc:dd:ee:01');
  assert.strictEqual(L.normBssid('aabb.ccdd.ee01'),'aa:bb:cc:dd:ee:01');
  assert.strictEqual(L.normBssid('aabbccddee01'),'aa:bb:cc:dd:ee:01');
  assert.strictEqual(L.normBssid('02:00:00:00:00:00'),'');   // Android sem permissão
  assert.strictEqual(L.normBssid('lixo'),'');assert.strictEqual(L.normBssid(null),'')});
t('parseBssids: curingas só no fim e com 3+ octetos fixos',()=>{
  assert.deepStrictEqual(L.parseBssids('AA:BB:CC:DD:EE:01, aa:bb:cc:*:*:*\naa:bb:cc:dd:ee:01').lista,['aa:bb:cc:dd:ee:01','aa:bb:cc:*:*:*']);
  assert.strictEqual(L.parseBssids('aa:bb:*:*:*:*').invalidos.length,1);
  assert.strictEqual(L.parseBssids('aa:*:cc:dd:ee:ff').invalidos.length,1);
  assert.strictEqual(L.parseBssids('xx:bb:cc:dd:ee:ff').invalidos.length,1)});
t('código correto + antena correta = ok',()=>{
  const r=L.validar({alvo:alvo('s1'),lido:' rh-s-uti01 ',bssid:ok('aa:bb:cc:dd:ee:01'),pol});
  assert.deepStrictEqual([r.ok,r.codigo,r.rede],[true,'ok','confere'])});
t('curinga cobre outro rádio da antena',()=>{
  assert.ok(L.validar({alvo:alvo('s1'),lido:'RH-S-UTI01',bssid:ok('aa:bb:cc:dd:ff:7a'),pol}).ok)});
t('foto do código de outra sala é rejeitada e identifica a sala',()=>{
  const r=L.validar({alvo:alvo('s1'),lido:'RH-S-UTI02',bssid:ok('aa:bb:cc:dd:ee:01'),pol});
  assert.strictEqual(r.ok,false);assert.strictEqual(r.codigo,'codigo_outro_local');assert.match(r.msg,/UTI 02/)});
t('código desconhecido e vazio são rejeitados',()=>{
  assert.strictEqual(L.validar({alvo:alvo('s1'),lido:'123',bssid:ok('aa:bb:cc:dd:ee:01'),pol}).codigo,'codigo_incorreto');
  assert.strictEqual(L.validar({alvo:alvo('s1'),lido:'  ',bssid:ok('aa:bb:cc:dd:ee:01'),pol}).codigo,'vazio')});
t('código certo mas antena de outro local (foto à distância) é rejeitado',()=>{
  const r=L.validar({alvo:alvo('s1'),lido:'RH-S-UTI01',bssid:ok('aa:bb:cc:dd:ee:02'),pol});
  assert.deepStrictEqual([r.ok,r.codigo,r.rede],[false,'rede_fora','fora'])});
t('sem BSSID legível: aceita em se_disponivel, rejeita em exigir',()=>{
  const a=L.validar({alvo:alvo('s1'),lido:'RH-S-UTI01',bssid:semBssid,pol});
  assert.deepStrictEqual([a.ok,a.rede],[true,'indisponivel']);
  const b=L.validar({alvo:alvo('s1'),lido:'RH-S-UTI01',bssid:semBssid,pol:polX});
  assert.deepStrictEqual([b.ok,b.codigo],[false,'rede_indisponivel'])});
t('local sem antena cadastrada: só o código vale',()=>{
  const r=L.validar({alvo:alvo('s3'),lido:'RH-S-FARM',bssid:semBssid,pol:polX});
  assert.deepStrictEqual([r.ok,r.rede],[true,'sem_cadastro'])});
t('local sem código cadastrado não bloqueia',()=>{
  const r=L.validar({alvo:alvo('s4'),lido:'qualquer',bssid:semBssid,pol:polX});
  assert.deepStrictEqual([r.ok,r.codigo],[true,'sem_cadastro'])});
t('equipamento herda as antenas das salas do setor',()=>{
  const a=L.alvoDoBloco({tipo:'eq',eqIds:['e1']});
  assert.deepStrictEqual(L.parseBssids(a.bssids).lista,['aa:bb:cc:dd:ee:01','aa:bb:cc:dd:ff:*','aa:bb:cc:dd:ee:02']);
  assert.ok(L.validar({alvo:a,lido:'RH-E-MON1',bssid:ok('aa:bb:cc:dd:ee:02'),pol}).ok);
  assert.strictEqual(L.validar({alvo:a,lido:'RH-E-MON1',bssid:ok('11:22:33:44:55:66'),pol}).codigo,'rede_fora')});
t('estado/pendencias: exigir bloqueia até haver leitura válida; revalida registro adulterado',()=>{
  S.cfg={valLocal:'exigir'};
  const bl={id:'s1',tipo:'sala',salaId:'s1'},R={blocos:[bl,{id:'s4',tipo:'sala',salaId:'s4'}],chk:{}};
  assert.deepStrictEqual(L.pendencias(R).map(b=>b.id),['s1']);          // s4 sem código não bloqueia
  L.registrar(R,'s1',{ts:1,ok:false,codigo:'codigo_incorreto',msg:'x',lido:'0',bssid:''});
  assert.strictEqual(L.estado(R,bl).falhas.length,1);assert.ok(L.estado(R,bl).bloqueado);
  L.registrar(R,'s1',{ts:2,ok:true,codigo:'ok',rede:'confere',msg:'',lido:'RH-S-UTI01',bssid:'aa:bb:cc:dd:ee:01'});
  assert.strictEqual(L.pendencias(R).length,0);
  R.chk.s1.ok.bssid='11:22:33:44:55:66';                                 // rascunho adulterado
  assert.strictEqual(L.pendencias(R).length,1);
  R.chk.s1.ok.bssid='aa:bb:cc:dd:ee:01';S.cfg={valLocal:'off'};
  assert.strictEqual(L.pendencias(R).length,0);assert.strictEqual(L.evidencia(R,bl),null);
  S.cfg={valLocal:'registrar'};assert.strictEqual(L.pendencias(R).length,0);
  assert.strictEqual(L.evidencia(R,bl).status,'confirmada');
  assert.strictEqual(L.evidencia({blocos:[bl],chk:{}},bl).status,'nao_confirmada')});
t('liberação em grupo: ler a chave libera os vinculados; chave sem código ou ausente não libera',()=>{
  S.cfg={valLocal:'exigir'};
  const b1={id:'s1',tipo:'sala',salaId:'s1'},b2={id:'s2',tipo:'sala',salaId:'s2'},be={id:'eq:e1',tipo:'eq',eqIds:['e1']};
  const R={blocos:[b1,b2,be],chk:{},lib:{s2:'s1','eq:e1':'s1'}};
  assert.deepStrictEqual(L.pendencias(R).map(b=>b.id),['s1','s2','eq:e1']);
  assert.strictEqual(L.estado(R,b2).viaId,'s1');assert.strictEqual(L.dependentes(R,'s1').length,2);
  /* ler o código do dependente na chave errada não vale: a presença é a da chave */
  L.registrar(R,'s1',{ts:5,ok:true,codigo:'ok',rede:'confere',msg:'',lido:'RH-S-UTI01',bssid:'aa:bb:cc:dd:ee:01'});
  assert.strictEqual(L.pendencias(R).length,0);
  const ev=L.evidencia(R,b2);assert.deepStrictEqual([ev.status,ev.via],['confirmada','UTI 01']);
  R.chk.s1.ok.bssid='aa:bb:cc:dd:ee:02';                       /* antena de outro local: chave invalida e todos voltam a bloquear */
  assert.strictEqual(L.pendencias(R).length,3);
  R.chk.s1.ok.bssid='aa:bb:cc:dd:ee:01';
  assert.deepStrictEqual(L.pendencias({...R,blocos:[b2],lib:{s2:'s1'}}).map(b=>b.id),['s2']);   /* chave fora da ronda: exige o próprio código */
  assert.deepStrictEqual(L.pendencias({blocos:[b1,{id:'s4',tipo:'sala',salaId:'s4'}],chk:{},lib:{s1:'s4'}}).map(b=>b.id),['s1']); /* chave sem código */
  S.cfg={}});
t('validaCadastro: normaliza, exige unicidade e BSSID válido',()=>{
  const d={codigoLocal:' rh-s-novo ',bssids:'AA-BB-CC-DD-EE-09'};
  assert.strictEqual(L.validaCadastro(d,'salas',undefined),'');
  assert.deepStrictEqual([d.codigoLocal,d.bssids],['RH-S-NOVO','aa:bb:cc:dd:ee:09']);
  assert.match(L.validaCadastro({codigoLocal:'rh-s-uti02',bssids:''},'salas','s1'),/já está em uso/);
  assert.strictEqual(L.validaCadastro({codigoLocal:'RH-S-UTI01',bssids:''},'salas','s1'),'');   // o próprio registro
  assert.match(L.validaCadastro({codigoLocal:'ab',bssids:''},'salas','s1'),/ao menos 4/);
  assert.match(L.validaCadastro({codigoLocal:'',bssids:'zz'},'salas','s1'),/BSSID inválido/)});
console.log(`\n${n} testes passaram`);
