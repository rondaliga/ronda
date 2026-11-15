"""Painel: widget "Meus gráficos" (escolher gráfico e local por item, salvar, remover, recarregar)."""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e as T
from playwright.sync_api import sync_playwright
check = T.check

def itens(page): return page.locator(".mg-item")
def stored(page): return page.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('rh.painel.meus.v1.')))||'[]')")

def main():
    T.serve()
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = T.new_ctx(b); page = ctx.new_page(); T.attach_errors(page, "p")
        page.set_viewport_size({"width":1280,"height":900})
        page.goto(f"http://127.0.0.1:{T.PORT}/{T.PAGE}"); page.wait_for_selector("#f-setup")
        page.fill("#st-n","Ana"); page.fill("#st-l","admin"); page.fill("#st-s","Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        page.evaluate("""async()=>{const d=864e5,h=36e5,n=new Date();n.setHours(12,0,0,0);const base=n.getTime()-d,at=x=>base-12*h+x*h;
          await RH.put('salas','s1',{nome:'Sala B',setor:'UTI',ativo:true,itens:[]});await RH.put('salas','s2',{nome:'Sala A',setor:'Imagem',ativo:true,itens:[]});
          const T1={t:'Temperatura da geladeira',tv:5,r:'C',ideal:'2 °C a 8 °C'},T2={t:'Temperatura da geladeira',tv:12,r:'NC',ideal:'2 °C a 8 °C'};
          await RH.put('rondas','r1',{execId:'e1',modeloNome:'Ronda UTI',salaId:'s1',salaNome:'Sala B',setor:'UTI',ts:at(20),c:8,nc:2,ina:0,itens:[T1,T2]});
          await RH.put('rondas','r2',{execId:'e2',modeloNome:'Ronda Imagem',salaId:'s2',salaNome:'Sala A',setor:'Imagem',ts:at(26),c:5,nc:0,ina:0,itens:[]});
          await RH.put('rondas','r3',{execId:'e3',modeloNome:'Ronda UTI',salaId:'s1',salaNome:'Sala B',setor:'UTI',ts:at(21),c:10,nc:0,ina:0,itens:[]});
          for(let i=0;i<3;i++)await RH.put('ncs','n'+i,{salaId:'s1',salaNome:'Sala B',setor:'UTI',tipoNome:'Limpeza',sev:2,status:'aberta',ts:at(20),desc:'d'});
          await RH.put('ncs','n9',{salaId:'s2',salaNome:'Sala A',setor:'Imagem',tipoNome:'Piso',sev:3,status:'aberta',ts:at(26),desc:'d'});}""")
        page.click("#nav [data-p=painel]"); page.evaluate("RH.renderView()"); page.wait_for_selector("#mg-root")
        check("widget aparece no painel", page.locator("[data-card=meus]").count()==1)
        check("vazio: orienta usar a engrenagem", "Nenhum gráfico escolhido" in page.inner_text("#mg-root") and "engrenagem" in page.inner_text("#mg-root"))
        # configurar
        page.click("[data-act=mgEdit]")
        check("engrenagem abre o modo de edição", page.locator(".mg-edit").count()==1 and page.get_attribute("[data-act=mgEdit]","aria-pressed")=="true")
        page.click("[data-act=mgAdd]"); page.click("[data-act=mgAdd]"); page.click("[data-act=mgAdd]")
        check("3 itens adicionados (padrão: conformidade, hospital inteiro)", page.locator(".mg-row").count()==3 and all(x["tipo"]=="conf" and x["loc"]=="" for x in stored(page)), stored(page))
        sels = page.locator("select[data-mg=tipo]"); locs = page.locator("select[data-mg=loc]")
        sels.nth(0).select_option("prod"); locs.nth(0).select_option("s:UTI")
        sels.nth(1).select_option("conf"); locs.nth(1).select_option("s:Imagem")
        sels.nth(2).select_option("temp")
        op = [o for o in locs.nth(0).locator("option").all_inner_texts()]
        check("locais: hospital inteiro, setores e salas", op[0].startswith("Hospital inteiro") and "UTI" in op and "Imagem" in op and any(o.startswith("Sala A") for o in op), op)
        tipos = sels.nth(0).locator("option").all_inner_texts()
        check("tipos: conformidade, NCs, temperatura, produtividade…", all(any(x in t for t in tipos) for x in ["Conformidade por dia","Não conformidades por dia","Temperatura","Produtividade","Pareto"]), tipos)
        page.click("[data-act=mgEdit]")
        its = itens(page)
        check("3 gráficos exibidos", its.count()==3)
        check("cada título mostra o seu local", "Setor · UTI" in its.nth(0).inner_text() and "Setor · Imagem" in its.nth(1).inner_text() and "Hospital inteiro" in its.nth(2).inner_text())
        check("produtividade da UTI: 2 rondas", "2 rondas" in its.nth(0).inner_text(), its.nth(0).inner_text())
        check("conformidade da Imagem: 100%", "100%" in its.nth(1).inner_text(), its.nth(1).inner_text())
        check("temperatura: 2 leituras, 1 fora da faixa, faixa ideal", all(s in its.nth(2).inner_text() for s in ["2 leituras","1 fora da faixa","2 °C a 8 °C"]), its.nth(2).inner_text())
        check("gráfico SVG desenhado com pontos", its.nth(1).locator("svg.mg-svg circle").count()>=1 and its.nth(0).locator("svg.mg-svg rect[fill='var(--c1)']").count()>=1)
        # independência: trocar o local do 1º não muda o 2º
        page.click("[data-act=mgEdit]"); page.locator("select[data-mg=loc]").nth(0).select_option("r:s2")
        check("trocar o local de um item não altera os outros", "Sala · Sala A" in itens(page).nth(0).inner_text() and "Setor · Imagem" in itens(page).nth(1).inner_text() and "100%" in itens(page).nth(1).inner_text())
        check("produtividade da Sala A: 1 ronda", "1 ronda" in itens(page).nth(0).inner_text() and "2 rondas" not in itens(page).nth(0).inner_text())
        page.locator("select[data-mg=tipo]").nth(0).select_option("tipos"); page.locator("select[data-mg=loc]").nth(0).select_option("")
        check("Pareto de NCs do hospital: Limpeza lidera", "Limpeza" in itens(page).nth(0).inner_text() and "Piso" in itens(page).nth(0).inner_text())
        if os.environ.get("SHOT"): page.locator("[data-card=meus]").screenshot(path=os.environ["SHOT"]+"_a.png")
        page.click("[data-act=mgEdit]")
        if os.environ.get("SHOT"): page.locator("[data-card=meus]").screenshot(path=os.environ["SHOT"]+"_b.png")
        st = stored(page)
        check("preferências salvas (tipo + local por item)", [(x["tipo"],x["loc"]) for x in st]==[("tipos",""),("conf","s:Imagem"),("temp","")], st)
        # recarregar mantém
        page.reload(); page.wait_for_selector("#f-login, #nav")
        if page.locator("#f-login").count():
            T.login(page,"admin","Senha@123")
        page.wait_for_selector("#mg-root")
        check("após recarregar, a configuração continua", itens(page).count()==3 and "Setor · Imagem" in itens(page).nth(1).inner_text())
        # alerta visual: conformidade abaixo da meta fica vermelha; acima, verde
        page.click("[data-act=mgEdit]"); page.locator("select[data-mg=loc]").nth(1).select_option("s:UTI")
        sm = itens(page).nth(1).locator(".mg-sum b").first
        check("conformidade da UTI (90%) abaixo da meta: vermelho + aviso", "badc" in (sm.get_attribute("class") or "") and "abaixo da meta de 95%" in itens(page).nth(1).inner_text(), itens(page).nth(1).inner_text())
        check("ponto abaixo da meta fica vermelho no gráfico", itens(page).nth(1).locator("svg circle[fill='var(--s3)']").count()>=1)
        page.locator("select[data-mg=loc]").nth(1).select_option("s:Imagem")
        check("conformidade da Imagem (100%): verde + meta atingida", "good" in (itens(page).nth(1).locator(".mg-sum b").first.get_attribute("class") or "") and "meta de 95% atingida" in itens(page).nth(1).inner_text())
        # mover pelos botões ↑ ↓ (também no toque)
        ordem = lambda: [x["tipo"] for x in stored(page)]
        page.locator("[data-act=mgMove][data-d='1']").first.click()
        check("botão ↓ troca com o seguinte e salva", ordem()==["conf","tipos","temp"], ordem())
        page.locator("[data-act=mgMove][data-d='-1']").nth(1).click()
        check("botão ↑ devolve a posição", ordem()==["tipos","conf","temp"], ordem())
        check("1º item sem ↑ e último sem ↓", page.locator("[data-act=mgMove][data-d='-1']").first.is_disabled() and page.locator("[data-act=mgMove][data-d='1']").last.is_disabled())
        page.click("[data-act=mgEdit]")
        # clique curto não move; segurar e arrastar move
        c0 = itens(page).nth(0).bounding_box(); c2 = itens(page).nth(2).bounding_box()
        page.mouse.move(c0["x"]+c0["width"]/2, c0["y"]+60); page.mouse.down(); page.mouse.up()
        check("clique curto não inicia o arrasto", ordem()==["tipos","conf","temp"] and page.locator(".mg-drag").count()==0)
        page.mouse.move(c0["x"]+c0["width"]/2, c0["y"]+60); page.mouse.down(); page.wait_for_timeout(500)
        check("segurar o clique ativa o modo de mover", page.locator(".mg-item.mg-drag").count()==1 and page.evaluate("document.body.classList.contains('mg-dragging')"))
        page.mouse.move(c2["x"]+c2["width"]/2, c2["y"]+60, steps=8)
        check("o gráfico de destino é destacado", page.locator(".mg-over").count()==1)
        page.mouse.up(); page.wait_for_timeout(150)
        check("soltar sobre outro gráfico reordena e salva", ordem()==["conf","temp","tipos"], ordem())
        check("tela reflete a nova ordem", "Conformidade" in itens(page).nth(0).inner_text() and "Pareto" in itens(page).nth(2).inner_text() and page.locator(".mg-drag").count()==0)
        # Esc cancela o arrasto
        c0 = itens(page).nth(0).bounding_box(); c2 = itens(page).nth(2).bounding_box()
        page.mouse.move(c0["x"]+c0["width"]/2, c0["y"]+60); page.mouse.down(); page.wait_for_timeout(500)
        page.mouse.move(c2["x"]+c2["width"]/2, c2["y"]+60, steps=5); page.keyboard.press("Escape"); page.mouse.up(); page.wait_for_timeout(150)
        check("Esc cancela o movimento", ordem()==["conf","temp","tipos"], ordem())
        # volta à ordem usada nos próximos testes: tipos, conf, temp
        page.click("[data-act=mgEdit]")
        page.locator("[data-act=mgMove][data-d='-1']").nth(2).click(); page.locator("[data-act=mgMove][data-d='-1']").nth(1).click()
        check("ordem restaurada", ordem()==["tipos","conf","temp"], ordem())
        page.click("[data-act=mgEdit]")
        # remover
        page.click("[data-act=mgEdit]"); page.click("[data-act=mgDel] >> nth=1")
        check("remover tira só o item escolhido", [x["tipo"] for x in stored(page)]==["tipos","temp"] and page.locator(".mg-row").count()==2, stored(page))
        # local removido
        page.locator("select[data-mg=loc]").nth(1).select_option("r:s2"); page.click("[data-act=mgEdit]")
        page.evaluate("RH.del&&RH.del('salas','s2')"); page.wait_for_timeout(300); page.evaluate("RH.renderView()")
        txt = itens(page).nth(1).inner_text() if itens(page).count()>1 else ""
        check("sala removida: avisa e não quebra", "não existe mais" in txt or "não encontrado" in txt.lower(), txt)
        # usuário diferente não herda a configuração
        k = page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rh.painel.meus.v1.'))")
        check("a chave é por usuário", len(k)==1 and k[0].split('.')[-1] not in ("","anon"), k)
        # celular
        page.set_viewport_size({"width":390,"height":800}); page.wait_for_timeout(200)
        check("celular: sem rolagem horizontal", page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"))
        page.click("[data-act=mgEdit]"); page.wait_for_timeout(100)
        check("celular: edição sem rolagem horizontal", page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"))
        b.close()
    T.finish() if hasattr(T,"finish") else None
if __name__ == "__main__": main()
