# Validação de presença: código do local + ponto de acesso Wi-Fi (BSSID)

**BSSID** é o identificador (endereço MAC) do ponto de acesso Wi-Fi ao qual o aparelho está conectado. Ele prova que a pessoa está perto daquele ponto de acesso; o código do local prova que ela está naquele ponto exato.

## Como funciona
1. **Cadastros → Salas / Equipamentos → aba "Presença no local"**: preencha o *Código do local* (QR Code ou código de barras; botão "Gerar código") e os *Pontos de acesso Wi-Fi (BSSID)* que cobrem o local.
   Equipamento sem BSSID próprio herda os das salas do mesmo setor.
2. **Cadastros → Hospital → Presença no local (código do local)**: `Desligada` (padrão) · `Registrar leitura (não bloqueia)` (grava a evidência) · `Exigir leitura para liberar o checklist` (o checklist do local só libera após a leitura). A política vale apenas para locais que tenham código cadastrado.
3. Na ronda, cada sala/equipamento mostra **Ler código do local**. O app lê o código e, **logo em seguida**, o BSSID da rede em que o aparelho está.
4. Regras (`RH.local.validar`, js/core/local.js):
   - código diferente do esperado → rejeita (informa de qual local é o código lido);
   - código certo, mas BSSID fora da lista do local → rejeita;
   - BSSID ilegível, **com pontos de acesso cadastrados no local** → rejeita se a política de Wi-Fi for "Exigir"; caso contrário, aceita e marca "ponto de acesso Wi-Fi não verificado";
   - local **sem ponto de acesso cadastrado** → vale só o código ("local sem ponto de acesso cadastrado");
   - local **sem código cadastrado** → a presença não é verificada, mesmo com a política "Exigir".
5. Ao finalizar, o registro é **reavaliado** (pega rascunho adulterado) e a evidência vai em `rondas/*.presenca` (status, hora, código lido, BSSID, últimas rejeições). O Histórico mostra o selo.

## O BSSID só existe no aplicativo Android
Navegador comum, PWA instalado e iPhone **não** conseguem ler o BSSID. Opções de custo zero:

**Android (aplicativo .apk, sem Play Store)**
O projeto já traz tudo pronto: um plugin próprio (`android-extras/RondaWifiPlugin.java`) lê o BSSID e as permissões de câmera e localização são adicionadas automaticamente. Para gerar o `.apk`, siga o `LEIA-ME-APPS.md` (o GitHub compila de graça).
- O aparelho precisa estar com a **localização ligada** e o app com permissão de localização, senão o Android devolve `02:00:00:00:00:00` (o código trata como "sem permissão").
- O código usa `window.Capacitor.Plugins.RondaWifi.getBssid()` (campos `valor` ou `motivo`); veja `bssidBruto()` em `js/core/local.js`.

**iPhone**: o plugin não expõe BSSID no iOS e a API da Apple exige entitlement + conta de desenvolvedor paga. No iPhone use a política *Conferir quando o aparelho conseguir ler*: vale só o código (e o hospital vê "ponto de acesso Wi-Fi não verificado" no histórico).

## Imprimir as etiquetas (QR Code ou código de barras)
1. **Cadastros → Salas** (ou **Equipamentos**) → **Imprimir etiquetas**.
2. Se aparecer "N sem código", use "Gerar código" no cadastro de cada local.
3. Escolha **QR Code** ou **Código de barras (Code 128)** e clique em **Imprimir**. Cada etiqueta traz QR/código, nome, setor e o texto do código.
4. Imprima em 100%, preto sobre branco, recorte nas linhas pontilhadas e cole em ponto fixo do local. Teste a leitura no app antes de colar todas.

O gerador é próprio (`js/core/barcode.js`, sem bibliotecas): QR nível Q com até 74 caracteres; Code 128 só com ASCII simples (sem acentos).

## Leitor de código
Usa o `BarcodeDetector` nativo (Chrome Android) e, se não existir (iPhone, WebView), carrega o **ZXing** de `js/vendor/zxing-library.min.js` ou, na falta dele, da CDN jsDelivr (`@zxing/library@0.21.3`).
O arquivo local é copiado automaticamente por `tools/preparar-www.js` quando o `npm install` foi executado (é o que o GitHub faz ao publicar o site e gerar os aplicativos), então o leitor funciona sem internet. Só é preciso copiá-lo à mão se você publicar a pasta sem passar por esse script: salve `node_modules/@zxing/library/umd/index.min.js` como `js/vendor/zxing-library.min.js`.

## Limites que você precisa conhecer
- **Ponto de acesso ≠ sala.** Um ponto de acesso cobre várias salas; ele prova "perto deste ponto de acesso", o código prova "este local". Juntos barram foto à distância, mas não foto tirada na sala ao lado sob o mesmo ponto de acesso. Use mais de um ponto de acesso por setor só se a cobertura for distinta e mantenha as etiquetas em pontos discretos.
- **A checagem roda no aparelho.** Quem editar o JavaScript no navegador ou usar um aparelho modificado consegue forjar a leitura. A evidência gravada (BSSID lido, tentativas rejeitadas) permite auditar. Para bloqueio real, a mesma regra precisa rodar no servidor (função SQL/Edge Function do Supabase), o que não está implementado aqui.
- Um BSSID pode mudar se o hospital trocar ou reconfigurar pontos de acesso: atualize o cadastro (botão "Ler o ponto de acesso deste aparelho agora", no formulário, com o app Android, junto ao ponto de acesso).
- Dual-band/multi-SSID: cada rádio tem um BSSID; use curinga `aa:bb:cc:dd:*:*` (mínimo 3 octetos fixos).

## Testes
```
node tests/local.test.js      # regras (14 testes)
python3 tests/e2e_local.py    # fluxo completo no navegador, com leitor/BSSID simulados e painel de câmera falsa
```
