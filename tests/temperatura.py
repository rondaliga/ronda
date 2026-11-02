"""Itens de sala e de equipamento com "Temperatura" exigem foto na ronda; avisos e migração Luz→Iluminação."""
import base64, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e as T
from playwright.sync_api import sync_playwright
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
check = T.check

def main():
    T.serve()
    with sync_playwright() as p:
        b = p.chromium.launch(); page = T.new_ctx(b).new_page(); T.attach_errors(page, "t")
        page.goto(f"http://127.0.0.1:{T.PORT}/{T.PAGE}"); page.wait_for_selector("#f-setup")
        page.fill("#st-n", "Ana"); page.fill("#st-l", "admin"); page.fill("#st-s", "Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        page.evaluate("""async()=>{
          await RH.put('salas','s1',{nome:'Sala 1',setor:'UTI',ativo:true,itens:[{id:'a1',t:'Temperatura ambiente'},{id:'a2',t:'Luz de emergência',aviso:'Fechar e levar as chaves para a portaria.'}]});
          await RH.put('equipamentos','q1',{nome:'Geladeira',setor:'UTI',ativo:true,itens:[{id:'i1',t:'Temperatura entre 2 e 8 °C'},{id:'i2',t:'Limpeza'},{id:'i3',t:'Porta íntegra'}]});
          await RH.put('modelos','m1',{nome:'Ronda T',ativo:true,responsavelId:'',dias:[0,1,2,3,4,5,6],horarios:['08:00'],salaIds:['s1'],equipIds:['q1'],ordem:['s:s1','e:q1'],liberacao:{}})}""")
        page.wait_for_timeout(500)
        check("migração Luz→Iluminação", page.evaluate("async()=>{await RH.migrarLuz();await new Promise(r=>setTimeout(r,600));return RH.S.salas.find(s=>s.id==='s1').itens.map(i=>i.t).join('|')}") == "Temperatura ambiente|Iluminação de emergência")
        page.click("#nav [data-p=ronda]"); page.click("[data-act=pickRonda]"); page.wait_for_selector(".rhead")
        for bt in page.query_selector_all(".seg button.c"): bt.click()
        check("foto obrigatória nos itens de Temperatura da sala e do equipamento", page.locator("text=Foto da sala (obrigatória)").count() == 1 and page.locator("text=Foto do equipamento (obrigatória)").count() == 1)
        check("aviso do item aparece na ronda", "Fechar e levar as chaves para a portaria." in page.inner_text(".it:has-text('Iluminação de emerg')") or "Fechar e levar as chaves" in page.inner_text(".bl"))
        check("migração Luz→Iluminação", page.evaluate("async()=>{await RH.migrarLuz();await new Promise(r=>setTimeout(r,600));return RH.S.salas.find(s=>s.id==='s1').itens.map(i=>i.t).join('|')}") == "Temperatura ambiente|Iluminação de emergência")
        page.click("#btn-sub"); page.wait_for_timeout(300)
        check("sem foto: ronda não finaliza", page.locator("#btn-sub").count() == 1 and "foto" in page.inner_text("#toast, .toast, [role=status]").lower() if page.locator("#toast, .toast, [role=status]").count() else page.locator("#btn-sub").count() == 1)
        check("sem foto: nada gravado", page.evaluate("RH.S.rondas.length") == 0)
        # item Inacessível dispensa a foto
        page.wait_for_timeout(500)
        it = page.locator(".it", has_text="Temperatura entre")
        it.locator("button.a").click(); it.locator("textarea").fill("Porta trancada")
        check("Inacessível dispensa a foto", page.locator("text=Foto do equipamento (obrigatória)").count() == 0)
        it.locator("button.c").click()
        for key in ("Temperatura entre", "Temperatura ambiente"):
            page.locator(".it", has_text=key).locator("input[data-nc-foto]").set_input_files({"name": "f.png", "mimeType": "image/png", "buffer": PNG})
            page.wait_for_timeout(500)
        page.click("#btn-sub"); page.wait_for_selector(".top h1:has-text('Histórico de rondas')")
        d = page.evaluate("RH.S.rondas.flatMap(r=>r.itens).filter(i=>i.fotoId).length")
        check("ronda gravada com as fotos (sala e equipamento)", d == 2, d)
        page.locator("tbody tr").first.click(); page.wait_for_selector(".mod"); page.wait_for_timeout(400)
        check("histórico mostra as fotos de temperatura", page.locator(".mod img[data-foto]").count() == 2 and "Fotos de temperatura" in page.inner_text(".mod"))
        print("erros:", T.errors)
        b.close()
main()
