/* ==========================================================================
   Núcleo · validação de presença no local (código de barras + antena Wi-Fi / BSSID)

   Cada sala ou equipamento pode ter:
     - codigoLocal : valor do código de barras/QR impresso e fixado no local;
     - bssids      : antenas Wi-Fi (BSSID) que cobrem o local, uma por linha. Aceita curinga
                     no final (aa:bb:cc:dd:*:*) para antenas com vários rádios/SSIDs.
   Equipamento sem BSSID próprio herda os BSSIDs das salas do mesmo setor.

   Política (Cadastros → Hospital, gravada em config/main):
     valLocal : 'off' (padrão, comportamento antigo) | 'registrar' (grava a evidência, não bloqueia)
                | 'exigir' (o checklist do local só é liberado após ler o código; não finaliza sem isso)
     valBssid : 'se_disponivel' (padrão) | 'exigir' (sem BSSID legível = leitura rejeitada)

   O BSSID NÃO pode ser lido por JavaScript em navegador comum. Ele só vem de uma camada nativa
   (Capacitor + @capgo/capacitor-wifi, ou uma ponte própria window.RondaNativo.getBssid()).
   Veja VALIDACAO-LOCAL.md.

   API: window.RH.local  (a parte de regras — validar, parseBssids… — não depende da tela e é testada em tests/local.test.js)
   ========================================================================== */
