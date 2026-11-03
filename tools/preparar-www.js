/* Copia o app para www/ (pasta que o Android e o macOS empacotam). Uso: node tools/preparar-www.js */
const fs=require('fs'),path=require('path');
const raiz=path.resolve(__dirname,'..'),dest=path.join(raiz,'www');
fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});
for(const x of ['index.html','manifest.webmanifest','sw.js','css','js','icons'])
  fs.cpSync(path.join(raiz,x),path.join(dest,x),{recursive:true});
/* leitor de código de barras (ZXing) embutido, para funcionar sem internet */
const zx=path.join(raiz,'node_modules','@zxing','library','umd','index.min.js');
if(fs.existsSync(zx)){fs.mkdirSync(path.join(dest,'js','vendor'),{recursive:true});fs.copyFileSync(zx,path.join(dest,'js','vendor','zxing-library.min.js'));console.log('ZXing incluído')}
else console.log('Aviso: ZXing não encontrado (rode npm install). O leitor usará a internet se o aparelho não tiver BarcodeDetector.');
console.log('www/ pronto');
