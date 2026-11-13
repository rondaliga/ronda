# Ronda Hospitalar — guia do projeto

## Como publicar (GitHub Pages)
Envie **todo o conteúdo desta pasta** para o seu repositório (mantendo as pastas `css/` e `js/`).
Alternativa de um arquivo só: `dist/ronda-hospitalar.html` (renomeie para `index.html`).
O banco compartilhado (Supabase) é configurado em **`js/config.js`** — é o único arquivo que você edita.
Depois de atualizar o site, feche e abra o app/PWA duas vezes (ou limpe os dados do site no celular) para carregar a nova versão.

## Aplicativos (Android e macOS) e celular
O sistema é mobile-first. Para gerar o `.apk` (Android) e o `.dmg` (macOS) de graça, veja **`LEIA-ME-APPS.md`**. Arquivos novos: `package.json`, `capacitor.config.json`, `desktop/` (macOS), `android-extras/` (plugin de Wi-Fi), `tools/preparar-*.js`, `.github/workflows/build-apps.yml`, `manifest.webmanifest`, `sw.js` (PWA offline), `js/core/native.js` (recursos do aparelho).

## Primeiros passos no hospital
1. **Cadastros → Responsáveis e usuários**: crie os usuários (perfil Inspetor, Gestor ou Administrador).
2. **Salas** e **Equipamentos**: em cada cadastro, monte o checklist próprio (itens a verificar, avisos e faixa de temperatura ideal).
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
  versao.js               número e data da versão (gerado por tools/atualizar-versao.js)
  native.js               recursos do aparelho: salvar/compartilhar arquivo, imprimir e botão Voltar do Android
js/features/            uma tela (ou função) por arquivo
  auth.js                 login e primeiro acesso
  conta.js                "Senha" no menu: o próprio usuário altera a sua senha
  painel.js               indicadores e gráficos
  ronda.js                Nova ronda: lista de rondas e preenchimento
  historico.js            histórico de rondas realizadas
  ncs.js                  não conformidades: tratar e excluir
  cadastros.js            cadastros (rondas, salas, equipamentos, tipos de NC, usuários, hospital/backup)
  seed.js                 dados de exemplo