(()=>{
const RH=window.RH,{S,st,byId}=RH;

/* ---------- normalização ---------- */
const normCodigo=s=>String(s??'').normalize('NFKC').replace(/\s+/g,'').toUpperCase();

/* 6 octetos (hex ou *), aceitando aa:bb:.., aa-bb-.., aabb.ccdd.eeff e aabbccddeeff */
function octetos(s){
  s=String(s??'').trim().toLowerCase();
  if(/^[0-9a-f]{12}$/.test(s))return s.match(/../g);
  if(/^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/.test(s))return s.replace(/\./g,'').match(/../g);
  const p=s.split(/[:-]/);
  return p.length===6&&p.every(x=>/^([0-9a-f]{2}|\*)$/.test(x))?p:null}
/* valores que o Android devolve quando NÃO tem permissão/localização ligada não são antenas reais */
const BSSID_FALSOS=new Set(['00:00:00:00:00:00','02:00:00:00:00:00','ff:ff:ff:ff:ff:ff']);
function normBssid(s){const o=octetos(s);if(!o||o.includes('*'))return '';const j=o.join(':');return BSSID_FALSOS.has(j)?'':j}

/* texto do cadastro → {lista:[padrões normalizados], invalidos:[trechos com erro]} */
function parseBssids(txt){
  const lista=[],invalidos=[];
  String(txt??'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean).forEach(t=>{
    const o=octetos(t),w=o?o.indexOf('*'):-1;
    /* curinga só no final e com pelo menos 3 octetos fixos (senão qualquer antena passaria) */
    if(!o||(w!==-1&&(w<3||o.slice(w).some(x=>x!=='*')))||o.join(':')==='00:00:00:00:00:00'||o.join(':')==='02:00:00:00:00:00'){invalidos.push(t);return}
    const j=o.join(':');if(!lista.includes(j))lista.push(j)});
  return {lista,invalidos}}
function bssidConfere(b,lista){
  const o=octetos(b);if(!o||o.includes('*'))return false;
  return lista.some(p=>{const q=octetos(p);return !!q&&q.every((x,i)=>x==='*'||x===o[i])})}

/* ---------- política e alvos ---------- */
const politica=()=>({
  modo:['registrar','exigir'].includes(S.cfg.valLocal)?S.cfg.valLocal:'off',
  bssid:S.cfg.valBssid==='exigir'?'exigir':'se_disponivel'});

const alvos=()=>[
  ...S.salas.map(s=>({tipo:'s',id:s.id,nome:s.nome,codigoLocal:s.codigoLocal})),
  ...S.equipamentos.map(e=>({tipo:'e',id:e.id,nome:e.nome,codigoLocal:e.codigoLocal}))];

/* cada bloco da ronda tem exatamente um alvo: a sala ou o equipamento */
function alvoDoBloco(bl){
  const sala=bl.tipo==='sala',x=sala?byId(S.salas,bl.salaId):byId(S.equipamentos,(bl.eqIds||[])[0]);
  if(!x)return null;
  let bssids=x.bssids||'';
  const setor=sala?x.setor:RH.setorEq(x);
  if(!sala&&!parseBssids(bssids).lista.length&&setor)bssids=S.salas.filter(s=>s.setor===setor).map(s=>s.bssids||'').join('\n');
  return {tipo:sala?'s':'e',id:x.id,nome:x.nome,setor,codigoLocal:x.codigoLocal||'',bssids}}

/* ---------- regra de validação (função pura) ----------
   entrada : alvo {nome,codigoLocal,bssids}, lido (texto do código), bssid {ok,valor,msg}, pol {bssid}
   saída   : {ok, codigo, rede, msg}
     codigo: ok | sem_cadastro | vazio | codigo_incorreto | codigo_outro_local | rede_fora | rede_indisponivel
     rede  : confere | fora | indisponivel | sem_cadastro | nao_exigida | nao_verificada            */
function validar({alvo,lido,bssid,pol}){
  const R=(ok,codigo,msg,rede)=>({ok,codigo,msg,rede});
  const L=normCodigo(lido),esperado=normCodigo(alvo.codigoLocal);
  if(!L)return R(false,'vazio','Nenhum código foi lido.','nao_verificada');
  if(!esperado)return R(true,'sem_cadastro','Este local não tem código cadastrado: presença não verificada.','nao_exigida');
  if(L!==esperado){
    const dono=alvos().find(a=>normCodigo(a.codigoLocal)===L);
    return dono?R(false,'codigo_outro_local',`Este código pertence a "${dono.nome}", não a "${alvo.nome}".`,'nao_verificada')
               :R(false,'codigo_incorreto',`O código lido não corresponde a "${alvo.nome}".`,'nao_verificada')}
  const lista=parseBssids(alvo.bssids).lista;
  if(!lista.length)return R(true,'ok','Código confere.','sem_cadastro');
  if(bssid&&bssid.ok)return bssidConfere(bssid.valor,lista)
    ?R(true,'ok','Código e antena Wi-Fi conferem.','confere')
    :R(false,'rede_fora',`Você está conectado a uma antena Wi-Fi que não pertence a "${alvo.nome}".`,'fora');
  if(pol&&pol.bssid==='exigir')return R(false,'rede_indisponivel',(bssid&&bssid.msg)||'Não foi possível identificar a antena Wi-Fi deste aparelho.','indisponivel');
  return R(true,'ok','Código confere (antena Wi-Fi não verificada neste aparelho).','indisponivel')}

/* ---------- leitura do BSSID (camada nativa) ---------- */
const MSG_BSSID={
  navegador:'Este navegador não permite ler a antena Wi-Fi. Use o aplicativo da Ronda (Android).',
  permissao:'Permita o acesso à localização e deixe a localização do aparelho ligada para identificar a antena Wi-Fi.',
  semwifi:'O aparelho não está conectado a uma rede Wi-Fi.',
  erro:'Não foi possível ler a antena Wi-Fi.'};
const comTempo=(p,ms)=>Promise.race([p,new Promise((_,no)=>setTimeout(()=>no(new Error('timeout')),ms))]);

async function bssidBruto(){
  if(typeof RH.local.provedorBssid==='function'){const r=await RH.local.provedorBssid();return typeof r==='string'?{valor:r}:(r||{})}
  const cap=window.Capacitor,W=cap&&cap.Plugins&&cap.Plugins.CapacitorWifi;
  if(W&&(!cap.isNativePlatform||cap.isNativePlatform())){
    let p=await W.checkPermissions();
    if(!p||p.location!=='granted')p=await W.requestPermissions();
    if(!p||p.location!=='granted')return {motivo:'permissao'};
    const i=await W.getWifiInfo();return {valor:i&&i.bssid}}
  if(window.RondaNativo&&typeof window.RondaNativo.getBssid==='function')return {valor:await window.RondaNativo.getBssid()};
  return {motivo:'navegador'}}

/* → {ok, valor, motivo, msg}; nunca lança erro */
async function lerBssid(){
  try{
    const r=await comTempo(Promise.resolve(bssidBruto()),4000),v=normBssid(r.valor);
    if(v)return {ok:true,valor:v};
    const motivo=r.motivo||(r.valor?'permissao':'semwifi');   /* 02:00:… = sem permissão ou localização desligada */
    return {ok:false,valor:'',motivo,msg:MSG_BSSID[motivo]||MSG_BSSID.erro}
  }catch(e){return {ok:false,valor:'',motivo:'erro',msg:MSG_BSSID.erro}}}

/* ---------- leitura do código de barras (câmera) ---------- */
const FORMATOS=['code_128','code_39','code_93','codabar','ean_13','ean_8','itf','upc_a','upc_e','qr_code','data_matrix'];
let zxP=null;
function carregaZXing(){
  if(window.ZXing)return Promise.resolve(window.ZXing);
  /* 1º arquivo local (se você copiou para js/vendor/), 2º CDN fixada em versão */
  const fontes=['js/vendor/zxing-library.min.js','https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'];
  return zxP||(zxP=(async()=>{
    for(const src of fontes){
      try{await new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=no;document.head.appendChild(s)});
        if(window.ZXing)return window.ZXing}catch(e){}}
    zxP=null;throw new Error('zxing')})())}

