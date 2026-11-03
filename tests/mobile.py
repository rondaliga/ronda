import http.server, socketserver, threading, functools, sys
from playwright.sync_api import sync_playwright
ROOT=sys.argv[1]
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(("127.0.0.1",8793),functools.partial(Q,directory=ROOT)); threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[]
def ck(n,c,x=""): res.append(c); print(("  OK   " if c else "  FAIL ")+n+(f" -> {x}" if not c else ""))
STUB="""window.__calls=[];window.__back=null;
window.Capacitor={isNativePlatform:()=>true,Plugins:{
 Filesystem:{writeFile:async o=>{__calls.push(['write',o.path]);return {uri:'file:///cache/'+o.path}}},
 Share:{share:async o=>{__calls.push(['share',o.files[0]])}},
 App:{addListener:(e,f)=>{if(e==='backButton')window.__back=f},minimizeApp:()=>__calls.push(['min'])},
 StatusBar:{setStyle(){},setBackgroundColor(){}},SplashScreen:{hide(){}},
 RondaWifi:{getBssid:async()=>({valor:'aa:bb:cc:dd:ee:ff'})}}};"""
with sync_playwright() as p:
    b=p.chromium.launch()
    for android in (False,True):
        print("== Android simulado" if android else "== Celular (web)")
        ctx=b.new_context(viewport={"width":390,"height":780},is_mobile=True,has_touch=True)
        ctx.route("**/js/config.js*",lambda r:r.fulfill(body="window.RONDA_CONFIG={supabaseUrl:'',supabaseKey:''};",content_type="application/javascript"))
        if android: ctx.add_init_script(STUB)
        pg=ctx.new_page(); errs=[]
        pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
        pg.goto("http://127.0.0.1:8793/index.html"); pg.wait_for_selector("#f-setup")
        pg.fill("#st-n","Ana"); pg.fill("#st-l","admin"); pg.fill("#st-s","Senha@123"); pg.check("#st-d"); pg.click("#st-btn"); pg.wait_for_selector("#nav",timeout=30000)
        ck("tipo detectado", pg.evaluate("RH.native.tipo")==("android" if android else "web"))
        ck("barra inferior fixa visível", pg.evaluate("getComputedStyle(document.querySelector('#nav')).position")=="fixed")
        ck("labels curtos na barra", "NCs" in pg.inner_text("#nav"))
        pg.evaluate("RH.go('cadastros')"); pg.click("[data-act=cadTab][data-k=salas]")
        ck("células com data-label", pg.evaluate("document.querySelectorAll('td[data-label]').length")>10)
        pg.click("[data-act=newEnt]")
        pg.wait_for_timeout(450)
        ck("modal como folha (base)", pg.evaluate("(()=>{const r=document.querySelector('.mod').getBoundingClientRect();return Math.abs(r.bottom-innerHeight)<2&&r.width>=389})()"))
        ck("scroll do fundo travado", pg.evaluate("getComputedStyle(document.body).overflow")=="hidden")
        if android:
            pg.evaluate("__back()"); ck("Voltar fecha o modal", pg.evaluate("!document.querySelector('#modal').firstChild"))
            pg.evaluate("RH.go('cadastros')"); pg.click("[data-act=cadTab][data-k=hospital]")
            pg.click("[data-act=exportBackup]"); pg.wait_for_timeout(500)
            c=pg.evaluate("__calls"); ck("backup abre Compartilhar", any(x[0]=='share' for x in c) and any(x[0]=='write' and x[1].endswith('.json') for x in c), c)
            pg.evaluate("RH.go('historico')"); pg.click("tbody tr >> nth=0"); pg.wait_for_selector(".mod")
            pg.click("[data-act=printRonda]"); pg.wait_for_timeout(600)
            c=pg.evaluate("__calls"); ck("relatório vira arquivo .html compartilhável", any(x[0]=='write' and x[1].endswith('.html') for x in c), c)
            pg.evaluate("__back()")
            pg.evaluate("RH.go('painel')"); pg.evaluate("__calls.length=0"); pg.evaluate("__back()")
            ck("Voltar no Painel minimiza o app", pg.evaluate("__calls")==[['min']])
            r=pg.evaluate("RH.local.lerBssid()"); ck("BSSID via plugin nativo", r.get('ok') and r['valor']=='aa:bb:cc:dd:ee:ff', r)
        else:
            # ronda completa pelo celular
            pg.evaluate("RH.closeModal()"); pg.evaluate("RH.go('ronda')"); pg.click(".sala >> nth=0"); pg.wait_for_selector(".rhead")
            for bt in pg.query_selector_all(".seg button.c"): bt.click()
            n=pg.evaluate("document.querySelectorAll('.it').length")
            # temperatura exige foto: marcar NC no primeiro e inacessível nos de temperatura
            pg.evaluate("document.querySelectorAll('.it').forEach(e=>{if(/temperatura/i.test(e.textContent)){e.querySelector('.seg button.a').click()}})")
            pg.fill("textarea[data-ina=just] >> nth=0","Sala ocupada") if pg.query_selector("textarea[data-ina=just]") else None
            for t in pg.query_selector_all("textarea[data-ina=just]"): t.fill("Sala ocupada")
            pg.click("#btn-sub"); pg.wait_for_timeout(1200)
            ck("ronda finalizada no celular", pg.evaluate("!RH.st.R"), pg.inner_text("#toast") if pg.query_selector("#toast .toast") else "")
        ck("sem overflow horizontal", pg.evaluate("document.documentElement.scrollWidth<=innerWidth"))
        ck("sem erros no console", not errs, errs)
        ctx.close()
    # desktop mantém menu lateral
    ctx=b.new_context(viewport={"width":1280,"height":900}); ctx.route("**/js/config.js*",lambda r:r.fulfill(body="window.RONDA_CONFIG={supabaseUrl:'',supabaseKey:''};",content_type="application/javascript"))
    pg=ctx.new_page(); pg.goto("http://127.0.0.1:8793/index.html"); pg.wait_for_selector("#f-setup"); pg.fill("#st-n","Ana"); pg.fill("#st-l","admin"); pg.fill("#st-s","Senha@123"); pg.click("#st-btn"); pg.wait_for_selector("#nav")
    print("== Desktop")
    ck("menu lateral no desktop", pg.evaluate("getComputedStyle(document.querySelector('.side')).position")=="sticky" and pg.evaluate("getComputedStyle(document.querySelector('#nav')).position")!="fixed")
    ck("rótulos completos no desktop", "Não conformidades" in pg.inner_text("#nav"))
    b.close()
print(f"{sum(res)}/{len(res)} OK")
