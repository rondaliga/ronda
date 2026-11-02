"""Teste das Ações em Lote (Cadastros). Uso: python3 tests/bulk.py  (RH_PAGE=dist/ronda-hospitalar-teste.html para o arquivo único)"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e
from e2e import *

def main():
    srv = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = new_ctx(browser); page = ctx.new_page(); attach_errors(page, "bulk")
        page.goto(f"http://127.0.0.1:{PORT}/{PAGE}")
        page.wait_for_selector("#f-setup")
        page.fill("#st-n", "Ana Admin"); page.fill("#st-l", "admin"); page.fill("#st-s", "Senha@123")
        page.click("#st-btn"); page.wait_for_selector("#nav")
        page.evaluate("""async()=>{
          const P=(c,i,d)=>RH.put(c,i,d);
          await P('checklists','ck1',{nome:'Sala padrão',tipo:'sala',itens:[{id:'i1',t:'x'}]});
          await P('checklists','ck2',{nome:'Equip padrão',tipo:'equipamento',itens:[{id:'i2',t:'y'}]});
          await P('checklists','ck3',{nome:'Vazio',tipo:'sala',itens:[{id:'i3',t:'z'}]});
          for(const [i,n,s,a] of [['a','UTI 01','UTI','1º andar'],['b','UTI 02','UTI','1º andar'],['c','Farmácia','Farmácia','Térreo'],['d','CC 01','Centro Cirúrgico','2º andar']])await P('salas',i,{nome:n,setor:s,andar:a,ativo:true});
          for(const [i,n,s,c] of [['e1','Monitor','UTI','Suporte à vida'],['e2','Ventilador','UTI','Suporte à vida'],['e3','Autoclave','Farmácia','Esterilização']])await P('equipamentos',i,{nome:n,setor:s,categoria:c,ativo:true});
          await P('modelos','m1',{nome:'Ronda Farmácia',ativo:true,dias:[1],horarios:['08:00'],ordem:['s:c'],salaIds:['c'],equipIds:[]});
          await P('modelos','m2',{nome:'Ronda Destino',ativo:true,dias:[1],horarios:['08:00'],ordem:['s:d'],salaIds:['d'],equipIds:[]});
        }""")
        page.wait_for_timeout(500)
        open_cad(page, "salas")
        rows = lambda: page.locator("tbody tr").count()
        check("4 salas listadas", rows() == 4, rows())
        page.select_option("[data-cf=setor]", "UTI")
        check("filtro Setor=UTI mostra 2", rows() == 2, rows())
        page.select_option("[data-cf=andar]", "1º andar")
        check("filtro Andar combinado", rows() == 2)
        check("barra oculta sem seleção", not page.is_visible("#bulk-bar"))
        page.click("#sel-all")
        check("Selecionar todos marca os filtrados", page.locator("td.td-sel input:checked").count() == 2 and page.is_visible("#bulk-bar") and "2" in page.inner_text(".bulk-n"))
        page.click("[data-act=cfClear]")
        check("sem filtro: header indeterminado (2 de 4)", page.evaluate("document.getElementById('sel-all').indeterminate"))
        page.click("tbody tr:has-text('Farmácia') .td-sel input")
        check("clicar na caixa não abre o editor", page.locator("#f-ent").count() == 0 and "3" in page.inner_text(".bulk-n"))
        page.click("#sel-all")  # indeterminado -> marca todos
        check("indeterminado + clique seleciona tudo", page.locator("td.td-sel input:checked").count() == 4)
        page.click("#sel-all")
        check("clicar de novo desmarca tudo e esconde barra", page.locator("td.td-sel input:checked").count() == 0 and not page.is_visible("#bulk-bar"))
        # equipamentos: seleção entre abas
        page.select_option("[data-cf=setor]", "UTI"); page.click("#sel-all")
        open_cad(page, "equipamentos")
        check("sem filtro de categoria em Equipamentos", page.locator("[data-cf=categoria]").count() == 0)
        page.select_option("[data-cf=setor]", "UTI"); page.click("#sel-all")
        txt = page.inner_text(".bulk-n")
        check("seleção soma salas e equipamentos entre abas", "4" in txt and "2 salas" in txt and "2 equipamentos" in txt, txt)
        # vincular a ronda
        page.click("[data-act=bkLink]"); page.select_option("#bk-dest", label="Ronda Destino")
        prev = page.inner_text("#bk-prev")
        check("prévia: 4 entram", "4 itens serão adicionados" in prev, prev)
        page.click("#bk-ok"); page.wait_for_selector("#f-bk-link", state="detached")
        m = page.evaluate("RH.S.modelos.find(x=>x.id==='m2')")
        check("ronda recebeu itens na ordem (setor, sala antes de equip.)", m["ordem"] == ["s:d","s:a","s:b","e:e1","e:e2"] and m["salaIds"] == ["d","a","b"] and m["equipIds"] == ["e1","e2"], m)
        # repetir: ja pertencem
        page.click("[data-act=bkLink]"); page.select_option("#bk-dest", label="Ronda Destino")
        check("prévia: já na ronda, botão desabilitado", "já fazem parte" in page.inner_text("#bk-prev") and page.is_disabled("#bk-ok"))
        page.select_option("#bk-dest", label="Ronda Farmácia")
        check("já em outra ronda: nada entra", page.is_disabled("#bk-ok"))
        page.click("[data-act=closeModal]")
        # alterar setor
        page.click("[data-act=bkSetor]"); page.fill("#bk-setor", "CTI"); page.click("#bk-ok"); page.wait_for_selector("#f-bk-setor", state="detached")
        check("setor alterado em salas e equipamentos", page.evaluate("[...RH.S.salas.filter(s=>['a','b'].includes(s.id)),...RH.S.equipamentos.filter(e=>['e1','e2'].includes(e.id))].every(x=>x.setor==='CTI')"))
        check("seleção termina após alterar setor", not page.is_visible("#bulk-bar"))
        # criar ronda com selecionados
        open_cad(page, "salas"); page.click("tbody tr:has-text('CC 01') .td-sel input"); page.click("tbody tr:has-text('Farmácia') .td-sel input")
        page.click("[data-act=bkRonda]"); page.wait_for_timeout(300)
        check("itens já em outras rondas: não abre o modal e avisa", page.locator("#f-ent").count() == 0 and "já pertencem" in page.inner_text("#toast"), page.inner_text("#toast"))
        page.click("[data-act=selClear]")
        # item livre: cria sala nova e ronda
        page.evaluate("RH.put('salas','z',{nome:'Lab',setor:'Lab',ativo:true})"); page.wait_for_timeout(600)
        open_cad(page, "salas"); page.click("tbody tr:has-text('Lab') .td-sel input")
        page.click("[data-act=bkRonda]"); page.wait_for_selector("#f-ent")
        check("ronda pré-preenchida com a seleção", page.input_value("#ff-nome") == "Ronda Lab" and "Lab" in page.inner_text("#ord-list"), page.inner_text("#ord-list"))
        save(page)
        check("ronda criada e seleção limpa", page.evaluate("RH.S.modelos.some(m=>m.nome==='Ronda Lab'&&m.ordem.join()==='s:z')") and not page.is_visible("#bulk-bar"))
        # excluir: bloqueada (sala em ronda) + livre
        page.evaluate("RH.put('salas','y',{nome:'Sobra',setor:'X',ativo:true})"); page.wait_for_timeout(600)
        open_cad(page, "salas"); page.click("tbody tr:has-text('Sobra') .td-sel input"); page.click("tbody tr:has-text('Farmácia') .td-sel input")
        page.click("[data-act=bkDel]")
        mod = page.inner_text("#modal")
        check("exclusão: separa excluíveis e bloqueadas", "1 será excluído" in mod and "1 não pode ser excluído" in mod, mod)
        page.click("[data-act=bkDelGo]"); page.wait_for_selector("[data-act=bkDelGo]", state="detached"); page.wait_for_timeout(600)
        check("só a sala livre foi excluída", page.evaluate("!RH.S.salas.some(s=>s.id==='y')&&RH.S.salas.some(s=>s.id==='c')"))
        browser.close()
    print("\nErros de console/página:", errors or "nenhum")
    bad = [r for r in results if not r[1]]
    print(f"{len(results)-len(bad)}/{len(results)} verificações OK")
    sys.exit(1 if bad or errors else 0)

if __name__ == "__main__":
    main()
