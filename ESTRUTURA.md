# Ronda Hospitalar — guia do projeto

## Como publicar (GitHub Pages)
Envie **todo o conteúdo desta pasta** para o seu repositório (mantendo as pastas `css/` e `js/`).
Alternativa de um arquivo só: `dist/ronda-hospitalar.html` (renomeie para `index.html`).
O banco compartilhado (Supabase) é configurado em **`js/config.js`** — é o único arquivo que você edita.
Depois de atualizar o site, recarregue a página com Ctrl+F5 (ou limpe o cache no celular).

## Primeiros passos no hospital
1. **Cadastros → Responsáveis e usuários**: crie os usuários (perfil Inspetor, Gestor ou Administrador).
2. **Salas**, **Checklists** (um de "ambiente" e um de "equipamento"), **Equipamentos** (vinculando o checklist).
3. **Tipos de NC**: preencha a *Orientação / ação esperada* — ela aparece como alerta para o inspetor.
4. **Rondas**: dê um *nome*, marque as *salas* que fazem parte e escolha o *responsável* (ou "Todos").
5. O inspetor entra, abre **Nova ronda**, escolhe a ronda e responde as salas em sequência.

## Regras de acesso
| Perfil | Telas |
|---|---|
| Administrador | Painel, Nova ronda, Histórico, Não conformidades, Cadastros |
| Gestor | Painel, Nova ronda, Histórico, Não conformidades |
| Inspetor | Nova ronda e Histórico (**somente as rondas feitas por ele**) |

* **Rascunho automático:** a ronda em andamento é salva no navegador (por usuário) a cada resposta; se a aba for fechada ou recarregada, ela volta preenchida. O rascunho é apagado ao finalizar ou descartar a ronda.
* **Inacessível:** itens que não puderam ser avaliados são marcados como *Inacessível* e exigem uma descrição do motivo (registros antigos "N/A" aparecem como Inacessível).
* Ronda **com responsável**: só ele a vê e realiza. Exceção: o **administrador** vê e realiza todas as rondas.
* Ronda com responsável **"Todos"**: todos os usuários com acesso a Nova ronda a veem e realizam.
* Excluir uma ronda realizada (Histórico → abrir a ronda → Excluir ronda): administrador e gestor; há uma caixa (desmarcada por padrão) para apagar também as NCs geradas.
* Excluir uma não conformidade: administrador e gestor (pede confirmação; a foto é apagada junto).
* Essas regras controlam a **interface**. O banco é protegido pelo código de acesso da equipe: quem tem o
  código e conhecimentos técnicos consegue ler os dados diretamente. Não compartilhe o código fora da equipe.

## Estrutura de arquivos
```
index.html              página única: carrega os arquivos abaixo, na ordem certa
css/styles.css          todos os estilos (seções comentadas: tema, layout, tabelas, ronda, modal…)
js/config.js            URL e chave do Supabase (deixe vazio para usar só no navegador)
js/core/                núcleo (sem telas)
  data-layer.js           banco: local (IndexedDB) ou compartilhado (Supabase) — RH.store
  utils.js                helpers, constantes, formatação pt-BR, ícones — cria window.RH
  state.js                dados em memória (RH.S), estado da tela (RH.st), filtros, consultas
  access.js               permissões por perfil e visibilidade das rondas
  security.js             hash de senha (PBKDF2) e regra de senha (mín. 8 caracteres + 1 símbolo)
  agenda.js               dias e horários das rondas e regra de atraso
  orientacao.js           sugestão automática de "Orientação / ação esperada" a partir do nome do tipo de NC
  images.js               redução de fotos
  ui.js                   aviso, tooltip, modal, selos, caixa de orientação
  data.js                 gravar/atualizar/apagar, sincronização em tempo real
  barcode.js              gerador de QR Code e Code 128 (SVG) para as etiquetas
  local.js                presença no local: regras (código + BSSID), leitura de BSSID nativo, leitor de código de barras
js/features/            uma tela (ou função) por arquivo
  auth.js                 login e primeiro acesso
  conta.js                "Senha" no menu: o próprio usuário altera a sua senha
  painel.js               indicadores e gráficos
  ronda.js                Nova ronda: lista de rondas e preenchimento
  historico.js            histórico de rondas realizadas
  ncs.js                  não conformidades: tratar e excluir
  cadastros.js            cadastros (rondas, salas, equipamentos, checklists, tipos de NC, usuários, hospital/backup)
  seed.js                 dados de exemplo
js/app.js               menu, navegação, despacho de eventos e inicialização
tests/                  testes automáticos (veja abaixo)
tools/gerar-arquivo-unico.py   gera dist/ronda-hospitalar.html
```
Cada tela se registra em `RH.pages`, `RH.ACT` (cliques), `RH.ON_CHANGE/ON_INPUT/ON_SUBMIT`; o `app.js` só despacha.

