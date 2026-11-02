"""
Teste ponta a ponta da validação de presença (código de barras + BSSID).
Leitor e provedor de BSSID são simulados (RH.local.leitor / RH.local.provedorBssid); no final,
o painel real da câmera é exercitado com câmera falsa do Chromium + BarcodeDetector simulado.
Modo local (IndexedDB descartável): nunca toca o banco real.
Uso: python3 tests/e2e_local.py
"""
import http.server, socketserver, threading, os, sys, functools, base64
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8766
errors, results = [], []

def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("  OK   " if cond else "  FAIL ") + name + (f"  -> {extra}" if (extra and not cond) else ""))

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def new_ctx(browser):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, permissions=["camera"])
    ctx.route("**/js/config.js*", lambda r: r.fulfill(body="window.RONDA_CONFIG={supabaseUrl:'',supabaseKey:''};", content_type="application/javascript"))
    ctx.route("**/*.supabase.co/**", lambda r: r.abort())
    ctx.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    ctx.route("**/fonts.gstatic.com/**", lambda r: r.abort())
    return ctx

def toast(page): return page.inner_text("#toast")

def scan(page, code, bssid):
    """simula: o inspetor lê `code` estando conectado à antena `bssid`"""
    page.evaluate("([c,b])=>{window.__c=c;window.__b=b}", [code, bssid])

def click_scan(page, nome):
    page.locator(f"section.bl:has(h2:has-text('{nome}')) [data-act=chkScan]").click()
    page.wait_for_timeout(250)

