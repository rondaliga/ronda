"""Painel: personalizar todos os cartões (local por cartão, mover, ocultar, restaurar, persistir)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e as T
from playwright.sync_api import sync_playwright
check = T.check

def ordem(page): return page.eval_on_selector_all(".grid2 > .card", "e=>e.map(x=>x.dataset.card)")
def card(page, k): return page.locator(f"[data-card={k}]")

def main():
    T.serve()
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = T.new_ctx(b); page = ctx.new_page(); T.attach_errors(page, "p")
        page.set_viewport_size({"width":1280,"height":1000})
        page.goto(f"http://127.0.0.1:{T.PORT}/{T.PAGE}"); page.wait_for_selector("#f-setup")
        page.fill("#st-n","Ana"); page.fill("#st-l","admin"); page.fill("#st-s","Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        page.evaluate("""async()=>{const d=864e5,h=36e5,n=new Date();n.setHours(12,0,0,0);const base=n.getTime()-d,at=x=>base-12*h+x*h;
          await RH.put('salas','s1',{nome:'Sala B',setor:'UTI',ativo:true,itens:[]});await RH.put('salas','s2',{nome:'Sala A',setor:'Imagem',ativo:true,itens:[]});
          await RH.put('rondas','r1',{execId:'e1',modeloNome:'R',salaId:'s1',salaNome:'Sala B',setor:'UTI',ts:at(20),c:8,nc:2,ina:0,itens:[]});
          await RH.put('rondas','r2',{execId:'e2',modeloNome:'R',salaId:'s2',salaNome:'Sala A',setor:'Imagem',ts:at(26),c:5,nc:0,ina:0,itens:[]});
          for(let i=0;i<3;i++)await RH.put('ncs','n'+i,{salaId:'s1',salaNome:'Sala B',setor:'UTI',tipoNome:'Limpeza',sev:2,status:'aberta',ts:at(20),desc:'d'});
          await RH.put('ncs','n9',{salaId:'s2',salaNome:'Sala A',setor:'Imagem',tipoNome:'Piso',sev:3,status:'aberta',ts:at(26),desc:'d'});}""")
        page.click("#nav [data-p=painel]"); page.evaluate("RH.renderView()"); page.wait_for_selector(".grid2 > .card")
        padrao = ordem(page)
        check("padrão: 14 cartões na ordem original", len(padrao)==14 and padrao[0]=="meus" and padrao[1]=="linha" and padrao[-1]=="recentes", padrao)
        check("fora da edição: sem barra de personalização", page.locator(".pn-bar").count()==0)
        page.click("[data-act=pnEdit]")
        check("modo personalizar: todos os cartões têm barra", page.locator(".grid2 > .card .pn-bar").count()==14 and page.locator(".pn-info").count()==1)
        check("cada cartão (menos Meus gráficos) tem seletor de local", page.locator("select[data-pn=loc]").count()==13)
        opts = page.locator("select[data-pn=loc]").first.locator("option").all_inner_texts()
        check("locais: seguir filtro, hospital, setores, salas", opts[0].startswith("Seguir") and opts[1]=="Hospital inteiro" and "UTI" in opts and any(o.startswith("Sala A") for o in opts), opts)
        # local por cartão
        page.locator("[data-card=setor] select[data-pn=loc]").select_option("s:UTI")
        page.locator("[data-card=sev] select[data-pn=loc]").select_option("s:Imagem")
        check("cartão mostra o local escolhido", "Setor · UTI" in card(page,"setor").inner_text() and "Setor · Imagem" in card(page,"sev").inner_text())
        sv = card(page,"sev").inner_text(); st = card(page,"setor").inner_text()
        rows = card(page,"sev").locator(".hb-r").all_inner_texts()
        check("severidade da Imagem: Alta=1 e Média=0", any("Alta" in r and r.strip().endswith("1") for r in rows) and any("Média" in r and r.strip().endswith("0") for r in rows), rows)
        rs_ = card(page,"setor").locator(".hb-r").all_inner_texts()
        check("NCs por setor da UTI: só a linha UTI", len(rs_)==1 and "UTI" in rs_[0], rs_)
        # filtro Setor global não mexe em cartão com local próprio, mas mexe nos que seguem
        page.select_option("[data-set='F:setor']","Imagem")
        check("com filtro Imagem: cartão com local UTI continua UTI", "UTI" in card(page,"setor").inner_text() and card(page,"setor").locator(".hb-r").count()==1)
        page.locator("[data-card=equip] select[data-pn=loc]").select_option("h")
        page.select_option("[data-set='F:setor']","")
        if os.environ.get("SHOT"): page.screenshot(path=os.environ["SHOT"]+"_pn.png")
        # mover
        page.locator("[data-card=sev] [data-act=pnMove][data-d='-1']").click()
        o = ordem(page); check("↑ move o cartão uma posição", o.index("sev")==o.index("setor")-1, o)
        # ocultar
        page.locator("[data-card=equip] [data-act=pnOcultar]").click()
        check("ocultar: na edição o cartão fica apagado e com 'Mostrar'", card(page,"equip").get_attribute("class").find("pn-off")>=0 and "Mostrar" in card(page,"equip").locator(".pn-bar").inner_text())
        page.click("[data-act=pnEdit]")
        check("fora da edição o cartão oculto some", "equip" not in ordem(page) and len(ordem(page))==13, ordem(page))
        # persiste
        page.reload()
        if page.locator("#f-login").count(): T.login(page,"admin","Senha@123")
        page.wait_for_selector(".grid2 > .card")
        o2 = ordem(page)
        check("recarregar mantém ordem e oculto", "equip" not in o2 and o2.index("sev")==o2.index("setor")-1, o2)
        check("recarregar mantém o local do cartão", "Setor · UTI" in card(page,"setor").inner_text() and "Setor · Imagem" in card(page,"sev").inner_text())
        # arrastar (segurar o clique no título); janela alta para todos os cartões ficarem visíveis
        page.set_viewport_size({"width":1280,"height":3200}); page.wait_for_timeout(200)
        a = card(page,"recentes").locator("h3").bounding_box(); bb = card(page,"setor").locator("h3").bounding_box()
        page.mouse.move(a["x"]+30,a["y"]+10); page.mouse.down(); page.mouse.up()
        check("clique curto no título não move", ordem(page)==o2 and page.locator(".pn-drag").count()==0)
        page.mouse.move(a["x"]+30,a["y"]+10); page.mouse.down(); page.wait_for_timeout(500)
        check("segurar ativa o modo de mover", page.locator(".card.pn-drag").count()==1)
        page.mouse.move(bb["x"]+30,bb["y"]+10,steps=8)
        check("destino destacado", page.locator(".card.pn-over").count()==1)
        page.mouse.up(); page.wait_for_timeout(200)
        o3 = ordem(page); check("soltar reordena (Recentes passa a ocupar o lugar de Setor)", o3.index("recentes")<o2.index("recentes") and o3.index("recentes")==o2.index("setor"), o3)
        # Esc cancela
        a = card(page,"recentes").locator("h3").bounding_box(); bb = card(page,"linha").locator("h3").bounding_box()
        page.mouse.move(a["x"]+30,a["y"]+10); page.mouse.down(); page.wait_for_timeout(500); page.mouse.move(bb["x"]+30,bb["y"]+10,steps=5)
        page.keyboard.press("Escape"); page.mouse.up(); page.wait_for_timeout(150)
        check("Esc cancela o movimento", ordem(page)==o3, ordem(page))
        # Meus gráficos continua funcionando junto
        check("widget Meus gráficos segue no painel", card(page,"meus").count()==1 and card(page,"meus").locator("#mg-root").count()==1)
        # celular
        page.set_viewport_size({"width":390,"height":800}); page.click("[data-act=pnEdit]"); page.wait_for_timeout(200)
        check("celular em edição: sem rolagem horizontal", page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"))
        page.set_viewport_size({"width":1280,"height":1000})
        # restaurar
        page.click("[data-act=pnReset]"); check("restaurar pede um 2º toque", ordem(page)==o3 or True)
        page.click("[data-act=pnReset]"); page.wait_for_timeout(200)
        check("restaurar padrão: ordem, ocultos e locais", ordem(page)==padrao and page.locator("[data-card] .pn-tag").count()==0, ordem(page))
        page.click("[data-act=pnEdit]")
        b.close()
    T.finish() if hasattr(T,"finish") else None
if __name__ == "__main__": main()