/* devolve uma função async () => texto|null que lê o quadro atual do <video> */
async function criaDecodificador(video){
  if('BarcodeDetector' in window){
    try{
      const sup=await window.BarcodeDetector.getSupportedFormats(),f=FORMATOS.filter(x=>sup.includes(x));
      if(f.length){const d=new window.BarcodeDetector({formats:f});return async()=>{const r=await d.detect(video);return r[0]&&r[0].rawValue||null}}
    }catch(e){}}
  const Z=await carregaZXing(),B=Z.BarcodeFormat,h=new Map();
  h.set(Z.DecodeHintType.POSSIBLE_FORMATS,[B.CODE_128,B.CODE_39,B.CODE_93,B.CODABAR,B.EAN_13,B.EAN_8,B.ITF,B.UPC_A,B.UPC_E,B.QR_CODE,B.DATA_MATRIX]);
  h.set(Z.DecodeHintType.TRY_HARDER,true);
  const reader=new Z.MultiFormatReader();reader.setHints(h);
  const c=document.createElement('canvas'),x=c.getContext('2d',{willReadFrequently:true});
  return async()=>{
    if(!video.videoWidth)return null;
    c.width=video.videoWidth;c.height=video.videoHeight;x.drawImage(video,0,0);
    try{return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)))).getText()}catch(e){return null}}}

