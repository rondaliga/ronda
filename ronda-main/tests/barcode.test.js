/* Estrutura do Code 128 e limites do QR (a leitura real é verificada em tests/e2e_local.py com o OpenCV): node tests/barcode.test.js */
const assert=require('assert');global.window={RH:{}};
const B=require('../js/core/barcode.js');let n=0;const t=(nome,fn)=>{fn();n++;console.log('  OK  '+nome)};
const tabela=require('fs').readFileSync(__dirname+'/../js/core/barcode.js','utf8').match(/const C128=\('([^']+)'\)/)[1].split(' ');
t('tabela do Code 128: 107 padrões únicos, soma 11 (stop 13), barras pares e espaços ímpares',()=>{
  assert.strictEqual(tabela.length,107);assert.strictEqual(new Set(tabela).size,107);
  tabela.slice(0,106).forEach(p=>{const d=[...p].map(Number);assert.strictEqual(d.reduce((a,b)=>a+b),11);assert.strictEqual((d[0]+d[2]+d[4])%2,0);assert.strictEqual((d[1]+d[3]+d[5])%2,1)});
  assert.strictEqual(tabela[106],'2331112')});
t('Code 128: largura = 11 módulos por símbolo + stop 13 e checksum correto',()=>{
  const w=B.code128Widths('PJJ123C'),mods=[...w].reduce((a,b)=>a+ +b,0);
  assert.strictEqual(mods,11*(1+7+1)+13);
  let sum=104;[...'PJJ123C'].forEach((c,i)=>sum+=(c.charCodeAt(0)-32)*(i+1));
  assert.ok(w.includes(tabela[sum%103]));
  assert.throws(()=>B.code128Widths('Recepção'),/ASCII/)});
t('QR: tamanhos por versão e limite de 74 bytes',()=>{
  assert.strictEqual(B.qrMatrix('RH-S-K7M2QX').length,21);   // v1
  assert.strictEqual(B.qrMatrix('x'.repeat(20)).length,25);   // v2
  assert.strictEqual(B.qrMatrix('x'.repeat(74)).length,41);   // v6
  assert.throws(()=>B.qrMatrix('x'.repeat(75)),/longo demais/)});
t('SVGs são gerados',()=>{assert.match(B.qrSvg('RH-S-AAAAAA'),/^<svg[^>]+viewBox="0 0 29 29"/);assert.match(B.code128Svg('RH-S-AAAAAA'),/<path d="M/)});
console.log(`\n${n} testes passaram`);
