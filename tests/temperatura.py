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
          await RH.put('salas','s1',{nome:'Sala 1',setor:'UTI',ativo:true,itens:[{id:'a1',t:'Temperatura ambiente',tmin:20,tmax:24},{id:'a2',t:'Luz de emergência',aviso:'Fechar e levar as chaves para a portaria.'}]});
          await RH.put('equipamentos','q1',{nome:'Geladeira',setor:'UTI',ativo:true,itens:[{id:'i1',t:'Temperatura entre 2 e 8 °C',tmin:2,tmax:8},{id:'i2',t:'Limpeza'},{id:'i3',t:'Porta íntegra'}]});
          await RH.put('modelos','m1',{nome:'Ronda T',ativo:true,responsavelId:'',dias:[0,1,2,3,4,5,6],horarios:['08:00'],salaIds:['s1'],equipIds:['q1'],ordem:['s:s1','e:q1'],liberacao:{}})}""")
        page.wait_for_timeout(500)
        check("migração Luz→Iluminação", page.evaluate("async()=>{await RH.migrarLuz();await new Promise(r=>setTimeout(r,600));return RH.S.salas.find(s=>s.id==='s1').itens.map(i=>i.t).join('|')}") == "Temperatura ambiente|Iluminação de emergência")
        page.click("#nav [data-p=ronda]"); page.click("[data-act=pickRonda]"); page.wait_for_selector(".rhead")
        check("temperatura ideal aparece na ronda", "Temperatura ideal: 20 °C a 24 °C" in page.inner_text(".it:has-text('Temperatura ambiente')") and "2 °C a 8 °C" in page.inner_text(".it:has-text('Temperatura entre')"))
        check("sala não usa mais 'Checklist da sala'", page.locator("text=Checklist da sala").count() == 0 and page.locator(".grp .t b:has-text('Sala 1')").count() == 1)
        for bt in page.query_selector_all(".seg button.c"): bt.click()
        page.click("#btn-sub"); page.wait_for_timeout(300)
        check("sem leitura: ronda não finaliza (temperatura medida obrigatória com faixa ideal)", page.evaluate("RH.S.rondas.length") == 0 and page.locator(".it.miss").count() >= 1)
        page.fill("[data-tv][data-k$=':a1']", "22,5"); page.keyboard.press("Tab")
        page.fill("[data-tv][data-k$=':i1']", "5"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
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
        page.locator(".mod img[data-foto]").first.click(); page.wait_for_selector("#lightbox img")
        check("clicar na foto do histórico a amplia", page.locator("#lightbox").count() == 1)
        page.keyboard.press("Escape"); page.wait_for_timeout(100)
        check("Esc fecha só a foto (histórico segue aberto)", page.locator("#lightbox").count() == 0 and page.locator(".mod").count() == 1)
        check("histórico mostra a temperatura ideal", "Ideal: 20 °C a 24 °C" in page.inner_text(".mod"))
        # editor de cadastro: campos de temperatura ideal
        page.keyboard.press("Escape"); page.evaluate("document.querySelector('.mod')?.remove()")
        page.evaluate("RH.go('cadastros')"); page.wait_for_timeout(300)
        page.evaluate("RH.st.cadTab='salas'"); page.evaluate("RH.go('cadastros')"); page.wait_for_timeout(300); page.click("tr[data-id='s1']"); page.wait_for_selector(".irow")
        check("editor: campo ideal visível só no item de Temperatura", page.locator("[data-tempbox]:visible").count() == 1)
        check("editor: aviso fechado por padrão", page.locator("input[data-ita]").count() == 1)
        page.click("[data-act=itAv][data-i='0']"); check("editor: botão abre o campo de aviso", page.locator("input[data-ita='0']").count() == 1)
        page.click("[data-act=itAvRm][data-i='0']")
        page.fill("[data-itmin='0']", "19,5"); page.fill("[data-itmax='0']", "23")
        page.locator(".irow").nth(1).locator("input[data-itx]").fill("Temperatura da sala"); page.wait_for_timeout(100)
        check("editor: digitar 'Temperatura' revela o campo", page.locator("[data-tempbox]:visible").count() == 2)
        page.click("button[type=submit]"); page.wait_for_timeout(600)
        it = page.evaluate("RH.S.salas.find(s=>s.id==='s1').itens.map(i=>[i.tmin,i.tmax])")
        check("editor: ideal salvo (19,5 a 23)", it[0] == [19.5, 23], it)
        # limpeza automática de fotos (60 dias)
        r = page.evaluate("""async()=>{
          const old=Date.now()-90*864e5, rec=Date.now()-5*864e5;
          await RH.put('fotos','fo1',{data:'x'}); await RH.put('fotos','fo2',{data:'x'}); await RH.put('fotos','fo3',{data:'x'}); await RH.put('fotos','fo4',{data:'x'});
          await RH.put('rondas','ro1',{ts:old,itens:[{n:'A',t:'Temperatura',r:'C',thumb:'data:image/gif;base64,R0lGODlhAQABAAAAACw=',fotoId:'fo1'}]});
          await RH.put('rondas','ro2',{ts:rec,itens:[{n:'B',t:'Temperatura',r:'C',thumb:'data:image/gif;base64,R0lGODlhAQABAAAAACw=',fotoId:'fo2'}]});
          await RH.put('rondas','ro3',{ts:old,itens:[{n:'C',t:'Temperatura',r:'NC',thumb:'data:image/gif;base64,R0lGODlhAQABAAAAACw=',fotoId:'fo3'}]});
          await RH.put('ncs','nc3',{ts:old,status:'aberta',fotoId:'fo3',thumb:'data:image/gif;base64,R0lGODlhAQABAAAAACw='});
          await RH.put('ncs','nc4',{ts:old,status:'resolvida',fotoId:'fo4',thumb:'data:image/gif;base64,R0lGODlhAQABAAAAACw='});
          await new Promise(r=>setTimeout(r,300));
          const n=await RH.limparFotos(true); await new Promise(r=>setTimeout(r,300));
          const ex=async id=>(await RH.st.db.doc('fotos/'+id).get()).exists;
          return {n, fo1:await ex('fo1'), fo2:await ex('fo2'), fo3:await ex('fo3'), fo4:await ex('fo4'),
            ro1:RH.S.rondas.find(x=>x.id==='ro1').itens[0], ro2:RH.S.rondas.find(x=>x.id==='ro2').itens[0].fotoId, ro3:RH.S.rondas.find(x=>x.id==='ro3').itens[0].fotoId,
            nc4:RH.S.ncs.find(x=>x.id==='nc4').fotoId, nc3:RH.S.ncs.find(x=>x.id==='nc3').fotoId}}""")
        check("limpeza: ronda antiga perde a foto completa e mantém a miniatura", r["fo1"] is False and r["ro1"].get("fotoId") is None and r["ro1"]["thumb"].startswith("data:image"), r)
        check("limpeza: ronda recente permanece", r["fo2"] is True and r["ro2"] == "fo2", r)
        check("limpeza: foto de NC aberta é preservada", r["fo3"] is True and r["ro3"] == "fo3" and r["nc3"] == "fo3", r)
        check("limpeza: NC resolvida antiga perde a foto", r["fo4"] is False and r["nc4"] is None, r)
        page.set_viewport_size({"width":390,"height":844}); page.evaluate("RH.go('ncs')"); page.wait_for_timeout(300)
        check("celular: filtros de NC escondidos até tocar em Filtros", not page.is_visible("#nc-q"))
        page.click("[data-act=ncFiltros]"); page.wait_for_timeout(200)
        check("celular: botão Filtros abre busca/severidade/setor", page.is_visible("#nc-q"))
        check("rodapé mostra a versão do app", "Versão 1.0.10 · publicada em 12/11/2026" in page.inner_text(".foot"))
        print("erros:", T.errors)
        b.close()
main()