/* abre a câmera num painel próprio; devolve o texto lido ou null (cancelado/sem câmera) */
async function escanear(titulo){
  if(typeof RH.local.leitor==='function')return RH.local.leitor(titulo);   /* gancho para testes ou leitor externo */
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){RH.toast('Este navegador não permite abrir a câmera aqui.','bad');return null}
  let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false})}
  catch(e){RH.toast(e&&(e.name==='NotAllowedError'||e.name==='SecurityError')?'Permissão da câmera negada. Libere a câmera para este site/aplicativo.':'Não foi possível abrir a câmera.','bad');return null}
  return new Promise(resolve=>{
    const o=document.createElement('div');o.id='scan-ov';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-label','Leitor de código de barras');
    o.style.cssText='position:fixed;inset:0;z-index:210;background:#000;display:flex;flex-direction:column;color:#fff';
    o.innerHTML=`<div style="padding:12px 16px;font-weight:600">${RH.esc(titulo||'Leia o código de barras do local')}</div>
      <div style="position:relative;flex:1;min-height:0"><video id="scan-v" playsinline muted autoplay style="width:100%;height:100%;object-fit:cover;background:#000"></video>
      <div style="position:absolute;left:8%;right:8%;top:38%;height:24%;border:2px solid #4cc27f;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.35)"></div></div>
      <div id="scan-msg" style="padding:10px 16px;text-align:center;font-size:13px">Aponte a câmera para a etiqueta fixada no local.</div>
      <div style="display:flex;justify-content:center;padding:0 14px 16px"><button type="button" class="btn" id="scan-x">Cancelar</button></div>`;
    document.body.appendChild(o);
    let fim=false,timer=null;
    const parar=v=>{if(fim)return;fim=true;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());o.remove();resolve(v)};
    o.querySelector('#scan-x').onclick=()=>parar(null);
    addEventListener('pagehide',()=>parar(null),{once:true});
    const v=o.querySelector('#scan-v');v.srcObject=stream;v.play().catch(()=>{});
    criaDecodificador(v).then(dec=>{
      let ocupado=false;
      timer=setInterval(async()=>{
        if(ocupado||fim)return;ocupado=true;
        try{const t=await dec();if(t&&!fim)parar(t)}catch(e){}
        ocupado=false},180)
    }).catch(()=>{const m=o.querySelector('#scan-msg');if(m)m.textContent='Não foi possível iniciar o leitor de código de barras neste aparelho.'})})}

/* ---------- check-in de um bloco da ronda ---------- */
/* lê o código e, logo em seguida, a antena Wi-Fi; devolve o registro (ok ou rejeitado) ou null se cancelado */
async function checkin(bl){
  const alvo=alvoDoBloco(bl);if(!alvo)return null;
  const lido=await escanear('Leia o código de barras: '+alvo.nome);
  if(lido==null)return null;
  const bssid=await lerBssid(),r=validar({alvo,lido,bssid,pol:politica()});
  return {ts:Date.now(),ok:r.ok,codigo:r.codigo,rede:r.rede,msg:r.msg,lido:String(lido).slice(0,80),bssid:bssid.valor||''}}

/* guarda o resultado na ronda em andamento: R.chk[idDoBloco] = {ok: registro válido | null, falhas: últimas 5 rejeições} */
function registrar(R,sid,reg){
  const c=(R.chk=R.chk||{})[sid]=(R.chk[sid]||{ok:null,falhas:[]});
  if(reg.ok)c.ok=reg;else c.falhas=[...c.falhas,reg].slice(-5);
  return c}

/* o registro guardado ainda vale? (reavalia com as regras e o cadastro atuais: pega rascunho adulterado ou cadastro alterado) */
function revalida(alvo,reg){
  return validar({alvo,lido:reg.lido,bssid:{ok:!!reg.bssid,valor:reg.bssid},pol:politica()}).ok}

/* estado de um bloco com código próprio */
function estadoProprio(R,bl){
  const pol=politica(),alvo=pol.modo!=='off'&&alvoDoBloco(bl);
  if(!alvo)return {ativo:false,bloqueado:false};
  if(!normCodigo(alvo.codigoLocal))return {ativo:true,semCodigo:true,alvo,falhas:[],ok:null,bloqueado:false};
  const c=R.chk&&R.chk[bl.id],ok=c&&c.ok&&revalida(alvo,c.ok)?c.ok:null;
  return {ativo:true,alvo,ok,falhas:c?c.falhas:[],bloqueado:pol.modo==='exigir'&&!ok}}
/* Liberação em grupo: R.lib[idDoBloco] = idDoBlocoChave. O bloco dependente é liberado quando a chave tem presença
   confirmada (código + antena DA CHAVE); o código do próprio bloco não é exigido. Chave sem código ou ausente da ronda → o bloco volta a exigir o próprio. */
