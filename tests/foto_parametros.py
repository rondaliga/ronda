"""Item com fotos exigidas (ex.: Disjuntor da Ressonância: 4 fotos nomeadas), mantendo Conforme/Não conforme/Inacessível."""
import base64, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e as T
from playwright.sync_api import sync_playwright
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
check = T.check
PARAMS = ["Nível hélio", "Pressão hélio", "Fluxo da água LPM", "Temperatura da água"]

def main():
    T.serve()
    with sync_playwright() as p:
        b = p.chromium.launch(); page = T.new_ctx(b).new_page(); T.attach_errors(page, "f")
        page.set_viewport_size({"width":1280,"height":1400})
        page.goto(f"http://127.0.0.1:{T.PORT}/{T.PAGE}"); page.wait_for_selector("#f-setup")
        page.fill("#st-n", "Ana"); page.fill("#st-l", "admin"); page.fill("#st-s", "Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        page.evaluate("""async()=>{
          await RH.put('salas','s1',{nome:'Comando Ressonância 01',setor:'Imagem',ativo:true,itens:[{id:'a0',t:'Ar-condicionado'},{id:'a1',t:'Disjuntor'}]});
          await RH.put('modelos','m1',{nome:'Ronda RM',ativo:true,responsavelId:'',dias:[0,1,2,3,4,5,6],horarios:['08:00'],salaIds:['s1'],equipIds:[],ordem:['s:s1'],liberacao:{}})}""")
        page.wait_for_timeout(500)
        # cadastro: ícones compactos de foto e aviso
        page.evaluate("RH.st.cadTab='salas'"); page.evaluate("RH.go('cadastros')"); page.wait_for_timeout(300); page.click("tr[data-id='s1']"); page.wait_for_selector(".irow")
        check("editor: um ícone de foto e um de aviso por item, sem textos longos", page.locator("[data-act=itFt]").count() == 2 and page.locator("[data-act=itAv]").count() == 2 and "Somente foto" not in page.inner_text("#items") and "Adicionar aviso" not in page.inner_text("#items"))
        check("editor: campos de foto e aviso começam fechados", page.locator("[data-itfl]").count() == 0 and page.locator("[data-ita]").count() == 0)
        page.click("[data-act=itFt][data-i='1']"); page.fill("[data-itfl='1']", ", ".join(PARAMS))
        page.click("[data-act=itAv][data-i='0']"); page.fill("[data-ita='0']", "Verificar a porta")
        page.click("[data-act=itAv][data-i='0']"); 
        check("editor: ícone de aviso fecha e limpa o aviso", page.locator("[data-ita]").count() == 0)
        page.evaluate("document.querySelector('#modal [data-act=save], #modal .btn.pri')?.click()"); page.wait_for_timeout(500)
        it = page.evaluate("RH.S.salas.find(s=>s.id==='s1').itens")
        check("cadastro grava as 4 fotos exigidas do Disjuntor", it[1].get("fotos") == PARAMS and not it[0].get("fotos") and not it[0].get("aviso"), it)
        # ronda
        page.click("#nav [data-p=ronda]"); page.click("[data-act=pickRonda]"); page.wait_for_selector(".rhead")
        d = page.locator(".it:has-text('Disjuntor')")
        check("Disjuntor mantém Conforme / Não conforme / Inacessível", d.locator(".seg button").count() == 3)
        check("Disjuntor mostra as 4 fotos obrigatórias, nomeadas", d.locator(".fslot").count() == 4 and all(n in d.inner_text() for n in PARAMS))
        page.locator(".it:has-text('Ar-condicionado') button.c").click(); d.locator("button.c").click()
        page.click("#btn-sub"); page.wait_for_timeout(300)
        check("sem fotos: ronda não finaliza", page.evaluate("RH.S.rondas.length") == 0 and page.locator(".it.miss").count() == 1)
        d.locator("button.a").click()
        check("Inacessível dispensa as fotos", page.locator(".it:has-text('Disjuntor') .fslot").count() == 0)
        d.locator("button.a").click(); d.locator("button.c").click()
        for j in range(4):
            page.locator(f".it:has-text('Disjuntor') .fslot").nth(j).locator("input[data-nc-foto]").set_input_files({"name": "f.png", "mimeType": "image/png", "buffer": PNG}); page.wait_for_timeout(500)
        check("4 fotos anexadas", page.locator(".it:has-text('Disjuntor') .fslot img").count() == 4)
        page.click("#btn-sub"); page.wait_for_selector(".top h1:has-text('Histórico de rondas')")
        r = page.evaluate("RH.S.rondas[0]")
        check("ronda gravada: 4 fotos do Disjuntor, conformidade só com os 2 itens", sum(1 for i in r["itens"] if i.get("fotoId")) == 4 and r["c"] == 2 and r["nc"] == 0 and r["pct"] == 100 and sum(1 for i in r["itens"] if i["r"] == "FT") == 4, r)
        page.locator("tbody tr").first.click(); page.wait_for_selector(".mod"); page.wait_for_timeout(500)
        txt = page.inner_text(".mod")
        check("histórico mostra as 4 fotos com o nome do parâmetro", page.locator(".mod img[data-foto]").count() == 4 and all(n in txt for n in PARAMS))
        b.close()
    T.finish() if hasattr(T,"finish") else None
if __name__ == "__main__": main()