js/app.js               menu, navegação, despacho de eventos e inicialização
tests/                  testes automáticos (veja abaixo)
tools/gerar-arquivo-unico.py   gera dist/ronda-hospitalar.html
```
Cada tela se registra em `RH.pages`, `RH.ACT` (cliques), `RH.ON_CHANGE/ON_INPUT/ON_SUBMIT`; o `app.js` só despacha.

## Dados (coleções)
`users`, `salas`, `equipamentos`, `checklists` (legado: hoje os itens ficam em cada sala/equipamento), `tiposNC`, **`modelos`** (cadastro "Nome da ronda"),
`rondas` (um documento por sala visitada; todos de uma execução têm o mesmo `execId`), `ncs`, `config`, `fotos`, `avisos` (estado dos avisos por e-mail).
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

- **Presença no local** (código do local + ponto de acesso Wi-Fi): veja `VALIDACAO-LOCAL.md`. Campos `codigoLocal` e `bssids` em salas/equipamentos; política `valLocal`/`valBssid` em `config/main`; evidência em `rondas.presenca`.

- **Ações em lote** (Cadastros → Salas e Equipamentos): caixa de seleção por linha e "selecionar todos" (só os itens filtrados); filtros por Setor/Andar (Salas) e Setor (Equipamentos). A barra flutuante oferece: vincular à ronda (acrescenta ao fim do percurso), alterar setor, criar ronda com os selecionados e excluir (respeita `canDel`). A seleção (`st.sel`, chaves `s:`/`e:`) vale entre abas, então salas e equipamentos entram juntos na mesma ronda. Um item só pode estar em uma ronda; os que já estão em outra são ignorados e a janela mostra o motivo. Regras de ronda em `ronda.js` (`RH.rondaPlano`, `RH.rondaAdicionar`). Teste: `python3 tests/bulk.py`.

## Publicação automática (GitHub Pages)
`.github/workflows/publicar-site.yml` publica o site sozinho a cada push na branch `main` (leva ~1 min; acompanhe em **Actions**).
Configuração única: no repositório, **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Cada publicação carimba uma versão nova em `sw.js`; os aparelhos com o app aberto detectam e mostram o aviso **"Nova versão do aplicativo disponível."** com o botão **Atualizar**.
Para atualizar o app: envie as alterações para `main` (git push ou "Upload files" no site do GitHub). Os arquivos `dist/` não são usados pelo site publicado.

## Como publicar uma nova versão (padrão)
1. Atualize a versão em todos os lugares de uma vez: `node tools/atualizar-versao.js 1.0.5` (a data é a de hoje; opcional: `... 1.0.5 2026-12-01`).
   Isso grava em `package.json`, `js/core/versao.js` (rodapé do app: "Versão 1.0.5 · publicada em DD/MM/AAAA"), `index.html` (`?v=`) e `sw.js`.
2. Envie para `main` (git push). O site publica sozinho, e o GitHub Actions recusa a publicação se as versões estiverem desencontradas.
3. Para o .apk: crie a release com a tag `v1.0.5` (Releases → Draft a new release). O .apk usa o mesmo número.
`node tools/atualizar-versao.js --verificar` confere se tudo está igual. Nunca edite a versão à mão.

## Temperatura medida, QR e armazenamento (v1.0.5)
- **Temperatura medida:** itens de "Temperatura" pedem a leitura em °C (obrigatória quando há faixa ideal). Fora da faixa vira NC automaticamente, sempre com severidade **Crítica**, (tipo cujo nome contém "Temperatura", se existir); dentro da faixa, conforme. A leitura (`tv`) é gravada no item da ronda e aparece no histórico.
- **Ronda por QR:** em Nova ronda, "Ler código do local" abre a ronda a que a sala/equipamento pertence e confirma a presença; dentro da ronda, "Ler código do local" rola até o local. Usa os códigos de Cadastros → Imprimir etiquetas.
- **Progresso:** barra fixa no topo com "x de y itens · %" e botão "Próximo pendente".
- **Armazenamento:** Cadastros → Hospital mostra a estimativa de uso do banco (limite padrão 500 MB; calibre com o tamanho real do Supabase); o painel avisa o administrador a partir de 70%.


## Avisos por e-mail (v1.0.6; horário por severidade na v1.0.9)
- `tools/avisos-email.mjs` roda a cada ~10 min no GitHub Actions (`.github/workflows/avisos-email.yml`). Lê o banco só pelas RPCs (`rh_pull`, `rh_get`, `rh_put_many`) com o código de acesso, decide quem avisar e envia por Brevo ou Resend (HTTP). O estado (o que já foi avisado) fica em `avisos/estado`.
- Avisa: NC aberta com severidade igual ou superior à configurada (padrão Alta) e ronda atrasada. Um e-mail por pessoa reúne tudo. A 1ª execução só grava a linha de base.
- Configuração no app: Cadastros → Hospital → "Avisos por e-mail" (`cfg.avisos`) e campo e-mail em cada usuário.
- Segredos do repositório: `RONDA_CODIGO`, `EMAIL_API_KEY`, `EMAIL_FROM`, opcionais `EMAIL_PROVIDER` (brevo|resend), `EMAIL_FROM_NAME`. Para mudar o fuso, crie a variável do repositório `RONDA_TZ` (Settings → Variables; padrão `America/Fortaleza`).
- Teste: `node tests/avisos_test.mjs` (banco e provedor simulados).

## Lista de NCs, minigráficos e esqueletos (v1.0.6; prazos de resolução removidos na v1.0.7)
- `js/features/ncs.js`: tabela ordenável no desktop (`NF.ord`, ação `ncOrd`); no celular continuam os cartões.
- `js/features/painel.js`: `spark()` desenha o minigráfico dos KPIs. Esqueleto (`.sk`) na carga inicial (`js/app.js`) e na foto da NC.
- Teste: `python3 tests/painel_ncs.py`.

## v1.0.8: aviso imediato, NC repetida, pendências de hoje
- **Aviso imediato (opcional):** `RH.avisoAgora()` (`js/core/data.js`) chama `workflow_dispatch` do GitHub ao registrar uma ronda com NC. Usa `cfg.avisos.repo/ref/ghToken` (Cadastros → Hospital → Avisos por e-mail → Aviso imediato). O token fica no banco, visível aos aparelhos da equipe: use token restrito a este repositório, só com permissão de Actions. Sem token, vale o agendamento (agora a cada 10 min).
- **NC repetida:** `RH.recKey/recorr/recGrupos` (mesmo local + mesmo item; janela de 30 dias). Selo "Repetida ×N" na lista, aviso no detalhe da NC e cartão "Problemas que se repetem" no painel.
- **Pendências de hoje:** `RH.agenda.hoje()` (`js/core/agenda.js`) dá a situação de cada horário previsto (feito/atrasado/agora/depois); um alerta compacto de uma linha no topo de "Nova ronda" (vermelho = atrasada, âmbar = agora, azul = próxima, verde = em dia); toque para abrir a lista.
- Testes: `node tests/agenda.test.js`, `python3 tests/melhorias108.py`.

## v1.0.9: horário do aviso por severidade
- NC **Crítica** (inclui temperatura fora da faixa): e-mail na hora (o app dispara a verificação ao registrar a ronda, se o aviso imediato estiver configurado; senão, na próxima verificação agendada).
- NC **Média/Alta**: entram em `avisos/estado.pend` e só são avisadas `cfg.avisos.horas` (padrão 8) depois do registro, e só se ainda estiverem **abertas** (o script relê a NC no banco). Resolvida ou em tratamento antes disso = sem e-mail.
- Falha de envio mantém a NC em `pend` para nova tentativa (até 20). O e-mail dessas NCs informa "Ainda aberta N horas após o registro".

## Glossário (termos usados na interface)
- **Não resolvida**: NC com situação *Aberta* ou *Em tratamento*. É o termo único para "ainda pendente" no painel e na lista de NCs.
- **Inacessível**: item que não pôde ser avaliado (exige justificativa). Não entra no cálculo da conformidade.
- **Conformidade**: itens conformes ÷ (conformes + não conformes).
- **Código do local**: QR Code ou código de barras fixado na sala/equipamento, lido ao chegar.
- **Ponto de acesso Wi-Fi (BSSID)**: identificador (endereço MAC) do ponto de acesso ao qual o aparelho está conectado. Só o app Android lê.
- **Percurso da ronda**: ordem em que salas e equipamentos são inspecionados.
- **Responsável pelas NCs**: quem recebe as NCs da sala. Para equipamentos, vale o da primeira sala do setor que tiver responsável. Sem responsável, a NC aparece como "Não atribuído".
- **Ronda para "Todos"**: qualquer usuário com acesso a Nova ronda (inspetor, gestor ou administrador).

## v1.0.11: revisão de textos e coerência
- Termo único **"Não resolvidas"** (aberta + em tratamento) na tela de NCs e no painel.
- NC sem responsável aparece como **"Não atribuído"** (antes, "Todos").
- Temperatura medida fora da faixa ideal gera NC **Crítica** (antes Média/Alta) e entra no aviso imediato.
- Ao resolver uma NC, o sistema grava quem a resolveu (`resolvidoPor`) e mostra no detalhe.
- Histórico, Painel e NCs avisam quando o limite de 1000 registros carregados é atingido.
- Painel mostra a quantidade de itens inacessíveis; Histórico explica o cálculo da conformidade.
- Senhas novas usam PBKDF2 com 600 mil iterações (campo `iter` no usuário); contas antigas são atualizadas no próximo login.
- Padronização: "ponto de acesso Wi-Fi", "código do local", "Percurso da ronda", "Responsável pelas NCs", "todos os usuários".
- Dados de exemplo: itens de temperatura agora têm faixa ideal.
- Correções de português em telas, mensagens e documentos.