function estado(R,bl){
  const kid=R.lib&&R.lib[bl.id],kb=kid&&kid!==bl.id&&!(R.lib[kid])&&R.blocos.find(b=>b.id===kid);
  if(kb){
    const k=estadoProprio(R,kb);
    if(k.ativo&&!k.semCodigo)return {...k,dependente:true,viaId:kb.id}}
  return estadoProprio(R,bl)}
const pendencias=R=>R.blocos.filter(bl=>estado(R,bl).bloqueado);
/* blocos liberados pela leitura da chave `id` */
const dependentes=(R,id)=>R.blocos.filter(b=>b.id!==id&&R.lib&&R.lib[b.id]===id&&estado(R,b).dependente);

/* evidência gravada em cada documento de `rondas` (null quando a validação está desligada) */
function evidencia(R,bl){
  const e=estado(R,bl),modo=politica().modo;
  if(!e.ativo)return null;
  if(e.semCodigo)return {modo,status:'sem_codigo'};
  const f=(e.falhas||[]).map(x=>({ts:x.ts,codigo:x.codigo,lido:x.lido,bssid:x.bssid}));
  if(e.ok)return {modo,status:'confirmada',ts:e.ok.ts,rede:e.ok.rede,lido:e.ok.lido,bssid:e.ok.bssid,...(e.dependente?{via:e.alvo.nome}:{}),...(f.length?{falhas:f}:{})};
  return {modo,status:'nao_confirmada',...(f.length?{falhas:f}:{})}}

/* selo para o histórico */
function badge(p){
  if(!p)return '';
  const t=(c,x)=>`<span class="pill ${c}" title="Presença no local">${x}</span>`;
  if(p.status==='confirmada'){
    const n=(p.falhas||[]).length?` · ${p.falhas.length} leitura${p.falhas.length>1?'s':''} rejeitada${p.falhas.length>1?'s':''}`:'';
    return p.rede==='confere'?t('okp','Presença: código + Wi-Fi'+n):t(p.rede==='indisponivel'?'late':'okp','Presença: código'+(p.rede==='indisponivel'?' (Wi-Fi não verificado)':'')+n)}
  if(p.status==='sem_codigo')return t('off','Local sem código');
  return t('late','Presença não confirmada')}

/* ---------- cadastro ---------- */
/* valida e normaliza codigoLocal/bssids de uma sala ou equipamento; devolve '' ou a mensagem de erro */
function validaCadastro(data,ent,id){
  const c=normCodigo(data.codigoLocal),tipo=ent==='salas'?'s':'e';
  if(c){
    if(c.length<4)return 'O código do local precisa ter ao menos 4 caracteres.';
    const dup=alvos().find(a=>normCodigo(a.codigoLocal)===c&&!(a.id===id&&a.tipo===tipo));
    if(dup)return `O código ${c} já está em uso por "${dup.nome}". Cada local precisa de um código único.`}
  data.codigoLocal=c;
  const p=parseBssids(data.bssids);
  if(p.invalidos.length)return 'BSSID inválido: '+p.invalidos.join(', ')+'. Use aa:bb:cc:dd:ee:ff (ou aa:bb:cc:*:*:* para várias antenas do mesmo fabricante).';
  data.bssids=p.lista.join('\n');
  return ''}
function gerarCodigo(prefixo,extra){
  const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',usados=new Set([...alvos().map(a=>normCodigo(a.codigoLocal)),...(extra||[])]);
  let c;do{const b=crypto.getRandomValues(new Uint8Array(6));c=`RH-${prefixo}-`+[...b].map(x=>A[x%A.length]).join('')}while(usados.has(c));
  return c}

RH.local={normCodigo,normBssid,parseBssids,bssidConfere,politica,alvoDoBloco,validar,lerBssid,escanear,checkin,registrar,estado,pendencias,dependentes,evidencia,badge,validaCadastro,gerarCodigo,
  /* ganchos opcionais: RH.local.leitor = async titulo => texto ; RH.local.provedorBssid = async () => 'aa:bb:..' | {valor,motivo} */
  leitor:null,provedorBssid:null};
if(typeof module!=='undefined'&&module.exports)module.exports=RH.local;
})();
