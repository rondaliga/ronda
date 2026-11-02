"""
Testa o MODO COMPARTILHADO (Supabase) contra um servidor simulado em memória.
As chamadas a https://<projeto>.supabase.co/rest/v1/rpc/* são interceptadas no navegador,
portanto NADA é enviado ao seu banco real. Usa o js/config.js verdadeiro do projeto.

Uso:  python3 tests/remote_mock.py
"""
import http.server, socketserver, threading, os, sys, functools, json, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8766
CODE = "equipe-123"
DB = {}      # path -> {"seq": n, "d": {...}, "deleted": bool}
SEQ = [0]
calls = []
results = []

def check(name, cond, extra=""):
    results.append(bool(cond)); print(("  OK   " if cond else "  FAIL ") + name + (f"  -> {extra}" if (extra and not cond) else ""))

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def rpc(route):
    req = route.request
    fn = req.url.rsplit("/", 1)[-1]
    body = json.loads(req.post_data or "{}")
    cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
    if req.method == "OPTIONS":
        return route.fulfill(status=204, headers=cors)
    calls.append(fn)
    if body.get("p_code") != CODE:
        return route.fulfill(status=400, headers=cors, content_type="application/json", body=json.dumps({"message": "codigo_invalido"}))
    out = None
    if fn == "rh_check":
        out = True
    elif fn == "rh_put_many":
        for it in body["p_items"]:
            SEQ[0] += 1
            DB[it["p"]] = {"seq": SEQ[0], "d": it["d"], "deleted": it["d"] is None}
        out = len(body["p_items"])
    elif fn == "rh_pull":
        rows = [{"seq": v["seq"], "p": p, "d": v["d"], "deleted": v["deleted"]} for p, v in DB.items()
                if v["seq"] > body.get("p_since", 0) and (body.get("p_fotos") or not p.startswith("fotos/"))]
        out = sorted(rows, key=lambda r: r["seq"])
    elif fn == "rh_get":
        v = DB.get(body["p_path"]); out = v["d"] if v and not v["deleted"] else None
    route.fulfill(status=200, headers=cors, content_type="application/json", body=json.dumps(out))

def main():
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        def ctx_page(tag):
            c = b.new_context(viewport={"width": 1280, "height": 900})
            c.route(re.compile(r"https://[a-z0-9]+\.supabase\.co/rest/v1/rpc/.*"), rpc)
            c.route("**/fonts.g*/**", lambda r: r.abort())
            pg = c.new_page()
            pg.on("pageerror", lambda e: errs.append(f"[{tag}] {e}"))
            return c, pg
        c1, a = ctx_page("A")
        a.goto(f"http://127.0.0.1:{PORT}/index.html")
        a.wait_for_selector("#rh-code-i")
        check("modo compartilhado pede o código de acesso", True)
        a.fill("#rh-code-i", "errado"); a.click("#rh-code button"); a.wait_for_selector("#rh-code-i")
        check("código errado é recusado e pede de novo", "incorreto" in a.inner_text("#rh-code [role=alert]"))
        a.fill("#rh-code-i", CODE); a.click("#rh-code button"); a.wait_for_selector("#f-setup")
        a.fill("#st-n", "Ana"); a.fill("#st-l", "admin"); a.fill("#st-s", "Senha@123"); a.click("#st-btn"); a.wait_for_selector("#nav")
        a.click("#nav [data-p=cadastros]"); a.click("[data-act=cadTab][data-k=salas]"); a.click("[data-act=newEnt]")
        a.fill("#ff-nome", "UTI 1"); a.fill("#ff-setor", "UTI"); a.click("#f-ent button[type=submit]"); a.wait_for_selector("#f-ent", state="detached")
        a.click("[data-act=cadTab][data-k=modelos]"); a.click("[data-act=newEnt]")
        a.fill("#ff-nome", "Ronda UTI"); a.locator("#salas-pick label.chk", has_text="UTI 1").locator("input").check()
        a.click("#f-ent button[type=submit]"); a.wait_for_selector("#f-ent", state="detached")
        a.wait_for_timeout(300)
        check("dados chegam ao servidor simulado", any(k.startswith("modelos/") for k in DB) and any(k.startswith("salas/") for k in DB) and "config/main" in DB)
        check("senha não é gravada em texto puro", "Senha@123" not in json.dumps(DB))
        # segundo aparelho vê os mesmos dados
        c2, bpage = ctx_page("B")
        bpage.goto(f"http://127.0.0.1:{PORT}/index.html"); bpage.wait_for_selector("#rh-code-i")
        bpage.fill("#rh-code-i", CODE); bpage.click("#rh-code button"); bpage.wait_for_selector("#f-login")
        check("segundo aparelho vê o login (base compartilhada já iniciada)", True)
        bpage.fill("#lg-login", "admin"); bpage.fill("#lg-senha", "Senha@123"); bpage.click("#f-login button[type=submit]"); bpage.wait_for_selector("#nav")
        check("segundo aparelho vê a ronda cadastrada", bpage.evaluate("RH.S.modelos.map(m=>m.nome)") == ["Ronda UTI"])
        # sincronização em tempo (polling 4s): cria em A, aparece em B
        a.click("[data-act=newEnt]"); a.fill("#ff-nome", "Ronda B"); a.locator("#salas-pick label.chk", has_text="UTI 1").locator("input").check()
        a.click("#f-ent button[type=submit]"); a.wait_for_selector("#f-ent", state="detached")
        bpage.wait_for_function("RH.S.modelos.length===2", timeout=9000)
        check("alteração em um aparelho chega ao outro automaticamente", True)
        # exclusão propaga
        a.click("tr[data-act=editEnt]:has-text('Ronda B')"); a.click("#btn-del"); a.click("#btn-del"); a.wait_for_selector("#f-ent", state="detached")
        bpage.wait_for_function("RH.S.modelos.length===1", timeout=9000)
        check("exclusão em um aparelho chega ao outro", True)
        # código salvo no aparelho: recarregar não pede de novo
        a.reload(); a.wait_for_selector("#nav", timeout=8000)
        check("código fica salvo: recarregar entra direto", a.evaluate("RH.S.modelos.length") == 1)
        # backup exporta
        j = a.evaluate("RH.store.exportJSON()")
        check("backup exporta os dados", len(json.loads(j)["docs"]) > 3)
        b.close()
    srv.shutdown()
    real = [e for e in errs if "Failed to load" not in e]
    for e in real: print("  ", e)
    check("sem erros de JavaScript", not real)
    print(f"\n{sum(results)}/{len(results)} verificações passaram"); sys.exit(0 if all(results) else 1)

if __name__ == "__main__":
    main()
