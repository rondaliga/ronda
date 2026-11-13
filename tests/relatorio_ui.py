"""Cadastros → Hospital: configuração do relatório periódico (banco compartilhado simulado)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e as T
from playwright.sync_api import sync_playwright
check = T.check

def main():
    T.serve()
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = T.new_ctx(b); page = ctx.new_page(); T.attach_errors(page, "p")
        page.goto(f"http://127.0.0.1:{T.PORT}/{T.PAGE}")
        page.wait_for_selector("#f-setup")
        page.fill("#st-n","Ana"); page.fill("#st-l","admin"); page.fill("#st-s","Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        page.evaluate("RH.store.mode='remote';const d=RH.st.db;RH.st.db=Object.assign(Object.create(d),{doc:p=>{const x=d.doc(p);return p==='avisos/estado'?{get:async()=>({exists:false})}:x}});RH.st.cadTab='hospital'")
        page.click("#nav [data-p=cadastros]"); page.evaluate("RH.st.cadTab='hospital';RH.renderView()"); page.wait_for_selector("#av-rel-modo"); page.wait_for_timeout(800)   # a tela termina de desenhar o cartão
        check("relatório começa desligado e sem detalhes", page.input_value("#av-rel-modo")=="off" and not page.is_visible("#av-rel-det"))
        page.select_option("#av-rel-modo","semanal")
        check("semanal mostra dia da semana, esconde dia do mês", page.is_visible("#av-rel-dsem") and not page.is_visible("#av-rel-dmes") and page.input_value("#av-rel-dsem")=="1")
        page.select_option("#av-rel-modo","mensal")
        check("mensal mostra dia do mês (1–28)", page.is_visible("#av-rel-dmes") and not page.is_visible("#av-rel-dsem") and page.locator("#av-rel-dmes option").count()==28)
        page.select_option("#av-rel-dmes","5"); page.select_option("#av-rel-hora","9")
        page.check("#av-ativo"); page.click("[data-act=avisosSalvar]"); page.wait_for_timeout(500)
        cfg = page.evaluate("RH.S.cfg.avisos") or {}
        check("salva relatorio {modo,dia,hora}", cfg.get("relatorio")=={"modo":"mensal","dia":5,"hora":9}, cfg)
        page.select_option("#av-rel-modo","off"); page.click("[data-act=avisosSalvar]"); page.wait_for_timeout(500)
        check("desligar salva modo off", page.evaluate("RH.S.cfg.avisos.relatorio")=={"modo":"off"})
        b.close()
    T.finish() if hasattr(T,"finish") else None
if __name__ == "__main__": main()
