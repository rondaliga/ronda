"""Painel: Pareto, mapa de calor setor × horário e tempos médios por ronda e por local."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e as T
from playwright.sync_api import sync_playwright
check = T.check

def main():
    T.serve()
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = T.new_ctx(b); page = ctx.new_page(); T.attach_errors(page, "p")
        page.set_viewport_size({"width":1280,"height":900})
        page.goto(f"http://127.0.0.1:{T.PORT}/{T.PAGE}")
        page.wait_for_selector("#f-setup")
        page.fill("#st-n","Ana"); page.fill("#st-l","admin"); page.fill("#st-s","Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        # painel vazio: cartões de tempo explicam
        page.click("#nav [data-p=painel]"); page.wait_for_selector(".kpis")
        check("sem dados: tempo explica a versão", "1.0.12" in page.inner_text("#c-tempoRonda, [data-card=tempoRonda]") if page.locator("#c-tempoRonda, [data-card=tempoRonda]").count() else "1.0.12" in page.inner_text("main"))
        page.evaluate("""async()=>{const d=864e5,h=36e5,n=new Date();n.setHours(12,0,0,0);const base=n.getTime()-d,at=(x)=>base-12*h+x*h;
          await RH.put('salas','s1',{nome:'Sala B',setor:'UTI',ativo:true,itens:[]});await RH.put('salas','s2',{nome:'Sala A',setor:'Imagem',ativo:true,itens:[]});
          const nc=(id,tp,it,s,ts)=>RH.put('ncs',id,{salaId:s,salaNome:s==='s1'?'Sala B':'Sala A',setor:s==='s1'?'UTI':'Imagem',tipoNome:tp,itemTexto:it,sev:2,status:'aberta',ts,desc:'d'});
          for(let i=0;i<5;i++)await nc('a'+i,'Limpeza','Piso limpo','s1',base);
          for(let i=0;i<3;i++)await nc('b'+i,'Equipamento','Monitor ligado','s2',base);
          await nc('c0','Alarme','Alarme audível','s1',base);await nc('c1','Piso','Piso seco','s1',base);
          /* 08h UTI: 2 NC em 10 itens; 14h Imagem: 0 NC em 5 */
          const t8=at(20),t14=at(26);
          await RH.put('rondas','r1',{execId:'e1',modeloNome:'Ronda UTI',salaId:'s1',salaNome:'Sala B',setor:'UTI',ts:t8,ini:t8-20*6e4,dur:20*6e4,tloc:5*6e4,c:8,nc:2,ina:0,itens:{}});
          await RH.put('rondas','r2',{execId:'e2',modeloNome:'Ronda Imagem',salaId:'s2',salaNome:'Sala A',setor:'Imagem',ts:t14,ini:t14-40*6e4,dur:40*6e4,tloc:3*6e4,c:5,nc:0,ina:0,itens:{}});
          await RH.put('rondas','r3',{execId:'e3',modeloNome:'Ronda UTI',salaId:'s1',salaNome:'Sala B',setor:'UTI',ts:t8,ini:t8-10*6e4,dur:10*6e4,tloc:7*6e4,c:10,nc:0,ina:0,itens:{}});
          await RH.put('rondas','r4',{execId:'e4',modeloNome:'Ronda UTI',salaId:'s1',salaNome:'Sala B',setor:'UTI',ts:t8,ini:t8-1,dur:20*36e5,tloc:9*36e5,c:1,nc:0,ina:0,itens:{}});}""")
        page.wait_for_timeout(500); page.evaluate("RH.renderView()"); page.wait_for_selector(".pareto")
        rows = page.eval_on_selector_all(".pt-r", "e=>e.map(x=>[x.querySelector('.pt-l').textContent,+x.querySelector('.pt-n').textContent,x.querySelector('.pt-a').textContent,x.classList.contains('vit')])")
        check("Pareto: ordem decrescente", rows[0][0]=="Limpeza" and rows[0][1]==5 and rows[1][0]=="Equipamento", rows)
        check("Pareto: acumulado 50% / 80% / 90% / 100%", [r[2] for r in rows]==["50%","80%","90%","100%"], rows)
        check("Pareto: acumulado final 100%", rows[-1][2]=="100%", rows)
        check("Pareto: destaca só quem soma até 80%", [r[3] for r in rows][0] is True and rows[-1][3] is False, rows)
        page.select_option("select[data-set='F:paretoPor']","item"); page.wait_for_selector(".pareto")
        check("Pareto por item verificado", page.inner_text(".pt-r .pt-l")=="Piso limpo", page.inner_text(".pareto"))
        page.select_option("select[data-set='F:paretoPor']","setor"); page.wait_for_selector(".pareto")
        check("Pareto por setor", page.inner_text(".pt-r .pt-l")=="UTI")
        # mapa de calor
        cel = page.eval_on_selector_all(".hm-c:not(.vz)", "e=>e.map(x=>[x.innerText.trim(),x.dataset.tip])")
        check("calor: 2 células com dados", len(cel)==2, cel)
        check("calor: UTI 06h–09h tem 2 NC em 21 itens", any("2 NC em 21 itens" in c[1] for c in cel), cel)
        check("calor: Imagem 0%", any(c[0]=="0%" for c in cel), cel)
        check("calor: tabela acessível", page.locator(".hm[role=table] [role=columnheader]").count()==9)
        # tempos
        tr = page.inner_text("main")
        check("tempo por ronda: UTI 15 min (ignora a de 20 h)", "15 min" in tr and "Ronda UTI" in tr, tr[:0])
        check("tempo por local: Sala B 6 min e Sala A 3 min", "6 min" in tr and "3 min" in tr)
        sc = page.locator(".card:has-text('Salas abaixo da média do hospital')")
        nomes = sc.locator(".hb-l").all_inner_texts()
        check("salas: só as abaixo da média do hospital (Sala B), sem a Sala A", nomes==["Sala B"], nomes)
        check("salas: mostra a média do hospital", "média do hospital:" in sc.inner_text())
        # celular sem rolagem horizontal da página
        page.set_viewport_size({"width":390,"height":800}); page.wait_for_timeout(200)
        check("celular: página sem rolagem horizontal", page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"))
        # demonstração tem tempos
        page.set_viewport_size({"width":1280,"height":900})
        b.close()
    T.finish() if hasattr(T,"finish") else None

if __name__ == "__main__": main()
