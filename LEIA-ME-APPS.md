# Ronda Hospitalar — aplicativos Android e macOS (uso gratuito)

O sistema agora é **mobile-first**: foi redesenhado para o celular (barra de navegação inferior, tabelas em cartões, janelas que sobem da base, botões de 44 px, câmera e leitor de código de barras em tela cheia). No computador/macOS o layout com menu lateral continua.

Tudo abaixo é **gratuito**: sem Play Store, sem App Store e sem conta de desenvolvedor paga.

## Caminho mais fácil: o GitHub gera os aplicativos para você
1. Envie esta pasta inteira para o seu repositório no GitHub (público ou privado).
2. Abra a aba **Actions → "Gerar aplicativos" → Run workflow**. Em cerca de 10 minutos aparecem os arquivos em *Artifacts* (e em **Releases**, se você criar uma tag como `v2026.11.2`):
   - `ronda-hospitalar.apk` — Android
   - `Ronda Hospitalar-….dmg` (e `.zip`) — macOS (Intel e Apple Silicon)

### Instalar no Android
Envie o `.apk` ao celular (WhatsApp, e-mail, Drive), toque nele e permita "Instalar apps desconhecidos" quando o Android pedir. Na primeira vez, aceite as permissões de **câmera** e **localização** (a localização é exigida pelo Android para ler a antena Wi-Fi).

### Instalar no macOS
Abra o `.dmg` e arraste para *Aplicativos*. Como o app não é assinado pela Apple (isso custa US$ 99/ano), na primeira abertura: **botão direito no app → Abrir → Abrir**. Se aparecer "danificado", rode no Terminal: `xattr -cr "/Applications/Ronda Hospitalar.app"`.

### IMPORTANTE: assine o APK com a sua chave (uma vez)
Sem chave própria, cada build sai com uma assinatura diferente e o Android **não deixa atualizar por cima** (seria preciso desinstalar, perdendo dados locais). Para fixar a assinatura:
```bash
keytool -genkeypair -v -keystore ronda.jks -alias ronda -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 ronda.jks      # no macOS: base64 -i ronda.jks
```
No GitHub: **Settings → Secrets and variables → Actions → New repository secret** e crie `ANDROID_KEYSTORE_BASE64` (o texto do base64), `ANDROID_KEYSTORE_PASSWORD` (a senha) e `ANDROID_KEY_ALIAS` (`ronda`). **Guarde o arquivo `ronda.jks` e a senha em local seguro** — sem eles não há como publicar atualizações.

## Construir no seu próprio computador (opcional)
Requisitos: Node 22+, e para Android o JDK 21 e o Android Studio.
```bash
npm install
npm run android:add     # cria a pasta android/ (só na primeira vez)
npm run android:apk     # APK em android/app/build/outputs/apk/debug/
npm run android:sync    # depois de mudar o código do app
npm run desktop         # abre o app no computador para testar
npm run desktop:mac     # gera o .dmg (precisa ser feito em um Mac)
```

## Sem instalar nada: PWA
No Chrome do Android, abra o endereço do site (GitHub Pages) → menu ⋮ → **Instalar app**. Funciona sem internet depois da primeira abertura. Limite: o navegador não lê o BSSID do Wi-Fi (só o app `.apk` lê).

## O que muda em cada aparelho
| Recurso | Android (.apk) | macOS | PWA/Navegador |
|---|---|---|---|
| Layout de celular | ✅ | ✅ (janela estreita) | ✅ |
| Câmera e leitor de código | ✅ | ✅ | ✅ |
| Antena Wi-Fi (BSSID) | ✅ | ❌ | ❌ |
| Botão Voltar do Android | ✅ | — | — |
| Backup (.json) | menu Compartilhar | baixa o arquivo | baixa o arquivo |
| Relatório / etiquetas | gera arquivo HTML para compartilhar (abra no Chrome → Imprimir/PDF) | imprime direto | imprime direto |
| iPhone | use o PWA (Safari → Compartilhar → Adicionar à Tela de Início) | | |

## Dados e segurança
* Os dados ficam no banco compartilhado (Supabase, `js/config.js`) ou, se vazio, **só no aparelho** (cada celular tem a sua base — use o banco compartilhado em produção).
* A chave `anon` do Supabase no `config.js` é pública por natureza; a proteção real é o código de acesso da equipe e as funções SQL do projeto. Não coloque a chave `service_role` aqui.
