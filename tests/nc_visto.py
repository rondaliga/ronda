"""Detalhe da NC simplificado: 'Visto' (quem viu) resolve a não conformidade; desmarcar reabre."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e as T
from playwright.sync_api import sync_playwright
check = T.check

def main():
    T.serve()
    with sync_playwright() as p:
        b = p.chromium.launch(); page = T.new_ctx(b).new_page(); T.attach_errors(page, "v")
        page.set_viewport_size({"width":1100,"height":900})
        page.goto(f"http://127.0.0.1:{T.PORT}/{T.PAGE}"); page.wait_for_selector("#f-setup")
        page.fill("#st-n","Ana Gestora"); page.fill("#st-l","admin"); page.fill("#st-s","Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        page.evaluate("""async()=>{await RH.put('ncs','n1',{ts:Date.now()-864e5,salaNome:'UTI 01',setor:'UTI',tipoNome:'Limpeza',sev:2,status:'aberta',desc:'Piso sujo',itemTexto:'Limpeza do piso',inspNome:'Ivo',resp:null});
          await RH.put('ncs','n2',{ts:Date.now()-864e5,salaNome:'UTI 02',setor:'UTI',tipoNome:'Limpeza',sev:2,status:'em_tratamento',desc:'Lixo cheio',inspNome:'Ivo',resolucao:'Troca agendada'})}""")
        page.click("#nav [data-p=ncs]"); page.wait_for_selector(".nct"); page.wait_for_timeout(300)
        page.locator(".nct tbody tr", has_text="UTI 01").click(); page.wait_for_selector("#f-nc")
        t = page.inner_text("#f-nc")
        check("campos antigos removidos (situação, responsável, severidade, ação corretiva)", not page.locator("#f-nc select").count() and not page.locator("#f-nc textarea").count() and "Responsável pela correção" not in t and "Ação corretiva" not in t)
        check("mostra a opção de visto não marcada, com o nome de quem vai registrar", not page.is_checked("[data-nc-visto]") and "visualizado por Ana Gestora" in t)
        check("sem botão Salvar/Cancelar (só Fechar e Excluir)", page.locator("#f-nc button[type=submit]").count()==0 and "Cancelar" not in page.inner_text(".mf"))
        page.check("[data-nc-visto]"); page.wait_for_timeout(500)
        n = page.evaluate("RH.S.ncs.find(x=>x.id==='n1')")
        check("marcar visto resolve a NC e registra quem viu e quando", n["status"]=="resolvida" and n["resolvidoPor"]==page.evaluate("RH.st.me.id") and n["resolvidoEm"], n)
        t = page.inner_text("#f-nc")
        check("detalhe passa a mostrar 'Visualizado por … em …'", "Visualizado por Ana Gestora em" in t and page.is_checked("[data-nc-visto]"), t)
        page.uncheck("[data-nc-visto]"); page.wait_for_timeout(500)
        n = page.evaluate("RH.S.ncs.find(x=>x.id==='n1')")
        check("desmarcar reabre a NC", n["status"]=="aberta" and not n.get("resolvidoEm") and not n.get("resolvidoPor"), n)
        page.keyboard.press("Escape"); page.wait_for_timeout(200)
        page.locator(".nct tbody tr", has_text="UTI 02").click(); page.wait_for_selector("#f-nc")
        check("ação já registrada continua visível, só leitura", "Troca agendada" in page.inner_text("#f-nc"))
        page.check("[data-nc-visto]"); page.wait_for_timeout(500)
        check("NC em tratamento também resolve ao marcar visto", page.evaluate("RH.S.ncs.find(x=>x.id==='n2').status")=="resolvida")
        page.keyboard.press("Escape"); page.wait_for_timeout(200)
        page.evaluate("RH.access.canEditNC=()=>false")
        page.locator(".nct tbody tr", has_text="UTI 01").click(); page.wait_for_selector("#f-nc")
        check("quem não é gestor/administrador não consegue marcar", page.is_disabled("[data-nc-visto]") and "Aguardando visualização" in page.inner_text("#f-nc"))
        b.close()
    T.finish() if hasattr(T,"finish") else None
if __name__ == "__main__": main()
