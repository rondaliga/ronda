# Validação de presença: código de barras + antena Wi-Fi (BSSID)

## Como funciona
1. **Cadastros → Salas / Equipamentos**: preencha *Código de barras do local* (botão "Gerar código") e as *Antenas Wi-Fi (BSSID)* que cobrem o local.
   Equipamento sem BSSID próprio herda os das salas do mesmo setor.
2. **Cadastros → Hospital → Presença no local**: `Desligada` (padrão) · `Registrar` (grava a evidência, não bloqueia) · `Exigir` (o checklist do local só libera após a leitura).
3. Na ronda, cada sala/equipamento mostra **Ler código do local**. O app lê o código e, **logo em seguida**, o BSSID da rede em que o aparelho está.
4. Regras (`RH.local.validar`, js/core/local.js): código ≠ esperado → rejeita (informa de qual local é o código lido); código certo mas BSSID fora da lista → rejeita; BSSID ilegível → rejeita se a política for "Exigir", senão aceita marcando "Wi-Fi não verificado".
5. Ao finalizar, o registro é **reavaliado** (pega rascunho adulterado) e a evidência vai em `rondas/*.presenca` (status, hora, código lido, BSSID, últimas rejeições). O Histórico mostra o selo.

## O BSSID só existe no aplicativo Android
Navegador comum, PWA instalado e iPhone **não** conseguem ler o BSSID. Opções de custo zero:

**Android com Capacitor (APK instalado direto, sem Play Store)**
```bash
mkdir ronda-app && cd ronda-app && npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android @capgo/capacitor-wifi
npx cap init "Ronda Hospitalar" br.hospital.ronda --web-dir=www
mkdir www && cp -r ../ronda-main/{index.html,css,js} www/
npx cap add android && npx cap sync
npx cap open android      # Android Studio → Build → Build APK(s)
```
- Confira no `AndroidManifest.xml` as permissões `ACCESS_FINE_LOCATION`, `ACCESS_WIFI_STATE` e `CAMERA` (o plugin costuma declará-las; se faltar, adicione).
- O aparelho precisa estar com a **localização ligada** e o app com permissão de localização, senão o Android devolve `02:00:00:00:00:00` (o código trata como "sem permissão").
- O código usa `window.Capacitor.Plugins.CapacitorWifi.getWifiInfo()` (campo `bssid`). Confirme o nome do plugin no primeiro build; se for diferente, ajuste `bssidBruto()` em `js/core/local.js`.
- Alternativa sem Capacitor: um WebView Android próprio que exponha `window.RondaNativo.getBssid()` (string ou Promise) — também é detectado.

**iPhone**: o plugin não expõe BSSID no iOS e a API da Apple exige entitlement + conta de desenvolvedor paga. No iPhone use a política *Conferir quando o aparelho conseguir ler*: vale só o código (e o hospital vê "Wi-Fi não verificado" no histórico).

## Imprimir as etiquetas (QR Code ou código de barras)
1. **Cadastros → Salas** (ou **Equipamentos**) → **Imprimir etiquetas**.
2. Se aparecer "N sem código", use "Gerar código" no cadastro de cada local.
3. Escolha **QR Code** ou **Código de barras (Code 128)** e clique em **Imprimir**. Cada etiqueta traz QR/código, nome, setor e o texto do código.
4. Imprima em 100%, preto sobre branco, recorte nas linhas pontilhadas e cole em ponto fixo do local. Teste a leitura no app antes de colar todas.
O gerador é próprio (`js/core/barcode.js`, sem bibliotecas): QR nível Q com até 74 caracteres; Code 128 só com ASCII simples (sem acentos).

## Leitor de código de barras
Usa o `BarcodeDetector` nativo (Chrome Android) e, se não existir (iPhone, WebView), carrega o **ZXing** sob demanda de `js/vendor/zxing-library.min.js` ou, na falta dele, da CDN jsdelivr (`@zxing/library@0.21.3`).
Para funcionar offline/no APK, baixe `umd/index.min.js` desse pacote e salve como `js/vendor/zxing-library.min.js`.

## Limites que você precisa conhecer
- **Antena ≠ sala.** Uma antena cobre várias salas; ela prova "perto desta antena", o código prova "este ponto". Juntos barram foto à distância, mas não foto tirada na sala ao lado sob a mesma antena. Use mais de uma antena por setor só se a cobertura for distinta e mantenha as etiquetas em pontos discretos.
- **A checagem roda no aparelho.** Quem editar o JavaScript no navegador ou usar um aparelho modificado consegue forjar a leitura. A evidência gravada (BSSID lido, tentativas rejeitadas) permite auditar. Para bloqueio real, a mesma regra precisa rodar no servidor (função SQL/Edge Function do Supabase) — não implementado aqui.
- Um BSSID pode mudar se o hospital trocar/reconfigurar antenas: atualize o cadastro (botão "Ler a antena deste aparelho agora" no formulário, com o app Android, ao lado da antena).
- Dual-band/multi-SSID: cada rádio tem um BSSID; use curinga `aa:bb:cc:dd:*:*` (mínimo 3 octetos fixos).

## Testes
```
node tests/local.test.js      # regras (13 testes)
python3 tests/e2e_local.py    # fluxo completo no navegador, com leitor/BSSID simulados e painel de câmera falsa
```