## Dados (coleções)
`users`, `salas`, `equipamentos`, `checklists`, `tiposNC`, **`modelos`** (cadastro "Nome da ronda"),
`rondas` (um documento por sala visitada; todos de uma execução têm o mesmo `execId`), `ncs`, `config`, `fotos`.
Rondas feitas antes desta versão continuam no histórico (uma linha por sala).

## Testes
Requer Python 3 e Playwright (`pip install playwright && playwright install chromium`).
```
python3 tests/e2e.py          # fluxo completo em modo local (nunca toca o banco real)
python3 tests/remote_mock.py  # modo compartilhado contra um servidor simulado
RH_PAGE=dist/ronda-hospitalar-teste.html python3 tests/e2e.py   # testa o arquivo único (gere com --sem-config)
```

## Regras novas

- **Senha**: mínimo de 8 caracteres e 1 símbolo especial (`RH.checkSenha`). Vale para novas senhas e trocas; contas antigas continuam entrando.
- **Rondas**: definidas por dias da semana + horários. Fica "em atraso" 1 h depois do horário sem execução; uma execução feita até 1 h antes do horário vale para ele. Rondas antigas (por horas) mantêm a regra antiga até serem editadas.
- **Checklist "Aplica-se a"**: Sala, Equipamento ou Sala e equipamento.
- **Orientação padrão**: gerada por regras internas (sem internet nem chave de API) ao digitar o nome do tipo de NC; continua editável.
- **Setor e equipamentos**: o equipamento pertence a um **Setor** (não mais a uma sala). A ronda escolhe salas e equipamentos por setor (`salaIds` + `equipIds`); rondas antigas sem `equipIds` usam os equipamentos das salas (`RH.equipsDaRonda`). Na execução, cada sala é um bloco e os equipamentos do setor formam outro, com as etiquetas Sala / Equipamento.
- **Duplicar**: botão em cada linha de Cadastros; abre o formulário já preenchido como novo cadastro (nome + "(cópia)"; usuário sem login/senha; equipamento sem patrimônio).
- **Painel**: cada gráfico/lista tem botão para minimizar (lembrado neste navegador) e há "Minimizar tudo / Expandir tudo".
- **Visual institucional**: paleta azul hospitalar (claro e escuro), superfícies planas com bordas finas, barra de contexto (data, tipo de base, perfil) e tela de acesso reformulada. O detalhe de uma ronda no Histórico tem **Imprimir relatório** (cabeçalho do hospital e campos de assinatura).

- **Presença no local** (código de barras + antena Wi-Fi): veja `VALIDACAO-LOCAL.md`. Campos `codigoLocal` e `bssids` em salas/equipamentos; política `valLocal`/`valBssid` em `config/main`; evidência em `rondas.presenca`.

- **Ações em lote** (Cadastros → Salas, Equipamentos, Checklists): caixa de seleção por linha e "selecionar todos" (só os itens filtrados); filtros por Setor/Andar (Salas) e Setor/Categoria (Equipamentos). A barra flutuante oferece: vincular a ronda (acrescenta ao fim do percurso) ou checklist, alterar setor, criar ronda com os selecionados e excluir (respeita `canDel`). A seleção (`st.sel`, chaves `s:`/`e:`/`c:`) vale entre abas, então salas e equipamentos entram juntos na mesma ronda. Um item só pode estar em uma ronda; os que já estão em outra são ignorados e a janela mostra o motivo. Regras de ronda em `ronda.js` (`RH.rondaPlano`, `RH.rondaAdicionar`). Teste: `python3 tests/bulk.py`.
