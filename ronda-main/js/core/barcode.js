/* ==========================================================================
   Núcleo · gerador de QR Code e Code 128 (sem bibliotecas, devolve SVG)
   - RH.barcode.qrSvg(texto)       QR Code, correção de erro nível Q (~25%), versões 1–6 (até 74 bytes)
   - RH.barcode.code128Svg(texto)  Code 128 (conjunto B: ASCII 32–126)
   Usado em Cadastros → Salas/Equipamentos → "Imprimir etiquetas".
   ========================================================================== */
(()=>{
const RH=(window.RH=window.RH||{});

/* ---------------- QR Code ---------------- */
const EXP=new Uint8Array(512),LOG=new Uint8Array(256);
{let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&256)x^=0x11d}for(let i=255;i<512;i++)EXP[i]=EXP[i-255]}
const gmul=(a,b)=>a&&b?EXP[LOG[a]+LOG[b]]:0;
function rsRem(data,n){
  let g=[1];
  for(let i=0;i<n;i++){const h=new Array(g.length+1).fill(0);g.forEach((c,j)=>{h[j]^=c;h[j+1]^=gmul(c,EXP[i])});g=h}
  const r=new Array(n).fill(0);
  for(const d of data){const f=d^r[0];r.shift();r.push(0);if(f)for(let i=0;i<n;i++)r[i]^=gmul(g[i+1],f)}
  return r}

/* nível Q: palavras de correção por bloco e grupos [nº de blocos, palavras de dados por bloco] */
const VER={1:{ec:13,g:[[1,13]]},2:{ec:22,g:[[1,22]]},3:{ec:18,g:[[2,17]]},4:{ec:26,g:[[2,24]]},5:{ec:18,g:[[2,15],[2,16]]},6:{ec:24,g:[[4,19]]}};
const ALIGN={2:18,3:22,4:26,5:30,6:34};
const dataCap=v=>VER[v].g.reduce((s,[n,d])=>s+n*d,0);
const MASKS=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,
  (x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];

