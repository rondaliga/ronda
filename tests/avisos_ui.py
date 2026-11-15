"""Cadastros → Hospital → Avisos por e-mail: blocos, próximo envio, destinatários, testes, token e salvar."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e as T
from playwright.sync_api import sync_playwright
check = T.check

def abrir(page):
    page.evaluate("RH.st.cadTab='hospital';RH.renderView()"); page.wait_for_selector("#av-dep"); page.wait_for_timeout(500)

def main():
    T.serve()
    with sync_playwright() as p:
        b = p.chromium.launch(); page = T.new_ctx(b).new_page(); T.attach_errors(page, "a")
        page.set_viewport_size({"width":900,"height":1500})
        page.goto(f"http://127.0.0.1:{T.PORT}/{T.PAGE}"); page.wait_for_selector("#f-setup")
        page.fill("#st-n","Ana"); page.fill("#st-l","admin"); page.fill("#st-s","Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        page.evaluate("""async()=>{RH.store.mode='remote';const d=RH.st.db;
          RH.st.db=Object.assign(Object.create(d),{doc:p=>{const x=d.doc(p);return p==='avisos/estado'?{get:async()=>({exists:true,data:()=>({ultimaExec:Date.now()-6e5,ultimoEnvio:Date.now()-36e5,total:9,relat:{ultimo:Date.now()-864e5}})})}:x}});
          await RH.put('users','g1',{nome:'Gil',login:'gil',role:'gestor',ativo:true,email:'gil@x.com'});
          await RH.put('users','g2',{nome:'Gabi',login:'gabi',role:'gestor',ativo:true,email:''});
          window.__calls=[];window.fetch=async(u,o)=>{window.__calls.push({u,b:JSON.parse(o.body)});return {ok:true,status:204}}}""")
        page.click("#nav [data-p=cadastros]"); abrir(page)
        txt = page.inner_text("#avisos-card")
        check("três blocos: alertas, relatório e aviso imediato", "Alertas de não conformidade" in txt and "Relatório periódico" in txt and "Aviso imediato" in txt)
        check("textos antigos longos foram removidos", "A checagem ocorre a cada" not in txt and "Avisar NC Média e Alta depois de (horas)" not in txt)
        check("rótulos padronizados", "Severidade mínima" in txt and "Aguardar antes de avisar" in txt)
        check("status em selo único com última verificação", page.locator("#avisos-card .av-head .pill").inner_text().strip()=="Funcionando" and "9 e-mails enviados" in txt)
        check("avisos aparece como interruptor", page.get_attribute("#av-ativo","role")=="switch")
        check("salvar começa desabilitado, sem alterações", page.is_disabled("#av-salvar") and not page.is_visible("#av-sujo"))
        page.check("#av-ativo")
        check("alterar marca 'não salvas' e habilita salvar", page.is_visible("#av-sujo") and not page.is_disabled("#av-salvar"))
        check("botões de teste desabilitados sem token", page.is_disabled("[data-act=avisosTeste]") and "aviso imediato" in txt.lower())
        page.select_option("#av-rel-modo","semanal"); page.select_option("#av-rel-dsem","5"); page.select_option("#av-rel-hora","12")
        page.wait_for_timeout(100)
        prox = page.inner_text("#av-rel-det")
        check("mostra o próximo envio (sexta, 12:00)", "Próximo envio" in prox and "sexta-feira" in prox and "12:00" in prox, prox)
        check("destino do relatório: administrador sem e-mail não conta; gestor com e-mail conta", "1 destinatário com e-mail (1 gestor)" in prox, prox)
        check("aviso de usuários sem e-mail lista Ana e Gabi", "Sem e-mail cadastrado" in page.inner_text("#avisos-card") and "Gabi" in page.inner_text("#avisos-card"))
        check("aviso imediato começa recolhido", not page.is_visible("#av-repo"))
        page.click(".av-imed > summary"); page.fill("#av-repo","org/ronda"); page.fill("#av-tok","github_pat_x")
        page.click("#av-salvar"); page.wait_for_timeout(500)
        cfg = page.evaluate("RH.S.cfg.avisos")
        check("salva e mantém token", cfg["ghToken"]=="github_pat_x" and cfg["relatorio"]=={"modo":"semanal","dia":5,"hora":12} and cfg["ativo"] is True, cfg)
        page.evaluate("RH.st.cadTab='hospital';RH.renderView()"); page.wait_for_selector("#av-dep"); page.wait_for_timeout(500)
        check("token salvo mostra selo com Substituir e Remover (sem campo)", page.locator("#av-tok-st").count()==1 and not page.is_visible("#av-tok") and "Substituir" in page.text_content("#av-tok-st") and "Remover" in page.text_content("#av-tok-st"))
        check("botões de teste habilitados com token", not page.is_disabled("[data-act=avisosTeste]") and not page.is_disabled("[data-act=avisosPrevia]"))
        page.click("[data-act=avisosTeste]"); page.wait_for_timeout(200); page.click("[data-act=avisosPrevia]"); page.wait_for_timeout(300)
        calls = page.evaluate("window.__calls")
        check("teste e pré-visualização disparam o fluxo com as entradas certas", len(calls)==2 and calls[0]["b"]["inputs"]=={"teste":"true"} and calls[1]["b"]["inputs"]=={"relatorio":"true"} and "workflows/avisos-email.yml/dispatches" in calls[0]["u"], calls)
        page.click(".av-imed > summary"); page.click("[data-act=avTokSubst]")
        check("Substituir mostra o campo do token", page.is_visible("#av-tok"))
        page.fill("#av-tok","github_pat_novo"); page.click("#av-salvar"); page.wait_for_timeout(500)
        check("token substituído", page.evaluate("RH.S.cfg.avisos.ghToken")=="github_pat_novo")
        page.evaluate("RH.st.cadTab='hospital';RH.renderView()"); page.wait_for_selector("#av-dep"); page.wait_for_timeout(500)
        page.click(".av-imed > summary"); page.click("[data-act=avTokDel]")
        check("Remover pede para salvar", "será removido" in page.inner_text("#av-tok-st"))
        page.click("[data-act=avTokUndo]"); page.wait_for_timeout(500)
        check("Desfazer volta ao token salvo", page.locator("#av-tok-st .btn").count()==2)
        page.click(".av-imed > summary"); page.click("[data-act=avTokDel]"); page.click("#av-salvar"); page.wait_for_timeout(500)
        check("token removido ao salvar", page.evaluate("RH.S.cfg.avisos.ghToken")=="")
        check("tela sem rolagem horizontal", page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"))
        page.set_viewport_size({"width":390,"height":1500}); page.wait_for_timeout(300)
        ov = page.evaluate("document.documentElement.scrollWidth-innerWidth"); print("overflow", ov, page.evaluate("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,6).map(e=>{let p=[],x=e;while(x&&p.length<4){p.push(x.tagName+'.'+x.className+'#'+x.id);x=x.parentElement}return p.join('<')+':'+Math.round(e.getBoundingClientRect().right)})"))
        check("celular: sem rolagem horizontal", page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), page.evaluate("[...document.querySelectorAll('#avisos-card *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,4).map(e=>e.tagName+'.'+e.className+'#'+e.id+':'+Math.round(e.getBoundingClientRect().right))"))
        b.close()
    T.finish() if hasattr(T,"finish") else None
if __name__ == "__main__": main()
