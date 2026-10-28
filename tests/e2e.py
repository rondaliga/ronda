"""
Teste ponta a ponta (Playwright + Chromium) da Ronda Hospitalar.
Roda SEMPRE em modo local (IndexedDB descartável): js/config.js é substituído por uma
configuração vazia durante o teste, então nenhum dado vai para o Supabase real.

Uso:  python3 tests/e2e.py
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

def main():
    srv = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ================= CENÁRIO 1: fluxo completo =================
        print("\n== Cenário 1: configuração, acessos, ronda, NC e exclusão ==")
        ctx = new_ctx(browser); page = ctx.new_page(); attach_errors(page, "c1")
        page.goto(f"http://127.0.0.1:{PORT}/{PAGE}")
        page.wait_for_selector("#f-setup")
        check("primeiro acesso: dados de exemplo desmarcados por padrão", not page.is_checked("#st-d"))
        page.fill("#st-n", "Ana Admin"); page.fill("#st-l", "admin"); page.fill("#st-s", "Senha@123")
        page.click("#st-btn"); page.wait_for_selector("#nav")
        check("admin entra no Painel", page.inner_text("h1") == "Painel de controle")
        check("admin vê as 5 telas", nav_labels(page) == ["Painel", "Nova ronda", "Histórico", "Não conformidades", "Cadastros"], nav_labels(page))

        # usuários
        for nome, login_, role in [("Gil Gestor", "gestor", "Gestor"), ("Iara Inspetora", "iara", "Inspetor"), ("Ivo Inspetor", "ivo", "Inspetor")]:
            add(page, "users", fill={"nome": nome, "login": login_, "senha": "Senha@123"}, select={"role": role}); save(page)
        # salas
        add(page, "salas", fill={"nome": "UTI 01", "setor": "UTI"}); save(page)
        add(page, "salas", fill={"nome": "UTI 02", "setor": "UTI"}); save(page)
        add(page, "salas", fill={"nome": "Farmácia", "setor": "Farmácia"}); save(page)
        # checklists
        open_cad(page, "checklists"); page.click("[data-act=newEnt]")
        page.fill("#ff-nome", "Sala padrão"); page.select_option("#ff-tipo", label="Sala")
        page.fill("[data-itx='0']", "Limpeza adequada"); page.click("[data-act=itAdd]"); page.fill("[data-itx='1']", "Extintor válido"); save(page)
        open_cad(page, "checklists"); page.click("[data-act=newEnt]")
        page.fill("#ff-nome", "Equipamento padrão"); page.select_option("#ff-tipo", label="Equipamento")
        page.fill("[data-itx='0']", "Alarme funcionando"); save(page)
        # vincula checklist às salas
        open_cad(page, "salas")
        for nome in ["UTI 01", "UTI 02", "Farmácia"]:
            page.click(f"tr[data-act=editEnt]:has-text('{nome}')")
            page.fill("[data-itx='0']", "Limpeza adequada"); save(page)
            open_cad(page, "salas")
        # equipamento na UTI 01
        add(page, "equipamentos", fill={"nome": "Monitor", "setor": "UTI"}, select={"checklistId": "Equipamento padrão"}); save(page)
        # tipos de NC com orientação
        add(page, "tiposNC", fill={"nome": "Alarme inoperante", "orient": "Testar, reparar e validar antes de reutilizar."}, select={"sev": "4 · Crítica"}); save(page)
        add(page, "tiposNC", fill={"nome": "Higienização deficiente", "orient": "Refazer a limpeza terminal."}); save(page)
        open_cad(page, "tiposNC")
        check("Tipos de NC exibem a orientação na tabela", "Testar, reparar e validar" in page.inner_text("table"))

        # rondas (cadastro "Nome da ronda")
        add(page, "modelos", fill={"nome": "Ronda UTI"}, check_boxes=["UTI 01", "UTI 02", "Monitor"])
        opts = [o.inner_text() for o in page.query_selector_all("#ff-responsavelId option")]
        check("Ronda: opção 'Todos' existe", any(o.strip()=="Todos" for o in opts), opts)
        page.select_option("#ff-responsavelId", label=[o for o in opts if o.startswith("Iara")][0])
        save(page)
        add(page, "modelos", fill={"nome": "Ronda Farmácia"}, check_boxes=["Farmácia"]); save(page)  # sem responsável
        open_cad(page, "modelos")
        tbl = page.inner_text("table")
        check("Cadastro de rondas lista as duas rondas", "Ronda UTI" in tbl and "Ronda Farmácia" in tbl)
        check("Acesso exibido: somente a Iara / todos os inspetores", "Somente Iara Inspetora" in tbl and "Todos os inspetores" in tbl, tbl)

        # validação: ronda sem sala
        open_cad(page, "modelos"); page.click("[data-act=newEnt]"); page.fill("#ff-nome", "Vazia"); page.click("#f-ent button[type=submit]")
        check("Ronda sem sala é recusada", "ao menos uma sala" in page.inner_text("#ent-err"))
        page.click("[data-act=closeModal]")

        # admin só vê rondas sem responsável em Nova ronda
        page.click("#nav [data-p=ronda]")
        cards = [c.inner_text() for c in page.query_selector_all("[data-act=pickRonda]")]
        check("Administrador vê todas as rondas (com e sem responsável)", len(cards) == 2, cards)
        logout(page)

        # ---- inspetora Iara
        login(page, "iara", "Senha@123")
        check("Inspetor vê 'Nova ronda' e 'Histórico' no menu", nav_labels(page) == ["Nova ronda", "Histórico"], nav_labels(page))
        check("Inspetor cai direto em Nova ronda", page.inner_text("h1") == "Nova ronda")
        page.evaluate("RH.go('painel');RH.go('cadastros');RH.go('ncs')")
        check("Inspetor não consegue abrir outras telas", page.inner_text("h1") == "Nova ronda")
        cards = [c.inner_text() for c in page.query_selector_all("[data-act=pickRonda]")]
        check("Iara vê as duas rondas (a sua e a sem responsável)", len(cards) == 2, cards)
        page.click("[data-act=pickRonda]:has-text('Ronda UTI')")
        page.wait_for_selector(".rhead")
        check("Ronda mostra as 2 salas e o bloco de equipamentos", page.locator(".sala-h").count() == 3 and page.locator(".tag-s").count() == 2 and page.locator(".tag-e").count() == 1)
        check("Cartões dizem Sala/Equipamento e não usam mais 'Ambiente'", "Ambiente" not in page.inner_text("#view") if page.query_selector("#view") else "Ambiente ·" not in page.inner_text("body"))
        check("Progresso inicial", "0 de" in page.inner_text("#prog-t"))
        # tenta finalizar vazio
        page.click("#btn-sub")
        check("Finalizar sem responder é bloqueado", "sem resposta" in page.inner_text("#toast"))
        # tudo conforme em todos os grupos
        for b in page.query_selector_all("[data-act=allc]"): b.click()
        # marca uma NC no monitor
        item = page.locator(".it", has_text="Alarme funcionando")
        item.locator("button.n").click()
        check("Sem tipo selecionado não há orientação", page.locator(".orient").count() == 0)
        item = page.locator(".it", has_text="Alarme funcionando")
        item.locator("select[data-nc=tipoId]").select_option(label="Alarme inoperante")
        item = page.locator(".it", has_text="Alarme funcionando")
        check("Orientação do tipo aparece ao inspetor", "Testar, reparar e validar" in item.locator(".orient").inner_text())
        check("Severidade preenchida pelo tipo (Crítica)", item.locator("select[data-nc=sev]").input_value() == "4")
        page.click("#btn-sub")
        check("NC sem descrição é bloqueada", "tipo e a descrição" in page.inner_text("#toast"))
        item = page.locator(".it", has_text="Alarme funcionando")
        item.locator("textarea").fill("Alarme não soa no teste.")
        item.locator("input[data-nc-foto]").set_input_files({"name": "f.png", "mimeType": "image/png", "buffer": PNG})
        page.wait_for_selector(".ncp img")
        check("Foto anexada", page.locator(".ncp img").count() == 1)
        check("Descrição preservada após anexar foto", page.locator(".it", has_text="Alarme funcionando").locator("textarea").input_value() == "Alarme não soa no teste.")
        check("Painel mostra 1 NC", "1 não conformidade" in page.inner_text("#prog-t"))
        page.click("#btn-sub")
        page.wait_for_selector(".top h1:has-text('Nova ronda')")
        check("Após finalizar, inspetor volta para Nova ronda", page.inner_text("h1") == "Nova ronda")
        ex = page.evaluate("RH.execs(RH.S.rondas).map(e=>({n:e.nome,salas:e.docs.length,nc:e.nc,c:e.c}))")
        check("Execução única com 2 salas", len(ex) == 1 and ex[0]["salas"] == 3 and ex[0]["nc"] == 1, ex)
        ncs = page.evaluate("RH.S.ncs.map(n=>({m:n.modeloNome,s:n.salaNome,e:n.eqNome,sev:n.sev,f:!!n.fotoId}))")
        check("NC gerada com ronda, sala, equipamento e foto", ncs == [{"m": "Ronda UTI", "s": "Equipamentos", "e": "Monitor", "sev": 4, "f": True}], ncs)
        logout(page)

        # ---- inspetor Ivo
        login(page, "ivo", "Senha@123")
        cards = [c.inner_text() for c in page.query_selector_all("[data-act=pickRonda]")]
        check("Ivo vê só a ronda sem responsável", len(cards) == 1 and "Ronda Farmácia" in cards[0], cards)
        page.evaluate("RH.ACT.pickRonda({dataset:{id:RH.S.modelos.find(m=>m.nome==='Ronda UTI').id}})")
        check("Ivo não consegue iniciar ronda de outro responsável", st_R(page) is None)
        logout(page)

        # ---- gestor
        login(page, "gestor", "Senha@123")
        check("Gestor não vê Cadastros", nav_labels(page) == ["Painel", "Nova ronda", "Histórico", "Não conformidades"], nav_labels(page))
        page.click("#nav [data-p=historico]")
        check("Histórico: 1 linha (execução) com 2 salas", page.locator("tbody tr").count() == 1 and "2 salas · 1 equipamento" in page.inner_text("tbody"))
        page.click("tbody tr"); page.wait_for_selector(".mod")
        check("Detalhe da ronda lista as duas salas", "UTI 01" in page.inner_text(".mod") and "UTI 02" in page.inner_text(".mod"))
        page.click(".mh [data-act=closeModal]")
        page.click("#nav [data-p=ncs]")
        check("NC aparece na lista com a ronda", "Ronda UTI" in page.inner_text("#nc-list"))
        page.click("[data-act=ncOpen]"); page.wait_for_selector("#f-nc")
        check("Detalhe da NC mostra a orientação", "Testar, reparar e validar" in page.inner_text(".orient"))
        page.wait_for_selector("#nc-foto img.big-img:not([style])", timeout=3000)
        # tratar NC
        page.select_option("select[name=status]", "resolvida")
        page.click("#f-nc button[type=submit]")
        check("Resolver sem ação corretiva é bloqueado", "ação corretiva" in page.inner_text("#toast") and page.locator("#f-nc").count() == 1)
        page.fill("textarea[name=resolucao]", "Alarme trocado.")
        page.click("#f-nc button[type=submit]"); page.wait_for_selector("#f-nc", state="detached")
        check("NC resolvida salva", page.evaluate("RH.S.ncs[0].status") == "resolvida" and page.evaluate("!!RH.S.ncs[0].resolvidoEm"))
        # excluir
        page.click(".chip:has-text('Todas')")
        foto_id = page.evaluate("RH.S.ncs[0].fotoId")
        page.click("[data-act=ncOpen]"); page.wait_for_selector("#f-nc")
        page.click("#btn-delnc")
        check("Exclusão pede confirmação (1º toque não exclui)", page.evaluate("RH.S.ncs.length") == 1 and "Confirmar" in page.inner_text("#btn-delnc"))
        page.click("#btn-delnc"); page.wait_for_selector("#f-nc", state="detached")
        check("NC excluída", page.evaluate("RH.S.ncs.length") == 0)
        check("Foto da NC excluída junto", page.evaluate("fid=>RH.st.db.doc('fotos/'+fid).get().then(s=>s.exists)", foto_id) is False)
        page.wait_for_function("document.querySelector('#nc-list').innerText.includes('Nenhuma não conformidade')", timeout=3000)
        check("Lista atualiza sozinha após exclusão", True)
        page.click("#nav [data-p=painel]")
        check("Painel renderiza (gestor)", page.locator("#ch-line svg, #ch-line .empty").count() == 1)
        logout(page)
        ctx.close()

        # ================= CENÁRIO 2: dados de exemplo =================
        print("\n== Cenário 2: dados de exemplo, painel e remoção ==")
        ctx = new_ctx(browser); page = ctx.new_page(); attach_errors(page, "c2")
        page.goto(f"http://127.0.0.1:{PORT}/{PAGE}"); page.wait_for_selector("#f-setup")
        page.fill("#st-n", "Ana"); page.fill("#st-l", "admin"); page.fill("#st-s", "Senha@123"); page.check("#st-d")
        page.click("#st-btn"); page.wait_for_selector("#nav h1, h1:has-text('Painel')", timeout=30000)
        page.wait_for_selector("#ch-line svg", timeout=10000)
        check("Painel com dados de exemplo", page.locator(".kpi").count() == 6 and page.locator("#ch-line svg").count() == 1)
        check("KPI 'Rondas em atraso' presente", "Rondas em atraso" in page.inner_text(".kpis"))
        page.click("#nav [data-p=historico]")
        check("Histórico agrupa por ronda", "Ronda UTI · plantão diurno" in page.inner_text("tbody") and "3 salas" in page.inner_text("tbody"))
        page.click("#nav [data-p=ronda]")
        n_cards = page.locator("[data-act=pickRonda]").count()
        check("Administrador vê todas as rondas do exemplo (5)", n_cards == 5, n_cards)
        page.click("#nav [data-p=ncs]")
        check("NCs de exemplo listadas", page.locator(".nc").count() > 10)
        page.click("#nav [data-p=cadastros]"); page.click("[data-act=cadTab][data-k=hospital]")
        page.click("[data-act=wipeDemo]"); page.wait_for_selector("[data-act=seedDemo]", timeout=15000)
        check("Dados de exemplo removidos (inclusive rondas)", page.evaluate("RH.S.modelos.length+RH.S.rondas.length+RH.S.ncs.length+RH.S.salas.length") == 0)
        ctx.close()

        # ================= CENÁRIO 3: mobile =================
        print("\n== Cenário 3: celular, persistência e exclusão de usuário/ronda ==")
        ctx = browser.new_context(viewport={"width": 390, "height": 800})
        ctx.route("**/js/config.js*", lambda r: r.fulfill(body="window.RONDA_CONFIG={};", content_type="application/javascript"))
        ctx.route("**/fonts.g*/**", lambda r: r.abort())
        ctx.route("**/*.supabase.co/**", lambda r: (blocked.append(r.request.url), r.abort()))
        page = ctx.new_page(); attach_errors(page, "c3")
        page.goto(f"http://127.0.0.1:{PORT}/{PAGE}"); page.wait_for_selector("#f-setup")
        page.fill("#st-n", "Ana"); page.fill("#st-l", "admin"); page.fill("#st-s", "Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        overflow = page.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth")
        check("Sem rolagem horizontal no celular", not overflow)
        add(page, "users", fill={"nome": "Bia", "login": "bia", "senha": "Senha@123"}, select={"role": "Inspetor"}); save(page)
        add(page, "salas", fill={"nome": "Sala X", "setor": "S"}); save(page)
        add(page, "modelos", fill={"nome": "R1"}, check_boxes=["Sala X"]); page.select_option("#ff-responsavelId", label="Bia"); save(page)
        # excluir usuário responsável é bloqueado
        open_cad(page, "users"); page.click("tr[data-act=editEnt]:has-text('Bia')"); page.click("#btn-del")
        check("Usuário responsável por ronda não pode ser excluído", "responsável por rondas" in page.inner_text("#ent-err"))
        page.click("[data-act=closeModal]")
        # desativar usuário responsável é bloqueado
        page.click("tr[data-act=editEnt]:has-text('Bia')"); page.uncheck("#ff-ativo"); page.click("#f-ent button[type=submit]")
        check("Usuário responsável por ronda não pode ser desativado", "responsável por 1 ronda" in page.inner_text("#ent-err"))
        page.click("[data-act=closeModal]")
        # sala em ronda não pode ser excluída
        open_cad(page, "salas"); page.click("tr[data-act=editEnt]"); page.click("#btn-del")
        check("Sala pertencente a ronda não pode ser excluída", "faz parte de uma ronda" in page.inner_text("#ent-err"))
        page.click("[data-act=closeModal]")
        # persistência após recarregar (sessão e dados)
        page.reload(); page.wait_for_selector("#nav")
        check("Sessão e dados persistem após recarregar", page.evaluate("RH.S.modelos.length") == 1)
        # excluir ronda
        open_cad(page, "modelos"); page.click("tr[data-act=editEnt]"); page.click("#btn-del"); page.click("#btn-del"); page.wait_for_selector("#f-ent", state="detached")
        check("Ronda excluída", page.evaluate("RH.S.modelos.length") == 0)
        ctx.close()

        # ================= CENÁRIO 4: robustez (falha ao salvar, fuso horário, permissões) =================
        print("\n== Cenário 4: salvamento com falha, data local, permissões e saída ==")
        ctx = new_ctx(browser, timezone_id="America/Fortaleza"); page = ctx.new_page(); attach_errors(page, "c4")
        page.goto(f"http://127.0.0.1:{PORT}/{PAGE}"); page.wait_for_selector("#f-setup")
        page.fill("#st-n", "Ana"); page.fill("#st-l", "admin"); page.fill("#st-s", "Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        page.evaluate("""(async()=>{
          const P=RH.put;
          await P('users','uI',{nome:'Ines',login:'ines',role:'inspetor',ativo:true,salt:'s',hash:await RH.hash('Senha@123','s')});
          await P('checklists','c1',{nome:'Amb',tipo:'sala',itens:[{id:'i1',t:'Limpo'},{id:'i2',t:'Seguro'}]});
          await P('salas','s1',{nome:'Sala 1',setor:'A',checklistId:'c1',ativo:true});
          await P('salas','s2',{nome:'Sala 2',setor:'A',checklistId:'c1',ativo:true});
          await P('tiposNC','t1',{nome:'Falha',sev:3,orient:'Chamar a manutenção.'});
          await P('modelos','m1',{nome:'Ronda A',salaIds:['s1','s2'],responsavelId:'',freq:24,ativo:true});
        })()""")
        check("data local (fuso de Fortaleza) não adianta o dia", page.evaluate("RH.ymd(Date.parse('2026-10-08T02:30:00Z'))") == "2026-10-07")
        logout(page); login(page, "ines", "Senha@123")
        page.click("[data-act=pickRonda]"); page.wait_for_selector(".rhead")
        for b in page.query_selector_all("[data-act=allc]"): b.click()
        item = page.locator(".sala-h:has-text('Sala 2') ~ .grp .it", has_text="Seguro")
        item.locator("button.n").click()
        page.locator(".it select[data-nc=tipoId]").select_option(label="Falha")
        page.locator(".it textarea").fill("Porta quebrada.")
        # sair com ronda em andamento pede confirmação
        page.click("[data-act=logout]")
        check("Sair com ronda em andamento pede confirmação", page.locator("#f-login").count() == 0 and "em andamento" in page.inner_text("#toast"))
        # 1ª tentativa de salvar falha na NC (depois de gravar a sala 1 e a sala 2)
        page.evaluate("""(()=>{const o=RH.put;RH.put=(c,i,d)=>{if(c==='ncs'&&!window.__f){window.__f=1;return Promise.reject(new Error('falha simulada'))}return o(c,i,d)}})()""")
        page.click("#btn-sub")
        page.wait_for_function("document.querySelector('#toast').innerText.includes('Não foi possível salvar')", timeout=4000)
        check("Falha ao salvar avisa e mantém a ronda aberta", page.evaluate("!!RH.st.R") and page.locator(".rhead").count() == 1)
        page.click("#btn-sub"); page.wait_for_selector(".rhead", state="detached", timeout=5000)
        check("Nova tentativa não duplica registros", page.evaluate("RH.S.rondas.length") == 2 and page.evaluate("RH.S.ncs.length") == 1,
              page.evaluate("[RH.S.rondas.length,RH.S.ncs.length]"))
        check("As duas salas pertencem à mesma execução", page.evaluate("new Set(RH.S.rondas.map(r=>r.execId)).size") == 1)
        check("NC guarda a orientação do tipo", page.evaluate("RH.S.ncs[0].orient") == "Chamar a manutenção.")
        # inspetor não consegue excluir NC nem editando via console
        page.evaluate("RH.ACT.delNC({dataset:{id:RH.S.ncs[0].id,armed:'1'},textContent:''})")
        page.wait_for_timeout(300)
        check("Inspetor não consegue excluir NC", page.evaluate("RH.S.ncs.length") == 1)
        logout(page)
        # prazo da NC aparece no dia local, sem adiantar por causa do UTC
        login(page, "admin", "Senha@123")
        page.evaluate("RH.upd('ncs',RH.S.ncs[0].id,{prazo:Date.parse('2026-10-08T02:30:00Z')})")
        page.click("#nav [data-p=ncs]"); page.click("[data-act=ncOpen]"); page.wait_for_selector("#f-nc")
        check("Prazo da NC mostra o dia local (07/10), não o do UTC", page.input_value("input[name=prazo]") == "2026-10-07", page.input_value("input[name=prazo]"))

        # ---- excluir ronda realizada (Histórico)
        page.evaluate("RH.ACT.delRonda({dataset:{id:RH.S.rondas[0].execId,armed:'1'},textContent:''})")  # só para provar o fluxo abaixo
        page.wait_for_timeout(300)
        check("Admin pode excluir ronda (fluxo direto)", page.evaluate("RH.S.rondas.length") == 0)
        page.evaluate("""(async()=>{ // recria uma execução com 1 NC e uma sem NC para testar as duas opções
          const base={ts:Date.now(),salaId:'s1',salaNome:'Sala 1',setor:'A',inspNome:'Ines',c:1,nc:0,na:0,pct:100,itens:[]};
          await RH.put('rondas','rA1',{...base,execId:'xA',modeloId:'m1',modeloNome:'Ronda A',c:0,nc:1,pct:0});
          await RH.put('rondas','rA2',{...base,execId:'xA',salaId:'s2',salaNome:'Sala 2',modeloId:'m1',modeloNome:'Ronda A'});
          await RH.put('ncs','nA',{ts:base.ts,rondaId:'rA1',execId:'xA',salaNome:'Sala 1',sev:2,status:'aberta',desc:'x',tipoNome:'Falha'});
          await RH.put('rondas','rB1',{...base,execId:'xB',modeloId:'m1',modeloNome:'Ronda A',ts:base.ts-1000});
        })()""")
        page.click("#nav [data-p=historico]")
        page.locator("tbody tr").first.click(); page.wait_for_selector("#btn-delronda")
        check("Detalhe oferece excluir ronda; apagar as NCs vem desmarcado (padrão seguro)", not page.is_checked("#del-ncs") and "1 não conformidade" in page.inner_text(".mf"))
        page.check("#del-ncs")
        page.click("#btn-delronda")
        check("Excluir ronda pede confirmação (1º toque não exclui)", page.evaluate("RH.S.rondas.length") == 3 and "Confirmar" in page.inner_text("#btn-delronda"))
        page.click("#btn-delronda"); page.wait_for_selector(".mod", state="detached")
        check("Ronda excluída com todas as salas e a NC dela", page.evaluate("[RH.S.rondas.length,RH.S.ncs.some(n=>n.id==='nA')]") == [1, False])
        page.evaluate("RH.put('ncs','nB',{ts:Date.now(),rondaId:'rB1',execId:'xB',salaNome:'Sala 1',sev:2,status:'aberta',desc:'y'})")
        page.click("#nav [data-p=painel]"); page.click("#nav [data-p=historico]")
        page.locator("tbody tr").first.click(); page.wait_for_selector("#btn-delronda")
        page.uncheck("#del-ncs"); page.click("#btn-delronda"); page.click("#btn-delronda"); page.wait_for_selector(".mod", state="detached")
        check("Desmarcando a opção, as NCs são mantidas", page.evaluate("[RH.S.rondas.length,RH.S.ncs.some(n=>n.id==='nB')]") == [0, True])
        logout(page)
        # gestor também vê o botão; inspetor não consegue excluir por console
        page.evaluate("RH.put('rondas','rC',{ts:Date.now(),execId:'xC',modeloNome:'C',salaId:'s1',salaNome:'S',inspNome:'i',c:1,nc:0,na:0,pct:100,itens:[]})")
        login(page, "ines", "Senha@123")
        page.evaluate("RH.ACT.delRonda({dataset:{id:'xC',armed:'1'},textContent:''})"); page.wait_for_timeout(300)
        check("Inspetor não consegue excluir ronda", page.evaluate("RH.S.rondas.length") == 1)
        # ---- atualização automática não rouba o foco de quem está digitando
        logout(page); login(page, "admin", "Senha@123")
        page.click("#nav [data-p=ncs]"); page.click("#nc-q"); page.keyboard.type("abc")
        page.evaluate("RH.put('config','main',{...RH.S.cfg,meta:90})"); page.wait_for_timeout(700)
        check("Dados mudando em outro aparelho não tiram o foco do campo de busca", page.evaluate("document.activeElement.id") == "nc-q" and page.input_value("#nc-q") == "abc")
        ctx.close()

        # ================= CENÁRIO 5: senha forte, setores, checklist, orientação, agenda =================
        print("\n== Cenário 5: regras de senha, setores, checklist, orientação e agenda ==")
        ctx = new_ctx(browser); page = ctx.new_page(); attach_errors(page, "c5")
        page.goto(f"http://127.0.0.1:{PORT}/{PAGE}")
        page.wait_for_selector("#f-setup")
        for pw, frag in [("abc123", "8 caracteres"), ("abcdefgh1", "símbolo")]:
            page.fill("#st-n", "Ana"); page.fill("#st-l", "admin"); page.fill("#st-s", pw); page.click("#st-btn")
            page.wait_for_timeout(250)
            check(f"Primeiro acesso recusa senha '{pw}'", page.query_selector("#nav") is None and frag in page.inner_text("body"), page.inner_text("body")[:200])
        page.fill("#st-s", "Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        check("Primeiro acesso aceita senha forte", True)
        check("RH.checkSenha: regras", page.evaluate("['Ab@1','abcdefgh','abcdefg!','Abcdefg 1','abcdefgh!'].map(x=>!!RH.checkSenha(x))") == [True, True, False, True, False])
        check("RH.senhaForte gera senha válida (50x)", page.evaluate("Array.from({length:50},()=>RH.checkSenha(RH.senhaForte())).every(x=>!x)"))

        # usuário: senha fraca recusada
        open_cad(page, "users"); page.click("[data-act=newEnt]")
        page.fill("#ff-nome", "Fraco"); page.fill("#ff-login", "fraco"); page.fill("#ff-senha", "senhafraca"); page.click("#f-ent button[type=submit]")
        check("Cadastro de usuário recusa senha sem símbolo", "símbolo" in page.inner_text("#ent-err"), page.inner_text("#ent-err"))
        page.fill("#ff-senha", "Ab@1"); page.click("#f-ent button[type=submit]")
        check("Cadastro de usuário recusa senha curta", "8 caracteres" in page.inner_text("#ent-err"))
        page.click("[data-act=closeModal]")
        add(page, "users", fill={"nome": "Bia", "login": "bia", "senha": "Boa#Senha1"}, select={"role": "Inspetor"}); save(page)

        # dados para setores/agenda
        for n, s in [("UTI 01", "UTI"), ("UTI 02", "UTI"), ("UTI 03", "UTI"), ("Farmácia", "Farmácia")]:
            add(page, "salas", fill={"nome": n, "setor": s}); save(page)
        # checklist "Sala e equipamento"
        open_cad(page, "checklists"); page.click("[data-act=newEnt]")
        labs = [o.inner_text() for o in page.query_selector_all("#ff-tipo option")]
        check("Checklist 'Aplica-se a': Sala / Equipamento / Sala e equipamento", labs == ["Sala", "Equipamento", "Sala e equipamento"], labs)
        page.fill("#ff-nome", "Misto"); page.select_option("#ff-tipo", label="Sala e equipamento"); page.fill("[data-itx='0']", "Item"); save(page)
        open_cad(page, "checklists"); page.click("[data-act=newEnt]")
        page.fill("#ff-nome", "Só sala"); page.select_option("#ff-tipo", label="Sala"); page.fill("[data-itx='0']", "Item"); save(page)
        open_cad(page, "checklists")
        check("Rótulo 'Ambiente (sala)' não existe mais", "Ambiente (sala)" not in page.inner_text("body"))

        # tipos de NC: orientação automática
        open_cad(page, "tiposNC"); page.click("[data-act=newEnt]")
        page.fill("#ff-nome", "Falta de higienização das mãos")
        o1 = page.input_value("#ff-orient")
        check("Orientação gerada automaticamente ao digitar o nome", len(o1) > 30 and "mãos" in o1.lower(), o1)
        page.fill("#ff-orient", "Texto do gestor.")
        page.fill("#ff-nome", "Falta de higienização das mãos 2")
        check("Orientação editada pelo usuário não é sobrescrita", page.input_value("#ff-orient") == "Texto do gestor.")
        page.click("[data-act=genOrient]")
        check("Botão regenera a sugestão", page.input_value("#ff-orient") != "Texto do gestor." and len(page.input_value("#ff-orient")) > 30)
        page.fill("#ff-orient", ""); save(page)
        open_cad(page, "tiposNC")
        check("Ao salvar com orientação vazia, a padrão é gravada", all(t.get("orient") for t in page.evaluate("RH.S.tiposNC")))
        o2 = page.evaluate("RH.sugerirOrientacao('Algo totalmente inusitado')")
        check("Nome desconhecido gera orientação genérica objetiva", "Algo totalmente inusitado" in o2)

        # rondas: setores únicos + agenda
        open_cad(page, "modelos"); page.click("[data-act=newEnt]")
        page.fill("#ff-nome", "Ronda Geral")
        check("Agenda: padrão segunda a sexta marcada", page.evaluate("[...document.querySelectorAll('[data-dia]')].map(c=>c.checked)") == [False, True, True, True, True, True, False])
        check("Agenda: rótulo 'Periodicidade (horas)' removido", page.query_selector("#ff-freq") is None and "Periodicidade (horas)" not in page.inner_text("#f-ent"))
        page.locator("[data-setor-all]").first.check()
        n_marc = page.evaluate("[...document.querySelectorAll('[data-sala]')].filter(c=>c.checked).length")
        check("Marcar o setor marca todas as salas dele", n_marc in (1, 3), n_marc)
        page.locator("#salas-pick label.chk", has_text="Farmácia").locator("input").check()
        page.locator("#salas-pick label.chk", has_text="UTI 01").locator("input").check()
        # sem nenhum dia
        page.click("[data-act=agDias][data-v=todos]")
        page.evaluate("document.querySelectorAll('[data-dia]').forEach(c=>c.checked=false)")
        page.click("#f-ent button[type=submit]")
        check("Agenda sem dia é recusada", "dia da semana" in page.inner_text("#ent-err"), page.inner_text("#ent-err"))
        page.click("[data-act=agDias][data-v=uteis]")
        page.click("[data-act=agAddH]"); page.locator("[data-hx]").last.fill("20:00")
        page.fill("[data-hx='0']", "08:00")
        page.click("[data-act=agAddH]")
        page.click("#f-ent button[type=submit]")
        check("Horário vazio é recusado", "horário" in page.inner_text("#ent-err").lower() or page.query_selector("#f-ent") is not None)
        page.locator("[data-hx]").last.fill("12:00"); save(page)
        m = page.evaluate("RH.S.modelos.find(x=>x.nome==='Ronda Geral')")
        check("Agenda gravada (dias úteis e 3 horários)", m["dias"] == [1, 2, 3, 4, 5] and m["horarios"] == ["08:00", "12:00", "20:00"] and m.get("agendaDesde"), m)
        open_cad(page, "modelos")
        tbl = page.inner_text("table")
        check("Tabela mostra dias e horários", "Seg a Sex" in tbl and "08:00" in tbl, tbl)
        linhas = [l for l in tbl.split("\n") if "Ronda Geral" in l or "UTI" in l or "Farmácia" in l]
        rowtxt = page.locator("tr[data-act=editEnt]", has_text="Ronda Geral").inner_text()
        check("Tabela de rondas mostra cada setor uma única vez (sem nomes de sala)", rowtxt.count("UTI") == 1 and "UTI 01" not in rowtxt and "Farmácia" in rowtxt, rowtxt)
        # reabrir mantém o agendamento
        page.click("tr[data-act=editEnt]:has-text('Ronda Geral')")
        check("Editar ronda carrega dias e horários", page.evaluate("[...document.querySelectorAll('[data-dia]:checked')].map(c=>+c.value)") == [1, 2, 3, 4, 5] and page.locator("[data-hx]").count() == 3)
        page.click("[data-act=closeModal]")

        # regra de atraso (determinística)
        T = lambda s: f"new Date('{s}').getTime()"
        r = page.evaluate("""()=>{const a=RH.agenda,at=(iso)=>new Date(iso).getTime();
          const m={dias:[1,2,3,4,5],horarios:['08:00'],agendaDesde:at('2026-10-01T00:00:00')};
          const ev=(now,last)=>a.atrasada(m,last==null?null:at(last),at(now));
          return [ev('2026-10-07T07:30:00','2026-10-06T08:00:00'),   // antes do horário, ontem feito: não atrasada
                  ev('2026-10-07T09:30:00',null),   // passou 1h30 sem execução: atrasada
                  ev('2026-10-07T09:30:00','2026-10-07T07:30:00'), // feita 30min antes: ok
                  ev('2026-10-07T09:30:00','2026-10-06T08:00:00'), // só a de ontem: atrasada
                  ev('2026-10-10T12:00:00','2026-10-09T08:10:00'), // sábado: último slot é sexta, feito
                  a.atrasada({dias:[1],horarios:['08:00'],agendaDesde:at('2026-10-09T00:00:00')},null,at('2026-10-10T12:00:00')), // slots antes de agendaDesde ignorados
                  a.atrasada({freq:24},at('2026-10-05T08:00:00'),at('2026-10-07T08:00:00')) // legado por horas
                ]}""")
        check("Atraso por dia/horário (7 casos)", r == [False, True, False, True, False, False, True], r)
        check("Resumo da agenda legível", page.evaluate("RH.agenda.resumo({dias:[1,2,3,4,5],horarios:['08:00','20:00']})") == "Seg a Sex · 08:00, 20:00", page.evaluate("RH.agenda.resumo({dias:[1,2,3,4,5],horarios:['08:00','20:00']})"))

        # Nova ronda mostra agenda e setores
        page.click("#nav [data-p=ronda]")
        card = page.inner_text("body")
        check("Nova ronda mostra agenda e setores", "Seg a Sex" in card and "UTI" in card and "Farmácia" in card)

        # alterar a própria senha
        page.click("[data-act=minhaSenha]"); page.wait_for_selector("#f-pw")
        def tenta(a, n, c):
            page.fill("#pw-atual", a); page.fill("#pw-nova", n); page.fill("#pw-conf", c); page.click("#f-pw button[type=submit]"); page.wait_for_timeout(500)
            return page.inner_text("#pw-err")
        check("Trocar senha: atual errada é recusada", "atual" in tenta("errada!!", "Nova#Senha9", "Nova#Senha9").lower())
        check("Trocar senha: nova fraca é recusada", "símbolo" in tenta("Senha@123", "novasenha1", "novasenha1"))
        check("Trocar senha: confirmação diferente é recusada", "conf" in tenta("Senha@123", "Nova#Senha9", "Nova#Senha8").lower() or "iguais" in page.inner_text("#pw-err").lower())
        check("Trocar senha: nova igual à atual é recusada", tenta("Senha@123", "Senha@123", "Senha@123") != "")
        page.fill("#pw-atual", "Senha@123"); page.fill("#pw-nova", "Nova#Senha9"); page.fill("#pw-conf", "Nova#Senha9"); page.click("#f-pw button[type=submit]"); page.wait_for_timeout(600)
        check("Trocar senha: sucesso informado e janela fechada", "alterada" in page.inner_text("#toast").lower() and page.query_selector("#f-pw") is None)
        logout(page)
        page.fill("#lg-login", "admin"); page.fill("#lg-senha", "Senha@123"); page.click("#f-login button[type=submit]"); page.wait_for_timeout(500)
        check("Senha antiga deixa de funcionar", page.query_selector("#nav") is None)
        login(page, "admin", "Nova#Senha9")
        check("Entra com a senha nova", True)
        # inspetor também tem o botão
        logout(page); login(page, "bia", "Boa#Senha1")
        check("Inspetor também vê 'alterar minha senha'", page.query_selector("[data-act=minhaSenha]") is not None)
        ctx.close()

        # ================= CENÁRIO 6: setor em equipamentos, seletor, duplicar, minimizar =================
        print("\n== Cenário 6: setor/equipamentos, duplicar cadastros e minimizar painel ==")
        ctx = new_ctx(browser); page = ctx.new_page(); attach_errors(page, "c6")
        page.goto(f"http://127.0.0.1:{PORT}/{PAGE}")
        page.wait_for_selector("#f-setup")
        page.fill("#st-n", "Ana"); page.fill("#st-l", "admin"); page.fill("#st-s", "Senha@123"); page.check("#st-d"); page.click("#st-btn")
        page.wait_for_selector("#nav"); page.wait_for_selector(".kpis", timeout=20000)

        import re as _re
        check("Barra superior mostra hora (HH:MM), data e turno", _re.fullmatch(r"\d{2}:\d{2}", page.inner_text("#rh-time")) and "Turno da" in page.inner_text("#rh-turno") and len(page.inner_text("#rh-date")) > 12)
        check("Não exibe 'Base compartilhada'", "Base compartilhada" not in page.inner_text(".topbar"))
        # Equipamentos: campo Setor no lugar de Sala
        open_cad(page, "equipamentos")
        hdr = page.inner_text("thead")
        check("Tabela de equipamentos mostra Setor (não Sala)", "SETOR" in hdr.upper() and "SALA" not in hdr.upper(), hdr)
        page.click("tbody tr[data-act=editEnt] >> nth=0")
        check("Equipamento: campo Sala removido e campo Setor presente", page.query_selector("#ff-salaId") is None and page.query_selector("#ff-setor") is not None)
        check("Equipamento antigo mostra o setor herdado da sala", page.input_value("#ff-setor") != "")
        page.fill("#ff-setor", ""); page.click("#f-ent button[type=submit]")
        check("Equipamento sem setor é recusado", page.query_selector("#f-ent") is not None and page.evaluate("document.querySelector('#ff-setor').validity.valueMissing"))
        page.click("[data-act=closeModal]")

        # Rondas: Setor (salas e equipamentos) com salas à esquerda e equipamentos à direita
        open_cad(page, "modelos")
        page.click("tr[data-act=editEnt]:has-text('Ronda UTI')")
        check("Rótulo 'Setor (salas e equipamentos)'", "Setor (salas e equipamentos)" in page.inner_text("#f-ent") and "Salas incluídas na ronda" not in page.inner_text("#f-ent"))
        g = page.locator("#salas-pick .sg").first
        xs = g.locator("[data-sala]").first.bounding_box()["x"]; xe = g.locator("[data-eq]").first.bounding_box()["x"]
        check("Salas à esquerda e equipamentos à direita", xe > xs + 100, (xs, xe))
        n_eq = page.evaluate("[...document.querySelectorAll('[data-eq]:checked')].length")
        check("Ronda de exemplo vem com os equipamentos marcados", n_eq >= 3, n_eq)
        # desmarcar tudo do setor UTI e marcar de novo pelo cabeçalho
        uti = page.locator("#salas-pick .sg", has_text="UTI").first
        uti.locator("[data-setor-all]").uncheck()
        check("Cabeçalho do setor desmarca salas e equipamentos", uti.locator("input:checked").count() == 0)
        uti.locator("[data-setor-all]").check()
        check("Cabeçalho do setor marca salas e equipamentos", uti.locator("input[data-sala]:checked").count() == uti.locator("input[data-sala]").count() and uti.locator("input[data-eq]:checked").count() == uti.locator("input[data-eq]").count() > 0)
        uti.locator("[data-eq]").first.uncheck()
        check("Desmarcar um equipamento desmarca o cabeçalho", not uti.locator("[data-setor-all]").is_checked())
        # nada marcado => erro
        page.evaluate("document.querySelectorAll('#salas-pick input[type=checkbox]').forEach(c=>c.checked=false)")
        page.click("#f-ent button[type=submit]")
        check("Ronda sem sala e sem equipamento é recusada", "sala ou um equipamento" in page.inner_text("#ent-err"), page.inner_text("#ent-err"))
        # só equipamento é aceito
        page.locator("#salas-pick [data-eq]").first.check(); save(page)
        m = page.evaluate("RH.S.modelos.find(x=>x.nome==='Ronda UTI · plantão diurno')")
        check("Ronda só com equipamento é salva (salaIds vazio, equipIds com 1)", m["salaIds"] == [] and len(m["equipIds"]) == 1, m)
        # ronda executável só com equipamentos: Nova ronda mostra bloco "Equipamentos" com etiqueta
        page.evaluate("RH.put('modelos', RH.S.modelos.find(x=>x.nome==='Ronda UTI · plantão diurno').id, {...RH.S.modelos.find(x=>x.nome==='Ronda UTI · plantão diurno'), responsavelId:''})")
        page.click("#nav [data-p=ronda]")
        page.locator("[data-act=pickRonda]", has_text="Ronda UTI").click(); page.wait_for_selector(".rhead")
        check("Ronda só de equipamentos: etiqueta Equipamento e nenhuma etiqueta Sala", page.locator(".tag-e").count() == 1 and page.locator(".tag-s").count() == 0)
        page.click("[data-act=cancelRonda]"); page.click("[data-act=cancelRonda]")

        # ronda antiga (sem equipIds): equipamentos vêm das salas
        page.evaluate("""(async()=>{await RH.put('salas','sx',{nome:'Sala X',setor:'Lab',ativo:true});
          await RH.put('equipamentos','ex',{nome:'Centrífuga',salaId:'sx',ativo:true});
          await RH.put('modelos','mx',{nome:'Ronda antiga',salaIds:['sx'],responsavelId:'',freq:24,ativo:true})})()""")
        page.wait_for_timeout(400)
        check("Ronda antiga inclui os equipamentos da sala", page.evaluate("RH.equipsDaRonda(RH.S.modelos.find(m=>m.id==='mx')).map(e=>e.id)") == ["ex"])
        check("Equipamento antigo herda o setor da sala", page.evaluate("RH.setorEq(RH.S.equipamentos.find(e=>e.id==='ex'))") == "Lab")
        open_cad(page, "modelos"); page.click("tr[data-act=editEnt]:has-text('Ronda antiga')")
        check("Editar ronda antiga mostra o equipamento marcado", page.locator("[data-eq]:checked").count() == 1)
        page.click("[data-act=closeModal]")

        # Duplicar cada cadastro
        for tab, nome_ in [("modelos", "Ronda Centro Cirúrgico"), ("salas", "UTI Neonatal"), ("equipamentos", "Autoclave 1"), ("checklists", "Equipamento · Esterilização"), ("tiposNC", None), ("users", "Marina Albuquerque")]:
            open_cad(page, tab)
            col = {"modelos": "modelos", "salas": "salas", "equipamentos": "equipamentos", "checklists": "checklists", "tiposNC": "tiposNC", "users": "users"}[tab]
            antes = page.evaluate(f"RH.S.{col}.length")
            check(f"Duplicar: botão em cada linha ({tab})", page.locator("tbody tr").count() == page.locator("tbody [data-act=dupEnt]").count() > 0)
            alvo = page.locator("tbody tr", has_text=nome_).first if nome_ else page.locator("tbody tr").first
            alvo.locator("[data-act=dupEnt]").click(); page.wait_for_selector("#f-ent")
            check(f"Duplicar abre formulário de novo cadastro ({tab})", "Duplicar" in page.inner_text(".mh h3") and page.query_selector("#btn-del") is None)
            check(f"Duplicar: nome recebe '(cópia)' ({tab})", "(cópia)" in page.input_value("#ff-nome"))
            if tab == "users":
                check("Duplicar usuário: login e senha em branco", page.input_value("#ff-login") == "" and page.input_value("#ff-senha") == "")
                page.fill("#ff-login", "copia"); page.fill("#ff-senha", "Copia#Senha1")
            if tab == "equipamentos":
                check("Duplicar equipamento: abas Geral / Presença no local", page.locator("#f-ent .ent-tabs [role=tab]").count() == 2 and page.locator("#ff-patrimonio, #ff-categoria, #ff-obs").count() == 0)
            if tab == "checklists":
                check("Duplicar checklist copia os itens", page.locator("[data-itx]").count() >= 3)
            if tab == "modelos":
                check("Duplicar ronda copia salas, equipamentos e agenda", page.locator("[data-sala]:checked").count() >= 2 and page.locator("[data-dia]:checked").count() >= 1 and page.locator("[data-hx]").count() >= 1)
            save(page)
            check(f"Duplicar salva um novo cadastro ({tab})", page.evaluate(f"RH.S.{col}.length") == antes + 1)
        check("Original e cópia coexistem (ids distintos)", page.evaluate("new Set(RH.S.modelos.map(m=>m.id)).size === RH.S.modelos.length"))
        orig = page.evaluate("RH.S.modelos.find(m=>m.nome==='Ronda Centro Cirúrgico')"); cop = page.evaluate("RH.S.modelos.find(m=>m.nome==='Ronda Centro Cirúrgico (cópia)')")
        check("Cópia da ronda preserva salas e equipamentos", sorted(cop["salaIds"]) == sorted(orig["salaIds"]) and sorted(cop["equipIds"]) == sorted(orig["equipIds"]) and len(orig["salaIds"]) >= 2, (orig, cop))

        # Painel: minimizar e expandir cada gráfico
        page.click("#nav [data-p=painel]"); page.wait_for_selector("#ch-line svg")
        cards = page.locator(".card[data-card]")
        check("Painel: cada gráfico tem botão de minimizar", cards.count() >= 8 and page.locator(".card[data-card] .min-btn").count() == cards.count(), cards.count())
        c1 = page.locator(".card[data-card=setor]")
        check("Cartão começa expandido", c1.locator(".card-b").is_visible())
        c1.locator(".min-btn").click()
        check("Minimizar esconde o conteúdo e mantém o título", not c1.locator(".card-b").is_visible() and c1.locator("h3").is_visible() and c1.locator(".min-btn").get_attribute("aria-expanded") == "false")
        page.reload(); page.wait_for_selector(".kpis")
        check("Estado minimizado é lembrado após recarregar", not page.locator(".card[data-card=setor] .card-b").is_visible())
        page.locator(".card[data-card=setor] .min-btn").click()
        check("Expandir mostra o conteúdo de novo", page.locator(".card[data-card=setor] .card-b").is_visible())
        page.locator(".card[data-card=linha] .min-btn").click(); page.locator(".card[data-card=linha] .min-btn").click()
        check("Gráfico de linha é redesenhado ao expandir", page.locator("#ch-line svg").count() == 1 and page.locator("#ch-line svg").bounding_box()["width"] > 300)
        page.click("[data-act=togTodos][data-v=min]")
        check("Minimizar tudo", page.locator(".card[data-card] .card-b:visible").count() == 0)
        page.click("[data-act=togTodos][data-v=exp]")
        check("Expandir tudo", page.locator(".card[data-card] .card-b:visible").count() == page.locator(".card[data-card]").count())
        page.screenshot(path=os.environ.get("RH_SHOT", "/dev/null") if False else "/tmp/rh_painel.png")
        ctx.close()

        browser.close()
    srv.shutdown()

    print("\n== Erros de console/página ==")
    real = [e for e in errors if "Failed to load resource" not in e and "fonts" not in e and "falha simulada" not in e]
    for e in real: print("  ", e)
    check("Nenhum erro de JavaScript no console", not real)
    check("Nenhuma requisição ao Supabase real durante o teste", not blocked, blocked[:3])
    bad = [n for n, ok in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} verificações passaram")
    sys.exit(1 if bad else 0)

def st_R(page):
    return page.evaluate("RH.st.R")

if __name__ == "__main__":
    main()
