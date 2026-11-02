/* ==========================================================================
   Núcleo · sugestão automática de "Orientação / ação esperada"
   A partir do NOME do tipo de não conformidade, devolve uma orientação curta e
   objetiva (o que fazer, em ordem). É uma biblioteca de regras embutida no sistema:
   funciona offline e sem enviar dados a nenhum serviço. O texto gerado é só um
   ponto de partida — o campo continua editável.
   ========================================================================== */
(()=>{
const RH=window.RH;
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

/* [palavras-chave (sem acento), orientação]. Vence a regra com mais palavras encontradas. */
const REGRAS=[
 [['maos','lavagem das','higiene das','antissepsia das','cinco momentos'],
  'Higienizar as mãos com água e sabonete ou álcool 70% nos 5 momentos da assistência, repor insumos faltantes e orientar a equipe no ato.'],
 [['higien','limpez','sujo','sujeira','poeira','desinfec','assepsia'],
  'Refazer a limpeza e a desinfecção do local com o produto padronizado, registrar no checklist e avisar a chefia do setor.'],
 [['esteriliz','autoclave','termodesinfec','indicador biologico','indicador quimico'],
  'Suspender o uso dos materiais do ciclo, refazer o processo de esterilização conforme o protocolo e registrar o resultado.'],
 [['calibra'],
  'Retirar o equipamento de uso, sinalizar como "calibração vencida", agendar a calibração com a engenharia clínica e registrar.'],
 [['manutenc','preventiva'],
  'Sinalizar o equipamento, agendar a manutenção com a engenharia clínica e registrar o chamado e o prazo.'],
 [['equipamento','aparelho','falha','defeito','quebrad','avaria','danific','nao liga','monitor','ventilador','bomba','desfibrilador'],
  'Retirar o equipamento de uso, sinalizar como "em manutenção", acionar a engenharia clínica e registrar o chamado.'],
 [['alarme'],
  'Testar o alarme, acionar a engenharia clínica se não funcionar e só devolver o equipamento ao uso depois de validado.'],
 [['medicament','insumo','validade','vencid','vencimento','lote'],
  'Separar e identificar o item vencido, descartar conforme o PGRSS, repor o estoque e avisar a farmácia.'],
 [['temperatura','refriger','geladeira','cadeia de frio','freezer','vacina'],
  'Conferir e ajustar a temperatura, registrar o valor, avaliar o descarte dos itens e acionar a manutenção se persistir.'],
 [[' epi ',' epis ','luva','mascara','avental','oculos','capote','protecao individual'],
  'Repor imediatamente os EPIs no ponto de uso e orientar a equipe sobre o uso correto.'],
 [['perfurocortante','descarte','residuo','lixo','lixeira','coleta','pgrss'],
  'Descartar no recipiente correto, trocar o recipiente se estiver cheio ou danificado e orientar a equipe sobre a segregação.'],
 [['rota de fuga','saida de emergencia','extintor','incendio','hidrante','sinaliza','obstru','corredor'],
  'Desobstruir e sinalizar imediatamente a rota, repor ou recarregar o extintor se necessário e avisar a segurança do trabalho.'],
 [['oxigenio','gas','vazamento','vacuo','ar comprimido'],
  'Fechar a válvula do ponto, isolar a área, acionar a engenharia/manutenção imediatamente e não usar o ponto até a liberação.'],
 [['eletric','tomada','fiacao','fio ','disjuntor','iluminacao','lampada','energia','gerador'],
  'Isolar o ponto elétrico, não utilizar e acionar a manutenção predial para reparo; registrar o chamado.'],
 [['infiltra','goteira','mofo','umidade','rachadura','pintura','piso','parede','forro','teto','estrutura'],
  'Isolar e sinalizar a área, abrir chamado para a manutenção predial e acompanhar o reparo até a conclusão.'],
 [['agua','torneira',' pia ','lavatorio','sabonete','papel toalha','alcool','higiene das maos','dispenser'],
  'Repor sabonete, papel toalha e álcool no ponto de uso e acionar a manutenção se houver defeito na pia ou na torneira.'],
 [['ar condicionado','climatiza','ventilacao','exaustor','pressao'],
  'Verificar o funcionamento e a temperatura do ambiente, acionar a manutenção e registrar; avaliar a continuidade das atividades.'],
 [['praga','inseto','barata','rato','roedor','mosquito'],
  'Isolar e higienizar a área, avisar a Higiene/CCIH para acionar o controle de pragas e registrar a ocorrência.'],
 [['identifica','etiqueta','rotulo','placa','pulseira'],
  'Identificar ou etiquetar corretamente o item no ato, conferir os dados e orientar a equipe.'],
 [['registro','document','assinatura','prontuario','preench','checklist','formulario','impresso'],
  'Completar o registro com o responsável, assinar e datar, e orientar a equipe sobre o preenchimento correto.'],
 [['acesso','porta','fechadura','chave','seguranca patrimonial','vigilancia'],
  'Corrigir o acesso (fechar, trancar ou consertar), registrar a ocorrência e avisar a segurança patrimonial.'],
 [['barulho','ruido'],
  'Identificar a origem do ruído, corrigir ou acionar a manutenção e orientar a equipe para reduzir o ruído.'],
 [['paciente','queda','contencao','isolamento','precaucao'],
  'Garantir a segurança do paciente primeiro, corrigir a situação, notificar a liderança e registrar a ocorrência.']
];

RH.sugerirOrientacao=nome=>{
  const n=' '+norm(nome).trim()+' ';
  if(n.trim()==='')return '';
  let best=null,bestScore=0;
  for(const [kws,txt] of REGRAS){
    const score=kws.reduce((a,k)=>a+(n.includes(k)?1:0),0);
    if(score>bestScore){best=txt;bestScore=score}}
  if(best)return best;
  const t=String(nome).trim();
  return `Corrigir a não conformidade "${t}" imediatamente, registrar a ação realizada e avisar o responsável pelo setor. Se não for possível resolver na hora, sinalizar o local e abrir chamado.`;
};
})();
