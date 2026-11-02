/* ==========================================================================
   Núcleo · agenda das rondas (dias da semana + horários)
   Uma ronda cadastrada tem:  dias:[0..6] (0 = domingo)  e  horarios:['08:00','20:00'].
   Ela deve ser realizada em cada dia marcado, em cada horário.

   Regra de "em atraso" (usa sempre o horário do aparelho):
   - olha o último horário previsto que já passou (S);
   - a ronda conta como realizada se houve uma execução a partir de 1 h ANTES de S;
   - fica "em atraso" quando passou 1 h de S sem execução.
   - horários anteriores à criação/alteração da agenda (agendaDesde) não contam.
   Rondas antigas, sem agenda, continuam usando a periodicidade em horas (freq).
   ========================================================================== */
(()=>{
const RH=window.RH;
const HORA=36e5,ANTECIPA=HORA,TOLERA=HORA;
const DIAS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const DIAS_LONGOS=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

const temAgenda=m=>Array.isArray(m.dias)&&m.dias.length>0&&Array.isArray(m.horarios)&&m.horarios.length>0;
const validaHora=h=>/^([01]\d|2[0-3]):[0-5]\d$/.test(h);

/* "Seg a Sex", "Seg, Qua, Sex", "Todos os dias" */
function resumoDias(dias){
  const d=[...new Set(dias)].sort((a,b)=>a-b);
  if(d.length===7)return 'Todos os dias';
  const g=[];d.forEach(x=>{const l=g[g.length-1];if(l&&l[l.length-1]===x-1)l.push(x);else g.push([x])});
  return g.map(l=>l.length>=3?`${DIAS[l[0]]} a ${DIAS[l[l.length-1]]}`:l.map(x=>DIAS[x]).join(', ')).join(', ')}

/* texto curto da agenda (ou da periodicidade antiga) */
const resumo=m=>temAgenda(m)?`${resumoDias(m.dias)} · ${[...m.horarios].sort().join(', ')}`:`A cada ${+m.freq||24} h`;

/* instantes previstos entre `de` e `ate` (ms), em ordem crescente */
function horarios(m,de,ate){
  const out=[];if(!temAgenda(m))return out;
  const d=new Date(de);d.setHours(0,0,0,0);
  for(;d.getTime()<=ate;d.setDate(d.getDate()+1)){
    if(!m.dias.includes(d.getDay()))continue;
    for(const h of m.horarios){const [hh,mm]=h.split(':').map(Number),t=new Date(d);t.setHours(hh,mm,0,0);
      if(t.getTime()>=de&&t.getTime()<=ate)out.push(t.getTime())}}
  return out.sort((a,b)=>a-b)}

const ultimo=(m,now)=>{const l=horarios(m,now-8*864e5,now);return l.length?l[l.length-1]:null};
const proximo=(m,now)=>{const l=horarios(m,now+1,now+8*864e5);return l.length?l[0]:null};

/* a ronda está em atraso agora? `lastTs` = data da última execução (ou null) */
function atrasada(m,lastTs,now=Date.now()){
  if(!temAgenda(m))return !lastTs||now-lastTs>(+m.freq||24)*HORA;
  const s=ultimo(m,now);if(s==null)return false;
  if(m.agendaDesde&&s<m.agendaDesde)return false;
  if(now<=s+TOLERA)return false;
  return !(lastTs!=null&&lastTs>=s-ANTECIPA)}

const fmtSlot=t=>{const d=new Date(t);return `${DIAS[d.getDay()]} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};

RH.agenda={DIAS,DIAS_LONGOS,temAgenda,validaHora,resumo,resumoDias,horarios,ultimo,proximo,atrasada,fmtSlot};
})();
