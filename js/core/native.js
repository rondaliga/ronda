/* ==========================================================================
   Núcleo · recursos do aparelho (aplicativo Android/macOS, PWA ou navegador)
   - RH.native.tipo       : 'android' (Capacitor), 'desktop' (Electron/macOS) ou 'web'
   - RH.native.salvarArquivo(nome, texto, mime) : baixa (web/macOS) ou abre o menu Compartilhar (Android)
   - RH.native.imprimirModal() : imprime a janela aberta; no Android gera um arquivo HTML para compartilhar
     (o WebView do Android não imprime; no Chrome o arquivo pode ser salvo como PDF)
   - Botão Voltar do Android: fecha janela/câmera, volta à primeira tela, ou minimiza o app.
   ========================================================================== */
(()=>{
const RH=window.RH,{$}=RH,st=RH.st;
const cap=window.Capacitor,isCap=!!(cap&&cap.isNativePlatform&&cap.isNativePlatform());
const P=isCap?cap.Plugins||{}:{};
const tipo=isCap?'android':(window.rondaDesktop?'desktop':'web');
const N=RH.native={tipo,isApp:tipo!=='web'};
document.documentElement.classList.add('app-'+tipo);

const baixarWeb=(nome,texto,mime)=>{
  const b=new Blob([texto],{type:mime}),a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download=nome;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000)};

N.salvarArquivo=async(nome,texto,mime='text/plain')=>{
  if(tipo==='android'&&P.Filesystem&&P.Share){
    const w=await P.Filesystem.writeFile({path:nome,data:texto,directory:'CACHE',encoding:'utf8'});
    await P.Share.share({title:nome,files:[w.uri],dialogTitle:'Salvar ou enviar arquivo'});
    return}
  baixarWeb(nome,texto,mime)};

/* CSS atual do app, para o arquivo de relatório */
const cssTexto=()=>{let t='';for(const s of document.styleSheets){try{for(const r of s.cssRules)t+=r.cssText+'\n'}catch(e){}}return t};

N.imprimirModal=async titulo=>{
  if(tipo==='android'){
    const m=document.querySelector('#modal .mod');if(!m)return;
    const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${RH.esc(titulo||'Relatório')}</title><style>${cssTexto()}
body{padding:16px;max-width:900px;margin:0 auto;background:#fff;color:#000}.mh,.mf,.ic-btn,.no-print{display:none!important}.print-only{display:block!important}.mod{box-shadow:none;max-width:none;border:0}.mb{display:block}.mb>div{margin-bottom:12px}</style></head><body>${m.outerHTML}</body></html>`;
    const nome=(titulo||'relatorio').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.html';
    try{await N.salvarArquivo(nome,html,'text/html');RH.toast('Abra o arquivo no navegador e use Imprimir ou Salvar como PDF.')}
    catch(e){if(!/cancel/i.test(String(e&&e.message)))RH.toast('Não foi possível compartilhar o relatório.','bad')}
    return}
  document.body.classList.add('print-modal');
  const f=()=>{document.body.classList.remove('print-modal');removeEventListener('afterprint',f)};
  addEventListener('afterprint',f);print()};

/* botão Voltar do Android */
if(tipo==='android'&&P.App&&P.App.addListener){
  P.App.addListener('backButton',()=>{
    const cam=document.getElementById('cam-ov')||document.getElementById('scan-ov');
    if(cam){const b=cam.querySelector('#cam-x,button');b&&b.click();return}
    if($('#modal')&&$('#modal').firstChild){RH.closeModal();return}
    if(st.me&&st.page&&RH.access&&st.page!==RH.access.firstPage()){RH.go(RH.access.firstPage());return}
    if(P.App.minimizeApp)P.App.minimizeApp();else P.App.exitApp()})}

/* barra de status do Android combinando com o tema */
if(tipo==='android'&&P.StatusBar){try{P.StatusBar.setStyle({style:'DARK'});P.StatusBar.setBackgroundColor({color:'#0b2740'})}catch(e){}}
if(tipo==='android'&&P.SplashScreen){addEventListener('load',()=>setTimeout(()=>{try{P.SplashScreen.hide()}catch(e){}},300))}
})();
