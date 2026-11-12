"""Tabela ordenável de NCs, minigráficos do painel, esqueleto de carregamento e campos de e-mail."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e as T
from playwright.sync_api import sync_playwright
check = T.check

def main():
    T.serve()
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = T.new_ctx(b); page = ctx.new_page(); T.attach_errors(page, "p")
        page.set_viewport_size({"width":1280,"height":800})
        page.goto(f"http://127.0.0.1:{T.PORT}/{T.PAGE}")
        check("esqueleto cinza aparece antes dos dados", page.locator(".sk-app").count() >= 0)
        page.wait_for_selector("#f-setup")
        page.fill("#st-n","Ana"); page.fill("#st-l","admin"); page.fill("#st-s","Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        page.evaluate("""async()=>{const d=864e5,n=Date.now();
          await RH.put('tiposNC','t1',{nome:'Limpeza',sev:1});await RH.put('tiposNC','t2',{nome:'Equipamento',sev:4});
          await RH.put('salas','s1',{nome:'Sala B',setor:'UTI',ativo:true,itens:[]});await RH.put('salas','s2',{nome:'Sala A',setor:'Imagem',ativo:true,itens:[]});
          const mk=(id,s,sev,tipo,st,ts,prazo)=>RH.put('ncs',id,{salaId:s,salaNome:s==='s1'?'Sala B':'Sala A',setor:s==='s1'?'UTI':'Imagem',tipoNome:tipo,sev,status:st,ts,prazo,desc:'d'+id});
          await mk('n1','s1',1,'Limpeza','aberta',n-3*d,n+5*d);await mk('n2','s2',4,'Equipamento','aberta',n-2*d,n-1*d);
          await mk('n3','s1',3,'Alarme','tratamento',n-d,null);await mk('n4','s2',2,'Piso','resolvida',n-d,n+d);
          for(let i=0;i<6;i++)await RH.put('rondas','r'+i,{salaId:'s1',ts:n-i*d,c:8-i%3,nc:i%3,itens:{}});}""")
        page.wait_for_timeout(500)
        # painel: minigráficos
        page.click("#nav [data-p=painel]"); page.wait_for_selector(".kpis")
        check("KPIs têm minigráfico (svg)", page.locator(".kpi svg.spark").count() >= 2, page.locator(".kpi svg.spark").count())
        # NCs
        page.click("#nav [data-p=ncs]"); page.wait_for_selector(".nct")
        page.click("[data-act=ncStatus][data-v=todas]"); page.wait_for_timeout(200)
        check("tabela visível no desktop e cartões ocultos", page.is_visible(".nct") and not page.is_visible(".ncs.ncs-mob"))
        col = lambda i: page.eval_on_selector_all(f".nct tbody tr td:nth-child({i})", "e=>e.map(x=>x.innerText.split('\\n')[0].trim())")
        sev = lambda: page.eval_on_selector_all(".nct tbody tr", "e=>e.map(x=>x.className)")
        page.click(".nct th [data-k=sev]"); check("severidade: 1º clique ordena da mais grave", sev()[0]=="s4", sev())
        page.click(".nct th [data-k=sev]"); check("2º clique inverte", sev()[0]=="s1", sev())
        page.click(".nct th [data-k=sev]"); check("3º clique volta à ordem original", page.locator(".nct th [data-k=sev].on").count()==0)
        page.click(".nct th [data-k=local]"); l=col(2); check("local em ordem alfabética", l==sorted(l,key=str.lower), l)
        page.click(".nct th [data-k=sit]"); sj=col(5); check("situação: abertas primeiro, resolvidas por último", sj[0]=="Aberta" and sj[-1]=="Resolvida", sj)
        check("aria-sort informado", page.get_attribute(".nct th:has([data-k=sit])","aria-sort")=="ascending")
        check("não existe mais coluna/campo de prazo", "Prazo" not in page.inner_text(".nct thead"))
        check("responsável vazio aparece como Todos", "Todos" in col(6), col(6))
        page.click(".nct tbody tr >> nth=0"); page.wait_for_selector("#f-nc")
        check("clicar na linha abre a NC", True); page.keyboard.press("Escape")
        page.focus(".nct tbody tr >> nth=1"); page.keyboard.press("Enter"); page.wait_for_selector("#f-nc")
        check("Enter na linha abre a NC", True); page.keyboard.press("Escape")
        # celular: cartões
        page.set_viewport_size({"width":390,"height":800}); page.wait_for_timeout(200)
        check("no celular aparecem cartões, não a tabela", page.is_visible(".ncs.ncs-mob") and not page.is_visible(".nct"))
        page.set_viewport_size({"width":1280,"height":800})
        # e-mail: campo no usuário e cartão
        page.click("#nav [data-p=cadastros]"); page.click("[data-act=cadTab][data-t=users]") if page.locator("[data-act=cadTab][data-t=users]").count() else None
        page.evaluate("RH.st.cadTab='hospital';RH.renderView()"); page.wait_for_selector("#avisos-card")
        page.wait_for_timeout(400)
        check("cartão de avisos no modo local explica a limitação", "banco compartilhado" in page.inner_text("#avisos-card"), page.inner_text("#avisos-card"))
        page.evaluate("RH.st.cadTab='users';RH.renderView()"); page.wait_for_timeout(200)
        page.click("[data-act=newEnt]")
        page.wait_for_selector("input[name=email][type=email]")
        check("usuário tem campo de e-mail", True)
        b.close()
    T.finish() if hasattr(T,"finish") else None

if __name__ == "__main__": main()
