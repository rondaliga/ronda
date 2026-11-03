/* Depois de "npx cap add android": permissões, plugin de Wi-Fi (BSSID), MainActivity e versão. */
const fs=require('fs'),path=require('path');
const raiz=path.resolve(__dirname,'..'),app=path.join(raiz,'android','app');
if(!fs.existsSync(app)){console.error('Pasta android/ não existe. Rode: npm run android:add');process.exit(1)}
/* 1) permissões */
const mf=path.join(app,'src','main','AndroidManifest.xml');let x=fs.readFileSync(mf,'utf8');
const perms=['android.permission.INTERNET','android.permission.CAMERA','android.permission.ACCESS_FINE_LOCATION','android.permission.ACCESS_COARSE_LOCATION','android.permission.ACCESS_WIFI_STATE','android.permission.ACCESS_NETWORK_STATE'];
let add='';perms.forEach(p=>{if(!x.includes(p))add+=`    <uses-permission android:name="${p}" />\n`});
if(!x.includes('android.hardware.camera'))add+='    <uses-feature android:name="android.hardware.camera" android:required="false" />\n';
if(add)x=x.replace('</manifest>',add+'</manifest>');
/* travar em retrato e evitar reiniciar a tela ao girar/abrir teclado */
if(!x.includes('android:screenOrientation'))x=x.replace('<activity','<activity android:screenOrientation="portrait"');
fs.writeFileSync(mf,x);
/* 2) plugin de Wi-Fi e MainActivity */
const pkg='br/hospital/ronda',dir=path.join(app,'src','main','java',...pkg.split('/'));fs.mkdirSync(dir,{recursive:true});
for(const f of ['RondaWifiPlugin.java','MainActivity.java'])fs.copyFileSync(path.join(raiz,'android-extras',f),path.join(dir,f));
/* 3) versão (cada build novo precisa de versionCode maior para atualizar por cima) */
const gr=path.join(app,'build.gradle');let g=fs.readFileSync(gr,'utf8');
const code=+(process.env.VERSION_CODE||process.env.GITHUB_RUN_NUMBER||1),nome=process.env.VERSION_NAME||'2026.11.2';
g=g.replace(/versionCode\s+\d+/,`versionCode ${code}`).replace(/versionName\s+"[^"]*"/,`versionName "${nome}"`);
fs.writeFileSync(gr,g);console.log('Android preparado: versionCode',code);