function qrMatrix(text){
  const bytes=[...new TextEncoder().encode(String(text))];
  const v=[1,2,3,4,5,6].find(k=>bytes.length<=dataCap(k)-2);
  if(!v)throw new Error('Texto longo demais para o QR Code (máximo de 74 caracteres).');
  /* 1) bits de dados: modo byte (0100) + contagem (8 bits) + bytes + terminador + preenchimento */
  const bits=[],put=(val,n)=>{for(let i=n-1;i>=0;i--)bits.push((val>>>i)&1)};
  put(4,4);put(bytes.length,8);bytes.forEach(b=>put(b,8));
  const cap=dataCap(v)*8;put(0,Math.min(4,cap-bits.length));
  while(bits.length%8)bits.push(0);
  for(let p=0;bits.length<cap;p^=1)put(p?0x11:0xEC,8);
  const cw=[];for(let i=0;i<bits.length;i+=8)cw.push(parseInt(bits.slice(i,i+8).join(''),2));
  /* 2) blocos + Reed-Solomon, intercalados */
  const {ec,g}=VER[v],blocks=[];let pos=0;
  g.forEach(([n,d])=>{for(let i=0;i<n;i++){const data=cw.slice(pos,pos+d);pos+=d;blocks.push({data,ec:rsRem(data,ec)})}});
  const out=[],maxD=Math.max(...blocks.map(b=>b.data.length));
  for(let i=0;i<maxD;i++)blocks.forEach(b=>{if(i<b.data.length)out.push(b.data[i])});
  for(let i=0;i<ec;i++)blocks.forEach(b=>out.push(b.ec[i]));
  const all=[];out.forEach(b=>{for(let i=7;i>=0;i--)all.push((b>>>i)&1)});
  /* 3) matriz: padrões fixos */
  const N=17+4*v,M=Array.from({length:N},()=>new Array(N).fill(false)),F=Array.from({length:N},()=>new Array(N).fill(false));
  const set=(x,y,d)=>{if(x>=0&&y>=0&&x<N&&y<N){M[y][x]=d;F[y][x]=true}};
  const finder=(cx,cy)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const m=Math.max(Math.abs(dx),Math.abs(dy));set(cx+dx,cy+dy,m!==2&&m!==4)}};
  for(let i=0;i<N;i++){set(6,i,i%2===0);set(i,6,i%2===0)}   /* temporização primeiro: os quadrados de localização a sobrescrevem */
  finder(3,3);finder(N-4,3);finder(3,N-4);
  if(ALIGN[v]){const c=ALIGN[v];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(c+dx,c+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1)}
  const fmt=mask=>{
    const d=(3<<3)|mask;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);
    const b=((d<<10)|r)^0x5412,bit=i=>((b>>>i)&1)===1;
    for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));
    for(let i=9;i<15;i++)set(14-i,8,bit(i));
    for(let i=0;i<8;i++)set(N-1-i,8,bit(i));for(let i=8;i<15;i++)set(8,N-15+i,bit(i));
    set(8,N-8,true)};
  fmt(0);                                   /* só para reservar as áreas de formato */
  /* 4) dados em zigue-zague */
  let k=0;
  for(let right=N-1;right>=1;right-=2){
    if(right===6)right=5;
    for(let vert=0;vert<N;vert++)for(let j=0;j<2;j++){
      const x=right-j,y=((right+1)&2)===0?N-1-vert:vert;
      if(!F[y][x]&&k<all.length)M[y][x]=all[k++]===1}}
  /* 5) escolhe a máscara de menor penalidade */
  const apply=mask=>M.map((row,y)=>row.map((d,x)=>F[y][x]?d:d!==MASKS[mask](x,y)));
  const penalty=m=>{
    let p=0;
    for(let t=0;t<2;t++)for(let a=0;a<N;a++){
      let run=1;
      for(let b=1;b<N;b++){const c=t?m[b][a]:m[a][b],q=t?m[b-1][a]:m[a][b-1];if(c===q){run++;if(run===5)p+=3;else if(run>5)p++}else run=1}}
    for(let y=0;y<N-1;y++)for(let x=0;x<N-1;x++)if(m[y][x]===m[y][x+1]&&m[y][x]===m[y+1][x]&&m[y][x]===m[y+1][x+1])p+=3;
    const pat=[1,0,1,1,1,0,1],white=[0,0,0,0];
    for(let y=0;y<N;y++)for(let i=0;i+11<=N;i++){const s=[];for(let j=0;j<11;j++)s.push(m[y][i+j]?1:0);
      if(s.every((x,j)=>x===pat.concat(white)[j])||s.every((x,j)=>x===white.concat(pat)[j]))p+=40}
    for(let x=0;x<N;x++)for(let i=0;i+11<=N;i++){const s=[];for(let j=0;j<11;j++)s.push(m[i+j][x]?1:0);
      if(s.every((x2,j)=>x2===pat.concat(white)[j])||s.every((x2,j)=>x2===white.concat(pat)[j]))p+=40}
    const dark=m.reduce((s,r)=>s+r.filter(Boolean).length,0),tot=N*N;
    p+=Math.max(0,Math.ceil(Math.abs(dark*20-tot*10)/tot)-1)*10;
    return p};
  let best=0,bestP=Infinity,bestM=null;
  for(let mask=0;mask<8;mask++){const m=apply(mask),p=penalty(m);if(p<bestP){bestP=p;best=mask;bestM=m}}
  /* grava o formato final sobre a matriz mascarada */
  const mm=bestM;
  {const d=(3<<3)|best;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);
    const b=((d<<10)|r)^0x5412,bit=i=>((b>>>i)&1)===1,w=(x,y,val)=>{mm[y][x]=val};
    for(let i=0;i<=5;i++)w(8,i,bit(i));w(8,7,bit(6));w(8,8,bit(7));w(7,8,bit(8));
    for(let i=9;i<15;i++)w(14-i,8,bit(i));
    for(let i=0;i<8;i++)w(N-1-i,8,bit(i));for(let i=8;i<15;i++)w(8,N-15+i,bit(i));
    w(8,N-8,true)}
  return mm}

function qrSvg(text,{quiet=4,color='#000'}={}){
  const m=qrMatrix(text),N=m.length,T=N+quiet*2;let d='';
  m.forEach((row,y)=>{for(let x=0;x<N;){if(!row[x]){x++;continue}let e=x;while(e<N&&row[e])e++;d+=`M${x+quiet} ${y+quiet}h${e-x}v1h${x-e}z`;x=e}});
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="${T}" height="${T}" fill="#fff"/><path d="${d}" fill="${color}"/></svg>`}

/* ---------------- Code 128 (conjunto B) ---------------- */
const C128=('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ');
function code128Widths(text){
  const s=String(text),vals=[];
  for(const ch of s){const c=ch.charCodeAt(0);if(c<32||c>126)throw new Error('O Code 128 desta etiqueta aceita só caracteres ASCII simples (sem acentos).');vals.push(c-32)}
  let sum=104;vals.forEach((v,i)=>{sum+=v*(i+1)});
  return [104,...vals,sum%103,106].map(v=>C128[v]).join('')}

function code128Svg(text,{quiet=10,height=60,color='#000'}={}){
  const w=code128Widths(text);let x=quiet,bar=true,d='';
  for(const ch of w){const n=+ch;if(bar)d+=`M${x} 0h${n}v${height}h${-n}z`;x+=n;bar=!bar}
  const T=x+quiet;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Código de barras"><rect width="${T}" height="${height}" fill="#fff"/><path d="${d}" fill="${color}"/></svg>`}

RH.barcode={qrMatrix,qrSvg,code128Svg,code128Widths};
if(typeof module!=='undefined'&&module.exports)module.exports=RH.barcode;
})();
