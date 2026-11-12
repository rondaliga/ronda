"""Pendências de hoje, NC repetida e aviso imediato."""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e as T
from playwright.sync_api import sync_playwright
check = T.check

def main():
    T.serve()
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = T.new_ctx(b); page = ctx.new_page(); T.attach_errors(page, "m")
        page.set_viewport_size({"width":1280,"height":800})
        page.goto(f"http://127.0.0.1:{T.PORT}/{T.PAGE}"); page.wait_for_selector("#f-setup")
        page.fill("#st-n","Ana"); page.fill("#st-l","admin"); page.fill("#st-s","Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        page.clock.set_fixed_time("2026-11-12T15:30:00-03:00")
        page.evaluate("""async()=>{const d=864e5,now=Date.parse('2026-11-12T15:30:00-03:00');
          await RH.put('salas','s1',{nome:'Sala 1',setor:'UTI',ativo:true,itens:[{id:'a1',t:'Alarme'}]});
          await RH.put('salas','s2',{nome:'Sala 2',setor:'Imagem',ativo:true,itens:[{id:'b1',t:'Limpeza'}]});
          const base={ativo:true,responsavelId:'',dias:[0,1,2,3,4,5,6],agendaDesde:now-5*d};
          await RH.put('modelos','m1',{...base,nome:'Ronda UTI',horarios:['08:00','14:00','20:00'],salaIds:['s1'],ordem:['s:s1']});
          await RH.put('modelos','m2',{...base,nome:'Ronda Imagem',horarios:['08:00'],salaIds:['s2'],ordem:['s:s2']});
          await RH.put('rondas','r1',{modeloId:'m1',ts:Date.parse('2026-11-12T08:10:00-03:00'),salaId:'s1',c:1,nc:0,itens:[]});
          await RH.put('rondas','r2',{modeloId:'m2',ts:Date.parse('2026-11-12T08:05:00-03:00'),salaId:'s2',c:1,nc:0,itens:[]});
          // NC repetida: mesmo item, 3 vezes em 30 dias; outra NC isolada
          const nc=(id,dias,item)=>RH.put('ncs',id,{salaId:'s1',salaNome:'Sala 1',setor:'UTI',itemTexto:item,tipoNome:'Equip',sev:3,status:'aberta',ts:now-dias*d,desc:'x'});
          await nc('n1',20,'Alarme');await nc('n2',9,'Alarme');await nc('n3',1,'Alarme');await nc('n4',2,'Piso');
          await nc('n5',50,'Alarme');}""")
        page.wait_for_timeout(500)
        # ---------- 3) pendências ----------
        page.click("#nav [data-p=ronda]"); page.wait_for_selector(".pend")
        h = page.eval_on_selector(".pend", "e=>e.getBoundingClientRect().height")
        check("alerta compacto (uma linha) por padrão", h < 70 and page.locator(".pend-l").count() == 0, h)
        head = page.inner_text(".pend-h")
        check("resume: 1 ronda atrasada", "ronda atrasada" in head and head.strip().startswith("1") or "1 ronda atrasada" in head, head)
        check("nível de alerta vermelho para atrasada", page.locator(".pend.bad").count() == 1)
        page.click(".pend-h"); page.wait_for_selector(".pend-l")
        rows = page.eval_on_selector_all(".pend-l li", "e=>e.map(x=>x.innerText.replace(/\\s+/g,' ').trim())")
        check("ao tocar, abre a lista detalhada", len(rows) == 4 and "14:00" in rows[0] and "Atrasada" in rows[0], rows)
        check("20:00 fica 'Mais tarde'", any("20:00" in r and "Mais tarde" in r for r in rows), rows)
        check("rondas já feitas aparecem como Feita, sem botão", any("08:00" in r and "Feita" in r and "Iniciar" not in r for r in rows), rows)
        check("aria-expanded acompanha o estado", page.get_attribute(".pend-h", "aria-expanded") == "true")
        page.click(".pend-h"); page.wait_for_timeout(100)
        check("toca de novo e recolhe", page.locator(".pend-l").count() == 0)
        page.click(".pend-h"); page.wait_for_selector(".pend-l")
        page.click(".pend-l li:first-child [data-act=pickRonda]"); page.wait_for_selector(".rhead")
        check("botão Iniciar da pendência abre a ronda certa", "Ronda UTI" in page.inner_text("h1"))
        # ---------- 2) repetição ----------
        r = page.evaluate("(()=>{const n=RH.S.ncs;const g=id=>RH.recorr(n.find(x=>x.id===id)).n;return [g('n1'),g('n2'),g('n3'),g('n4'),g('n5')]})()")
        check("contagem de ocorrências em 30 dias por NC", r == [1,2,3,1,1], r)
        page.click("#nav [data-p=ncs]"); page.wait_for_selector(".nct")
        page.click("[data-act=ncStatus][data-v=todas]"); page.wait_for_timeout(200)
        sel = page.eval_on_selector_all(".nct .rep", "e=>e.map(x=>x.innerText)")
        check("selo 'Repetida ×3' na tabela, e só onde se repete", "↻ Repetida ×3" in sel and "↻ Repetida ×2" in sel and len(sel) == 2, sel)
        page.click(".nct tbody tr:has(.rep:has-text('×3'))"); page.wait_for_selector("#f-nc")
        check("NC repetida mostra a explicação no detalhe", "3ª ocorrência" in page.inner_text(".rep-box"), page.inner_text("#f-nc")[:200])
        page.keyboard.press("Escape")
        page.click("#nav [data-p=painel]"); page.wait_for_selector(".kpis")
        page.select_option("[data-set='F:periodo']", "90"); page.wait_for_timeout(300)
        cardt = page.inner_text("[data-card=repet]")
        check("painel lista o problema que se repete", "Alarme" in cardt and "4" in cardt, cardt)
        # ---------- 1) aviso imediato ----------
        calls = []
        page.route("https://api.github.com/**", lambda route: (calls.append((route.request.url, route.request.method, route.request.headers.get("authorization"), route.request.post_data)), route.fulfill(status=204, body="")))
        page.evaluate("RH.avisoAgora()"); page.wait_for_timeout(300)
        check("sem configuração, não chama o GitHub", len(calls) == 0, calls)
        page.evaluate("RH.put('config','main',{...RH.S.cfg,avisos:{ativo:true,sevMin:3,repo:'rondaliga/ronda',ref:'main',ghToken:'tok123'}})"); page.wait_for_timeout(400)
        page.evaluate("RH.avisoAgora()"); page.wait_for_timeout(400)
        check("configurado, dispara o workflow no GitHub", len(calls) == 1 and calls[0][0].endswith("/repos/rondaliga/ronda/actions/workflows/avisos-email.yml/dispatches") and calls[0][1] == "POST" and calls[0][2] == "Bearer tok123" and json.loads(calls[0][3]) == {"ref": "main"}, calls)
        page.evaluate("RH.avisoAgora()"); page.wait_for_timeout(300)
        check("não dispara de novo em menos de 30 s", len(calls) == 1, len(calls))
        page.evaluate("RH.put('config','main',{...RH.S.cfg,avisos:{ativo:false,repo:'rondaliga/ronda',ghToken:'tok123'}})"); page.wait_for_timeout(300)
        page.evaluate("RH.avisoAgora.t=0;RH.avisoAgora()"); page.wait_for_timeout(300)
        check("com os avisos desligados não dispara", len(calls) == 1, len(calls))
        b.close()

if __name__ == "__main__": main()
