#!/usr/bin/env node
/* Atualiza a versão do aplicativo em TODOS os lugares de uma vez:
     node tools/atualizar-versao.js 1.0.5            (data = hoje)
     node tools/atualizar-versao.js 1.0.5 2026-12-01 (data informada)
     node tools/atualizar-versao.js --verificar       (só confere se está tudo igual; usado no GitHub Actions)
   Arquivos: package.json, js/core/versao.js (rodapé do app), index.html (?v=), sw.js (cache). */
const fs=require('fs'),path=require('path'),R=p=>path.join(__dirname,'..',p);
const ler=p=>fs.readFileSync(R(p),'utf8'),gravar=(p,s)=>fs.writeFileSync(R(p),s);
const pkgV=()=>JSON.parse(ler('package.json')).version;
const arg=process.argv[2];

if(arg==='--verificar'){
  const v=pkgV(),m=ler('js/core/versao.js').match(/RH\.VERSAO='([^']+)'/),erros=[];
  if(!m||m[1]!==v)erros.push(`js/core/versao.js tem ${m?m[1]:'(nada)'} e package.json tem ${v}`);
  const iv=[...ler('index.html').matchAll(/\?v=([\w.]+)"/g)].map(x=>x[1]);
  if(iv.some(x=>x!==v))erros.push(`index.html tem ?v= diferente de ${v}`);
  if(!ler('sw.js').includes(`const V='ronda-v${v}'`))erros.push(`sw.js não está em ronda-v${v}`);
  if(erros.length){console.error('Versões desencontradas:\n - '+erros.join('\n - ')+'\nRode: node tools/atualizar-versao.js '+v);process.exit(1)}
  console.log('Versão '+v+' consistente em todos os arquivos.');process.exit(0)}

if(!/^\d+\.\d+\.\d+$/.test(arg||'')){console.error('Uso: node tools/atualizar-versao.js 1.0.5 [AAAA-MM-DD]');process.exit(1)}
const hoje=new Date(Date.now()-3*36e5).toISOString().slice(0,10),data=process.argv[3]||hoje;
if(!/^\d{4}-\d{2}-\d{2}$/.test(data)){console.error('Data inválida (use AAAA-MM-DD).');process.exit(1)}
gravar('package.json',ler('package.json').replace(/("version":\s*")[^"]+(")/,`$1${arg}$2`));
gravar('js/core/versao.js',ler('js/core/versao.js').replace(/RH\.VERSAO='[^']*'/,`RH.VERSAO='${arg}'`).replace(/RH\.VERSAO_DATA='[^']*'/,`RH.VERSAO_DATA='${data}'`));
gravar('index.html',ler('index.html').replace(/\?v=[\w.]+"/g,`?v=${arg}"`));
gravar('sw.js',ler('sw.js').replace(/const V='[^']*'/,`const V='ronda-v${arg}'`));
console.log(`Versão ${arg} (${data}) gravada em package.json, js/core/versao.js, index.html e sw.js.`);
