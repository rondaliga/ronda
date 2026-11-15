"""Itens "Somente foto" (parâmetros da Ressonância): sem valor e sem conforme/não conforme; foto obrigatória."""
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
          await RH.put('salas','s1',{nome:'Comando Ressonância 01',setor:'Imagem',ativo:true,itens:[{id:'a0',t:'Sala limpa'},{id:'a1',t:'Nível hélio'},{id:'a2',t:'Pressão hélio'},{id:'a3',t:'Fluxo da água LPM'},{id:'a4',t:'Temperatura da água'}]});
          await RH.put('modelos','m1',{nome:'Ronda RM',ativo:true,responsavelId:'',dias:[0,1,2,3,4,5,6],horarios:['08:00'],salaIds:['s1'],equipIds:[],ordem:['s:s1'],liberacao:{}})}""")
        page.wait_for_timeout(500)
        # cadastro: marcar "Somente foto" nos 4 parâmetros
        page.evaluate("RH.st.cadTab='salas'"); page.evaluate("RH.go('cadastros')"); page.wait_for_timeout(300); page.click("tr[data-id='s1']"); page.wait_for_selector(".irow")
        check("editor: opção Somente foto em cada item", page.locator("input[data-itf]").count() == 5)
        for i in (1,2,3,4): page.check(f"input[data-itf='{i}']")
        check("editor: item de Temperatura marcado como somente foto esconde a faixa ideal", page.locator("[data-tempbox]:visible").count() == 0)
        page.evaluate("document.querySelector('#modal [data-act=save], #modal .btn.pri')?.click()"); page.wait_for_timeout(500)
        its = page.evaluate("RH.S.salas.find(s=>s.id==='s1').itens.map(i=>!!i.foto)")
        check("cadastro grava o item como somente foto", its == [False, True, True, True, True], its)
        # ronda
        page.click("#nav [data-p=ronda]"); page.click("[data-act=pickRonda]"); page.wait_for_selector(".rhead")
        check("itens somente foto não têm Conforme/Não conforme", page.locator(".it:has-text('Nível hélio') .seg").count() == 0 and page.locator(".it:has-text('Sala limpa') .seg").count() == 1)
        check("itens somente foto não pedem valor", page.locator("[data-tv]").count() == 0)
        check("foto obrigatória aparece nos 4 parâmetros", page.locator("text=Foto (obrigatória)").count() == 4)
        page.locator(".it:has-text('Sala limpa') button.c").click()
        page.click("#btn-sub"); page.wait_for_timeout(300)
        check("sem fotos: ronda não finaliza", page.evaluate("RH.S.rondas.length") == 0 and page.locator(".it.miss").count() == 4)
        for n in PARAMS:
            page.locator(".it", has_text=n).locator("input[data-nc-foto]").set_input_files({"name": "f.png", "mimeType": "image/png", "buffer": PNG}); page.wait_for_timeout(500)
        page.click("#btn-sub"); page.wait_for_selector(".top h1:has-text('Histórico de rondas')")
        r = page.evaluate("RH.S.rondas[0]")
        check("ronda gravada: 4 fotos, sem valor, fora do cálculo de conformidade", sum(1 for i in r["itens"] if i.get("fotoId")) == 4 and not any("tv" in i for i in r["itens"]) and r["c"] == 1 and r["nc"] == 0 and r["pct"] == 100, r)
        page.locator("tbody tr").first.click(); page.wait_for_selector(".mod"); page.wait_for_timeout(500)
        txt = page.inner_text(".mod")
        check("histórico mostra as 4 fotos com o nome do parâmetro", page.locator(".mod img[data-foto]").count() == 4 and all(n in txt for n in PARAMS))
        b.close()
    T.finish() if hasattr(T,"finish") else None
if __name__ == "__main__": main()
