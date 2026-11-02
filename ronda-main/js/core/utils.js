/* ==========================================================================
   Núcleo · utilitários
   Cria o namespace global window.RH (usado por todos os outros arquivos) e
   define: seletor ($), escape de HTML, ids, constantes de domínio (severidade,
   situação, perfis), formatadores de data/número em pt-BR e os ícones.
   Não depende de nenhum outro arquivo do projeto.
   ========================================================================== */
(()=>{
const RH=window.RH=window.RH||{};

const $=(s,e=document)=>e.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

/* ---------- constantes de domínio ---------- */
const SEV={1:'Baixa',2:'Média',3:'Alta',4:'Crítica'};
const ST={aberta:'Aberta',tratamento:'Em tratamento',resolvida:'Resolvida'};
const ROLE={admin:'Administrador',gestor:'Gestor',inspetor:'Inspetor'};

/* ---------- datas e números (pt-BR) ---------- */
const fdt=t=>new Date(t).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
const fd=t=>new Date(t).toLocaleDateString('pt-BR');
const fdm=t=>new Date(t).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
const pc=v=>v==null?'—':(Math.round(v*10)/10).toLocaleString('pt-BR')+'%';
const ago=t=>{const h=(Date.now()-t)/36e5;if(h<1)return 'há '+Math.max(1,Math.round(h*60))+' min';if(h<48)return 'há '+Math.round(h)+' h';return 'há '+Math.round(h/24)+' dias'};
const dur=h=>h==null?'—':h<48?Math.round(h)+' h':(h/24).toLocaleString('pt-BR',{maximumFractionDigits:1})+' dias';
const sod=t=>{const d=new Date(t);d.setHours(0,0,0,0);return d.getTime()};
/* AAAA-MM-DD no fuso LOCAL (toISOString usaria UTC e erraria o dia à noite) */
const ymd=t=>{const d=new Date(t),z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())};

/* ---------- ícones (SVG inline) ---------- */
const IC={
dash:'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
clip:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 13l2 2 4-4"/>',
hist:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
alert:'<path d="M12 3 2 20h20L12 3zM12 10v4M12 17v.5"/>',
set:'<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
out:'<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
plus:'<path d="M12 5v14M5 12h14"/>',cam:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
check:'<path d="m5 12 5 5 9-10"/>',x:'<path d="M6 6l12 12M18 6 6 18"/>',up:'<path d="m6 15 6-6 6 6"/>',dn:'<path d="m6 9 6 6 6-6"/>',
trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
cross:'<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
dev:'<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M7 11h2l1.5-3 2 6 1.5-3H17M9 21h6"/>',
copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
shield:'<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'};
const ic=(n,s=18)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const empty=(t,s='')=>`<div class="empty"><b>${esc(t)}</b>${esc(s)}</div>`;

Object.assign(RH,{$,esc,uid,SEV,ST,ROLE,fdt,fd,fdm,pc,ago,dur,sod,ymd,IC,ic,empty});
})();