def main():
    srv = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        ctx = new_ctx(browser); page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" else None)
        page.goto(f"http://127.0.0.1:{PORT}/index.html")
        page.wait_for_selector("#f-setup")
        page.fill("#st-n", "Ana Admin"); page.fill("#st-l", "admin"); page.fill("#st-s", "Senha@123")
        page.click("#st-btn"); page.wait_for_selector("#nav")

        page.evaluate("RH.put('checklists','ck1',{nome:'Sala padrão',tipo:'sala',itens:[{id:'i1',t:'Limpeza adequada'}]})")
        page.wait_for_timeout(300)

        # ---------- cadastro de salas com código e BSSID ----------
        print("\n== Cadastro ==")
        def nova_sala(nome, codigo, bssids):
            page.click("#nav [data-p=cadastros]"); page.click("[data-act=cadTab][data-k=salas]"); page.click("[data-act=newEnt]")
            page.fill("#ff-nome", nome); page.fill("#ff-setor", "UTI")
            page.fill("[data-itx='0']", "Limpeza adequada")
            page.click("#et-presenca"); page.fill("#ff-codigoLocal", codigo); page.fill("#ff-bssids", bssids)
            page.click("#f-ent button[type=submit]")
        page.click("#nav [data-p=cadastros]"); page.click("[data-act=cadTab][data-k=salas]"); page.click("[data-act=newEnt]")
        page.click("#et-presenca"); page.click("[data-act=genCodigo]")
        check("Gerar código cria RH-S-XXXXXX", page.input_value("#ff-codigoLocal").startswith("RH-S-") and len(page.input_value("#ff-codigoLocal")) == 11)
        page.click("[data-act=closeModal]")
        nova_sala("UTI 01", "rh-s-uti01", "AA-BB-CC-DD-EE-01\naa:bb:cc:dd:ff:*")
        page.wait_for_selector("#f-ent", state="detached")
        nova_sala("UTI 02", "RH-S-UTI01", "")
        check("Código duplicado é recusado", "já está em uso" in page.inner_text("#ent-err"))
        page.fill("#ff-codigoLocal", "RH-S-UTI02"); page.fill("#ff-bssids", "zz:zz")
        page.click("#f-ent button[type=submit]")
        check("BSSID inválido é recusado", "BSSID inválido" in page.inner_text("#ent-err"))
        page.fill("#ff-bssids", "aa:bb:cc:dd:ee:02"); page.click("#f-ent button[type=submit]")
        page.wait_for_selector("#f-ent", state="detached")
        salas = page.evaluate("RH.S.salas.map(s=>[s.nome,s.codigoLocal,s.bssids])")
        check("Código e BSSID gravados normalizados", sorted(salas) == [["UTI 01", "RH-S-UTI01", "aa:bb:cc:dd:ee:01\naa:bb:cc:dd:ff:*"], ["UTI 02", "RH-S-UTI02", "aa:bb:cc:dd:ee:02"]], salas)
        check("Tabela mostra o código e a contagem de antenas", "RH-S-UTI01" in page.inner_text("table") and "2 antena(s)" in page.inner_text("table"))

        # botão "ler antena deste aparelho": sem provedor (navegador) -> mensagem clara
        page.click("tr[data-act=editEnt]:has-text('UTI 01')"); page.click("#et-presenca"); page.click("[data-act=capBssid]"); page.wait_for_timeout(200)
        check("Navegador comum: aviso de que não lê o BSSID", "não permite ler a antena" in toast(page), toast(page))
        page.evaluate("RH.local.provedorBssid=async()=>'AA:BB:CC:DD:EE:77'")
        page.click("#et-presenca"); page.click("[data-act=capBssid]"); page.wait_for_timeout(200)
        check("Aplicativo: antena atual é adicionada ao cadastro", "aa:bb:cc:dd:ee:77" in page.input_value("#ff-bssids"))
        page.click("[data-act=closeModal]")

        sid = page.evaluate("Object.fromEntries(RH.S.salas.map(s=>[s.nome,s.id]))")
        page.evaluate("""(ids)=>RH.put('modelos','m1',{nome:'Ronda UTI',ativo:true,responsavelId:'',dias:[0,1,2,3,4,5,6],horarios:['08:00'],
            salaIds:[ids['UTI 01'],ids['UTI 02']],equipIds:[],ordem:['s:'+ids['UTI 01'],'s:'+ids['UTI 02']]})""", sid)
        page.wait_for_timeout(300)

        # ---------- política ----------
        page.click("#nav [data-p=cadastros]"); page.click("[data-act=cadTab][data-k=hospital]")
        page.select_option("select[name=valLocal]", value="exigir"); page.select_option("select[name=valBssid]", value="exigir")
        page.click("#f-cfg button[type=submit]"); page.wait_for_timeout(500)
        check("Política gravada em config", page.evaluate("[RH.S.cfg.valLocal,RH.S.cfg.valBssid]") == ["exigir", "exigir"])

        # ---------- ronda ----------
        print("\n== Ronda com presença exigida ==")
        page.evaluate("RH.local.leitor=async()=>window.__c; RH.local.provedorBssid=async()=>window.__b")
        page.click("#nav [data-p=ronda]"); page.click("[data-act=pickRonda]"); page.wait_for_selector(".rhead")
        check("Checklists começam bloqueados", page.locator(".items.locked").count() == 2 and page.locator(".chk-box.blk").count() == 2)
        page.evaluate("RH.ACT.res({dataset:{k:Object.keys(RH.st.R.itens)[0],r:'C'}})")
        check("Responder sem presença é recusado", "antes de responder" in toast(page) and page.evaluate("Object.values(RH.st.R.itens).every(i=>!i.r)"))
        page.click("#btn-sub")
        check("Finalizar sem presença é bloqueado", "Faltam" in toast(page) or "Confirme a presença" in toast(page), toast(page))

        scan(page, "999999", "aa:bb:cc:dd:ee:01"); click_scan(page, "UTI 01")
        check("Código desconhecido rejeitado", "não corresponde" in page.inner_text("section.bl:has(h2:has-text('UTI 01'))") and page.locator(".items.locked").count() == 2)
        scan(page, "RH-S-UTI02", "aa:bb:cc:dd:ee:01"); click_scan(page, "UTI 01")
        check("Foto do código de outra sala: rejeitada, diz de qual sala é", 'pertence a "UTI 02"' in page.inner_text("section.bl:has(h2:has-text('UTI 01'))"))
        scan(page, "RH-S-UTI01", "aa:bb:cc:dd:ee:02"); click_scan(page, "UTI 01")
        check("Código certo + antena de outra sala: rejeitado", "antena Wi-Fi que não pertence" in page.inner_text("section.bl:has(h2:has-text('UTI 01'))"))
        page.evaluate("RH.local.provedorBssid=async()=>({motivo:'navegador'})")
        scan(page, "RH-S-UTI01", ""); click_scan(page, "UTI 01")
        check("Sem leitura de BSSID (navegador) + política 'exigir': rejeitado", "não permite ler a antena" in page.inner_text("section.bl:has(h2:has-text('UTI 01'))"))
        page.evaluate("RH.local.provedorBssid=async()=>window.__b")
        scan(page, "rh-s-uti01", "AA:BB:CC:DD:FF:12"); click_scan(page, "UTI 01")
        check("Leitura válida (curinga da antena) libera a sala", page.locator("section.bl:has(h2:has-text('UTI 01')) .chk-box.ok").count() == 1 and page.locator(".items.locked").count() == 1)

        # rascunho mantém o check-in
        page.reload(); page.wait_for_selector(".rhead")
        check("Recarregar a página mantém a presença confirmada", page.locator("section.bl:has(h2:has-text('UTI 01')) .chk-box.ok").count() == 1)
        page.evaluate("RH.local.leitor=async()=>window.__c; RH.local.provedorBssid=async()=>window.__b")

        scan(page, "RH-S-UTI02", "aa:bb:cc:dd:ee:02"); click_scan(page, "UTI 02")
        check("Segunda sala liberada", page.locator(".items.locked").count() == 0 and page.locator(".chk-box.ok").count() == 2)
        for b in page.query_selector_all(".seg button.c"): b.click()
        # adulteração do rascunho: BSSID trocado no estado
        page.evaluate("RH.st.R.chk[RH.st.R.blocos[0].id].ok.bssid='11:22:33:44:55:66'")
        page.click("#btn-sub")
        check("Registro adulterado é revalidado e recusado ao finalizar", "Confirme a presença" in toast(page), toast(page))
        page.evaluate("RH.st.R.chk[RH.st.R.blocos[0].id].ok.bssid='aa:bb:cc:dd:ff:12'")

        page.click("#btn-sub"); page.wait_for_selector(".top h1:has-text('Histórico de rondas')")
        docs = page.evaluate("RH.S.rondas.map(r=>[r.salaNome,r.presenca&&r.presenca.status,r.presenca&&r.presenca.rede,r.presenca&&r.presenca.bssid,(r.presenca&&r.presenca.falhas||[]).length])")
        check("Evidência gravada em cada sala (status, rede, BSSID, tentativas rejeitadas)",
              sorted(docs) == [["UTI 01", "confirmada", "confere", "aa:bb:cc:dd:ff:12", 4], ["UTI 02", "confirmada", "confere", "aa:bb:cc:dd:ee:02", 0]], docs)
        page.click("tbody tr"); page.wait_for_selector(".mod")
        check("Histórico só lista ocorrências: sem itens conformes", page.locator(".mod .pill.okp").filter(has_text="Conforme").count() == 0)
        check("Histórico sem ocorrências mostra aviso", "Nenhuma não conformidade" in page.inner_text(".mod"))
        page.click("[data-act=closeModal]")

        # ---------- modo registrar: não bloqueia ----------
        print("\n== Modo 'registrar' ==")
        t0 = page.evaluate("Date.now()")
        page.evaluate("RH.put('config','main',{...RH.S.cfg,valLocal:'registrar'})"); page.wait_for_timeout(500)
        page.click("#nav [data-p=ronda]"); page.click("[data-act=pickRonda]"); page.wait_for_selector(".rhead")
        check("Registrar: checklist liberado sem leitura", page.locator(".items.locked").count() == 0 and page.locator(".chk-box.pend").count() == 2)
        for b in page.query_selector_all(".seg button.c"): b.click()
        page.click("#btn-sub"); page.wait_for_selector(".top h1:has-text('Histórico de rondas')")
        st = page.evaluate("t=>RH.S.rondas.filter(r=>r.ts>t).map(r=>r.presenca.status)", t0)
        check("Registrar: finaliza e marca 'nao_confirmada'", st == ["nao_confirmada", "nao_confirmada"], st)

        # ---------- histórico: só ocorrências, com foto ----------
        print("\n== Histórico ==")
        PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
        page.evaluate("RH.put('tiposNC','t1',{nome:'Higienização deficiente',sev:2,orient:'Refazer.'})"); page.wait_for_timeout(300)
        t1 = page.evaluate("Date.now()")
        page.click("#nav [data-p=ronda]"); page.click("[data-act=pickRonda]"); page.wait_for_selector(".rhead")
        for b in page.query_selector_all(".seg button.c"): b.click()
        page.locator(".it").first.locator("button.n").click()
        page.locator(".it").first.locator("select[data-nc=tipoId]").select_option(label="Higienização deficiente")
        page.locator(".it").first.locator("textarea").fill("Piso sujo.")
        page.locator(".it").first.locator("input[data-nc-foto]").set_input_files({"name": "f.png", "mimeType": "image/png", "buffer": PNG})
        page.wait_for_selector(".ncp img")
        page.click("#btn-sub"); page.wait_for_selector(".top h1:has-text('Histórico de rondas')")
        page.locator("tbody tr").first.click(); page.wait_for_selector(".mod")
        page.wait_for_timeout(400)
        txt = page.inner_text(".mod")
        check("Histórico lista a NC com tipo e descrição", "Não conforme" in txt and "Piso sujo." in txt and "Higienização deficiente" in txt, txt)
        check("Histórico mostra a foto capturada na ronda", page.locator(".mod img[data-foto]").count() == 1 and page.evaluate("document.querySelector('.mod img[data-foto]').src.startsWith('data:image')"))
        check("Histórico não lista itens conformes", page.locator(".mod .pill.okp").filter(has_text="Conforme").count() == 0 and txt.count("Limpeza adequada") == 1, txt)
        check("Sem lista 'Sem ocorrências' e sem nome de sala repetido", "Sem ocorrências" not in txt and txt.count("UTI 01") == 1, txt)
        page.click("[data-act=closeModal]")

        # ---------- liberação em grupo ----------
        print("\n== Liberação em grupo ==")
        page.evaluate("RH.put('config','main',{...RH.S.cfg,valLocal:'exigir',valBssid:'exigir'})"); page.wait_for_timeout(400)
        page.click("#nav [data-p=cadastros]"); page.click("[data-act=cadTab][data-k=modelos]")
        page.click("tr[data-act=editEnt]:has-text('Ronda UTI')")
        check("Cadastro da ronda oferece 'Liberar com' em cada local", page.locator("select[data-lib]").count() == 2)
        page.locator("select[data-lib]").nth(1).select_option(label="UTI 01")
        check("Chave mostra quantos locais libera", "Libera 1" in page.inner_text("#ord-list"))
        page.click("#f-ent button[type=submit]"); page.wait_for_selector("#f-ent", state="detached")
        check("Vínculo gravado na ronda", page.evaluate("Object.keys(RH.S.modelos.find(m=>m.id==='m1').liberacao||{}).length") == 1)
        page.click("#nav [data-p=ronda]"); page.click("[data-act=pickRonda]"); page.wait_for_selector(".rhead")
        check("Ambas começam bloqueadas", page.locator(".items.locked").count() == 2)
        check("UTI 02 pede o código da UTI 01", "código de barras de UTI 01" in page.inner_text("section.bl:has(h2:has-text('UTI 02'))"))
        scan(page, "RH-S-UTI02", "aa:bb:cc:dd:ee:02")
        page.locator("section.bl:has(h2:has-text('UTI 02')) [data-act=chkScan]").click(); page.wait_for_timeout(250)
        check("Código do próprio dependente não libera (só o da chave)", page.locator(".items.locked").count() == 2)
        scan(page, "RH-S-UTI01", "aa:bb:cc:dd:ee:01")
        page.locator("section.bl:has(h2:has-text('UTI 02')) [data-act=chkScan]").click(); page.wait_for_timeout(250)
        check("Ler a chave (código + antena dela) libera todas", page.locator(".items.locked").count() == 0 and page.locator(".chk-box.ok").count() == 2)
        for b in page.query_selector_all(".seg button.c"): b.click()
        page.click("#btn-sub"); page.wait_for_selector(".top h1:has-text('Histórico de rondas')")
        ev = page.evaluate("RH.S.rondas.filter(r=>r.salaNome==='UTI 02').sort((a,b)=>b.ts-a.ts)[0].presenca")
        check("Evidência da dependente aponta a chave", ev["status"] == "confirmada" and ev.get("via") == "UTI 01" and ev["bssid"] == "aa:bb:cc:dd:ee:01", ev)

        # ---------- painel real da câmera (câmera falsa + BarcodeDetector simulado) ----------
        print("\n== Painel da câmera ==")
        page.evaluate("RH.upd('modelos','m1',{liberacao:{}})"); page.wait_for_timeout(300)   # volta a exigir o código de cada local
        page.evaluate("RH.put('config','main',{...RH.S.cfg,valLocal:'exigir',valBssid:'se_disponivel'})"); page.wait_for_timeout(500)
        page.evaluate("""()=>{RH.local.leitor=null;RH.local.provedorBssid=async()=>'aa:bb:cc:dd:ee:01';
          window.BarcodeDetector=class{static async getSupportedFormats(){return['code_128','qr_code']}constructor(o){this.o=o}async detect(v){window.__frames=(window.__frames||0)+1;return window.__frames>2?[{rawValue:'RH-S-UTI01'}]:[]}}}""")
        page.click("#nav [data-p=ronda]"); page.click("[data-act=pickRonda]"); page.wait_for_selector(".rhead")
        page.locator("section.bl:has(h2:has-text('UTI 01')) [data-act=chkScan]").click()
        page.wait_for_selector("#scan-ov", timeout=3000)
        check("Painel de leitura abre com a câmera", page.locator("#scan-v").count() == 1)
        page.wait_for_selector("#scan-ov", state="detached", timeout=4000)
        page.wait_for_timeout(300)
        check("Leitura pela câmera confirma a presença e fecha o painel", page.locator("section.bl:has(h2:has-text('UTI 01')) .chk-box.ok").count() == 1)
        check("Câmera é desligada ao terminar", page.evaluate("document.querySelectorAll('video').length") == 0)
        page.locator("section.bl:has(h2:has-text('UTI 02')) [data-act=chkScan]").click()
        page.wait_for_selector("#scan-ov"); page.click("#scan-x"); page.wait_for_timeout(200)
        check("Cancelar fecha o painel sem registrar nada", page.locator("#scan-ov").count() == 0 and page.locator("section.bl:has(h2:has-text('UTI 02')) .items.locked").count() == 1)

        # ---------- etiquetas (QR Code / código de barras) ----------
        print("\n== Etiquetas ==")
        page.evaluate("RH.put('salas','sx',{nome:'Sala sem código',setor:'UTI',ativo:true})"); page.wait_for_timeout(400)
        page.click("#nav [data-p=cadastros]"); page.click("[data-act=cadTab][data-k=salas]"); page.click("[data-act=etqOpen]")
        page.wait_for_selector(".etq-grid")
        check("Etiquetas: uma por sala com código (2) e aviso das sem código", page.locator(".etq").count() == 2 and "1 sem código" in page.inner_text("#etq-bar"))
        check("Etiquetas: sem botão 'Gerar códigos faltantes' e QR sem '(recomendado)'", page.locator("[data-act=etqGen]").count() == 0 and "recomendado" not in page.inner_text("#etq-bar"))
        page.evaluate("RH.upd('salas','sx',{codigoLocal:RH.local.gerarCodigo('S')})"); page.wait_for_timeout(1500)
        cod = page.evaluate("RH.S.salas.find(s=>s.id==='sx').codigoLocal")
        page.evaluate("document.getElementById('etq-grid').innerHTML=''"); page.click("[data-act=etqFmt][data-v=qr]")
        check("Local com código cadastrado ganha etiqueta", cod.startswith("RH-S-") and page.locator(".etq").count() == 3, cod)
        try:
            import cv2, numpy as np
            def decodifica(el):
                png = el.screenshot(); img = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)
                return cv2.QRCodeDetector().detectAndDecode(cv2.resize(img, None, fx=3, fy=3, interpolation=cv2.INTER_NEAREST))[0]
            codes = page.evaluate("[...document.querySelectorAll('.etq code')].map(c=>c.textContent)")
            lidos = [decodifica(page.locator(".etq .etq-img").nth(i)) for i in range(3)]
            check("QR Code impresso decodifica para o código de cada local (OpenCV)", lidos == codes, (lidos, codes))
        except ImportError:
            print("  (pulado: instale opencv-python-headless para decodificar o QR)")
        page.click("[data-act=etqFmt][data-v=c128]")
        check("Formato código de barras gera SVG por etiqueta", page.locator(".etq.c128 svg").count() == 3)
        page.click("[data-act=closeModal]")

        browser.close()
    srv.shutdown()
    bad = [n for n, ok in results if not ok]
    real_errors = [e for e in errors if "Failed to load resource" not in e]
    print(f"\n{len(results)-len(bad)}/{len(results)} verificações OK; erros de console: {len(real_errors)}")
    for e in real_errors[:10]: print("  ", e)
    sys.exit(1 if bad or real_errors else 0)

if __name__ == "__main__":
    main()
