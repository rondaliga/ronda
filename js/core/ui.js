/* ==========================================================================
   Núcleo · componentes de interface
   toast (aviso), tooltip, janela modal, confirmação em dois toques e os
   pequenos "selos" reutilizados em várias telas (severidade, situação, ativo,
   orientação da não conformidade).
   ========================================================================== */
(()=>{
const RH=window.RH,{$,esc,ic,SEV,ST}=RH,st=RH.st;

/* ---------- aviso rápido ---------- */
RH.toast=(m,k)=>{const t=$('#toast');t.innerHTML=`<div class="toast ${k||''}" role="status">${esc(m)}</div>`;clearTimeout(RH.toast.t);RH.toast.t=setTimeout(()=>t.innerHTML='',3800)};

/* ---------- tooltip (qualquer elemento com data-tip + gráfico) ---------- */
const tip=RH.tip=$('#tip');
RH.showTip=(t,x,y)=>{tip.textContent=t;tip.hidden=false;const w=tip.offsetWidth,h=tip.offsetHeight;tip.style.left=Math.min(innerWidth-w-8,Math.max(8,x+12))+'px';tip.style.top=Math.max(8,y-h-12)+'px'};
document.addEventListener('mousemove',e=>{const t=e.target.closest&&e.target.closest('[data-tip]');if(t)RH.showTip(t.dataset.tip,e.clientX,e.clientY);else if(!e.target.closest||!e.target.closest('#ch-line'))tip.hidden=true});

/* ---------- janela modal ---------- */
RH.modal=(html,wide)=>{$('#modal').innerHTML=`<div class="ov" data-act="ovClose"><div class="mod ${wide?'wide':''}" role="dialog" aria-modal="true">${html}</div></div>`;
  document.body.classList.add('modal-open');RH.labelTables?.($('#modal'));
  const f=$('#modal input:not([type=file]),#modal select,#modal textarea');if(f&&matchMedia('(min-width:700px) and (pointer:fine)').matches)f.focus()};
RH.closeModal=()=>{$('#modal').innerHTML='';st.M=null;document.body.classList.remove('modal-open')};
addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#modal').firstChild)RH.closeModal()});

/* ---------- confirmação em dois toques: devolve true no 2º toque (até 3 s depois) ---------- */
let armT;
RH.confirmArm=(fn,msg)=>{if(fn.armed){fn.armed=false;return true}fn.armed=true;RH.toast(msg);clearTimeout(armT);armT=setTimeout(()=>fn.armed=false,3000);return false};

/* ---------- selos ---------- */
RH.sevPill=n=>`<span class="sev s${n}"><b>${n}</b>${SEV[n]||''}</span>`;
RH.stPill=s=>`<span class="pill st-${s}"><i></i>${ST[s]||s}</span>`;
RH.actPill=x=>x.ativo===false?'<span class="pill off">Inativo</span>':'<span class="pill okp">Ativo</span>';
/* alerta com a "Orientação / ação esperada" de um tipo de NC (vazio se não houver texto) */
/* temperatura ideal de um item de Temperatura (campos tmin/tmax do cadastro, em °C) */
RH.ehTemp=t=>/temperatura/i.test(t||'');
RH.numTemp=v=>{const s=String(v??'').trim().replace(',','.');if(s===''||isNaN(+s))return null;return +s};
RH.fmtIdeal=(a,b)=>{const f=n=>String(n).replace('.',',')+' °C';return a!=null&&b!=null?f(a)+' a '+f(b):a!=null?'mín. '+f(a):b!=null?'máx. '+f(b):''};
/* aviso fixo de um item do checklist (campo "Aviso" do cadastro) */
RH.avisoBox=txt=>txt?`<div class="orient aviso" role="note">${ic('alert',18)}<div><b>Aviso</b>${esc(txt)}</div></div>`:'';
RH.orientBox=txt=>txt?`<div class="orient" role="note">${ic('alert',18)}<div><b>Orientação / ação esperada</b>${esc(txt)}</div></div>`:'';
/* ampliar foto: clicar em qualquer imagem .big-img (histórico, não conformidades) abre em tela cheia; clique, X ou Esc fecham */
(function(){
  const fechar=()=>{const l=document.getElementById('lightbox');if(l)l.remove()};
  document.addEventListener('click',e=>{
    const l=e.target.closest&&e.target.closest('#lightbox');
    if(l){fechar();return}
    const im=e.target.closest&&e.target.closest('img.big-img');
    if(!im||!im.getAttribute('src'))return;
    fechar();
    const d=document.createElement('div');d.id='lightbox';d.setAttribute('role','dialog');d.setAttribute('aria-label','Foto ampliada');
    d.innerHTML=`<button type="button" class="lb-x" aria-label="Fechar foto">&times;</button><img alt="">`;
    d.querySelector('img').src=im.currentSrc||im.src;d.querySelector('img').alt=im.alt||'Foto ampliada';
    document.body.appendChild(d);d.querySelector('.lb-x').focus()});
  addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('lightbox')){e.stopImmediatePropagation();fechar()}},true);
})();
})();
