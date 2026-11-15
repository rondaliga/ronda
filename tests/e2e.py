"""
Apoio comum dos testes em navegador (Playwright + Chromium) da Ronda Hospitalar: servidor local, contexto, login, cadastros e verificações.
Os roteiros ficam nos outros arquivos de tests/ (e2e_local.py, painel_novos.py, etc.); este arquivo não é executado sozinho.
Roda SEMPRE em modo local (IndexedDB descartável): js/config.js é substituído por uma
configuração vazia durante o teste, então nenhum dado vai para o Supabase real.

Uso:  import e2e as T  (dentro de outro teste, em tests/)
"""
import base64, http.server, socketserver, threading, os, sys, functools, json
from playwright.sync_api import sync_playwright, expect

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765
PAGE = os.environ.get("RH_PAGE", "index.html")   # RH_PAGE=dist/ronda-hospitalar-teste.html testa o arquivo único
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
errors, results, blocked = [], [], []

def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("  OK   " if cond else "  FAIL ") + name + (f"  -> {extra}" if (extra and not cond) else ""))

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Quiet, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORT), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def new_ctx(browser, **kw):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, **kw)
    # configuração vazia => modo local; bloqueia fontes externas
    ctx.route("**/js/config.js*", lambda r: r.fulfill(body="window.RONDA_CONFIG={supabaseUrl:'',supabaseKey:''};", content_type="application/javascript"))
    ctx.route("**/*.supabase.co/**", lambda r: (blocked.append(r.request.url), r.abort()))  # trava: nunca tocar o banco real
    ctx.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    ctx.route("**/fonts.gstatic.com/**", lambda r: r.abort())
    return ctx

def attach_errors(page, tag):
    page.on("pageerror", lambda e: errors.append(f"[{tag}] pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"[{tag}] console.error: {m.text}") if m.type == "error" else None)

def login(page, user, pw):
    page.fill("#lg-login", user); page.fill("#lg-senha", pw); page.click("#f-login button[type=submit]")
    page.wait_for_selector("#nav")

def logout(page):
    page.click("[data-act=logout]"); page.wait_for_selector("#f-login")

def nav_labels(page):
    return [b.inner_text().strip() for b in page.query_selector_all("#nav button")]

def open_cad(page, tab):
    page.click(f"#nav [data-p=cadastros]"); page.click(f"[data-act=cadTab][data-k={tab}]")

def goto_field(page, k):
    """Salas/equipamentos têm abas no modal: abre a aba que contém o campo."""
    panel = page.locator(f"[role=tabpanel]:has(#ff-{k})")
    if panel.count() and not panel.first.is_visible():
        page.click("#et-" + panel.first.get_attribute("id")[3:])

def add(page, tab, fill=None, select=None, checks=None, check_boxes=None):
    open_cad(page, tab)
    page.click("[data-act=newEnt]")
    for k, v in (fill or {}).items():
        goto_field(page, k)
        page.fill(f"#ff-{k}", str(v))
    for k, v in (select or {}).items():
        goto_field(page, k)
        page.select_option(f"#ff-{k}", label=v)
    for k in (checks or []):
        page.uncheck(f"#ff-{k}")
    for label in (check_boxes or []):
        page.locator("#salas-pick label.chk", has_text=label).locator("input").check()
    return page

def save(page):
    page.click("#f-ent button[type=submit]")
    page.wait_for_selector("#f-ent", state="detached", timeout=4000)

def st_R(page):
    return page.evaluate("RH.st.R")
