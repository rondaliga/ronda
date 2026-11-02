/* ==========================================================================
   Núcleo · imagens
   Reduz fotos (câmera do celular) antes de gravar: miniatura 160 px e versão
   completa 960 px, ambas em JPEG. Devolve {thumb, full} (data URLs).

   Pensado para celulares com pouca memória: a foto original (12 MP ou mais) é
   decodificada UMA vez, sem passar por um data URL gigante (FileReader), e os
   bitmaps/canvas são liberados logo em seguida. A miniatura sai da versão já
   reduzida. Antes, a foto era lida e decodificada duas vezes em tamanho original,
   o que podia fazer o navegador do celular encerrar a página.
   ========================================================================== */
(()=>{
const RH=window.RH;

/* decodifica o arquivo uma única vez → {src, w, h, free()} */
async function decode(file){
  if(window.createImageBitmap){
    /* foto de câmera (grande): já decodifica reduzida (≈1200 px) em vez de 12 MP+ inteiros na memória */
    if(file.size>4e5){try{const b=await createImageBitmap(file,{resizeWidth:1200,resizeQuality:'medium',imageOrientation:'from-image'});return{src:b,w:b.width,h:b.height,free:()=>{try{b.close()}catch(e){}}}}catch(e){}}
    try{const b=await createImageBitmap(file,{imageOrientation:'from-image'});return{src:b,w:b.width,h:b.height,free:()=>{try{b.close()}catch(e){}}}}
    catch(e){/* formato/opção não suportada: tenta o caminho clássico abaixo */}}
  const url=URL.createObjectURL(file);
  try{const im=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=url});
    return{src:im,w:im.naturalWidth||im.width,h:im.naturalHeight||im.height,free:()=>{im.src='';URL.revokeObjectURL(url)}}}
  catch(e){URL.revokeObjectURL(url);throw e}}

function draw(src,w,h,max,q){
  const k=Math.min(1,max/Math.max(w,h)),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(w*k));c.height=Math.max(1,Math.round(h*k));
  const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(src,0,0,c.width,c.height);
  const out=c.toDataURL('image/jpeg',q);c.width=c.height=0;return out}

RH.processImg=async file=>{
  const d=await decode(file);
  try{
    const full=draw(d.src,d.w,d.h,960,.7);
    /* miniatura a partir da versão reduzida (barato), não da foto original */
    const im=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=full});
    const thumb=draw(im,im.naturalWidth||im.width,im.naturalHeight||im.height,160,.6);
    return{thumb,full}}
  finally{d.free()}};
})();
