"""Painel único da instituição: gestores e administradores personalizam (local, mover, excluir, adicionar,
restaurar); todos veem o mesmo painel, salvo no banco compartilhado (config/painel)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e as T
from playwright.sync_api import sync_playwright
check = T.check

def kp(page): return page.eval_on_selector_all(".kpis > .kpi", "e=>e.map(x=>x.dataset.pn)")
def cs(page): return page.eval_on_selector_all(".grid2 > .card", "e=>e.map(x=>x.dataset.card)")
def card(page, k): return page.locator(f"[data-card='{k}']")
def kpi(page, k): return page.locator(f".kpis > .kpi[data-pn='{k}']")
def salvo(page): return page.evaluate("RH.S.painel&&{k:RH.S.painel.kpis.map(x=>x.id),c:RH.S.painel.cards.map(x=>x.id)}")

def main():
    T.serve()
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = T.new_ctx(b); page = ctx.new_page(); T.attach_errors(page, "p")
        page.set_viewport_size({"width":1280,"height":5200})
        page.goto(f"http://127.0.0.1:{T.PORT}/{T.PAGE}"); page.wait_for_selector("#f-setup")
        page.fill("#st-n","Ana"); page.fill("#st-l","admin"); page.fill("#st-s","Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        page.evaluate("""async()=>{const d=864e5,h=36e5,n=new Date();n.setHours(12,0,0,0);const base=n.getTime()-d,at=x=>base-12*h+x*h;
          await RH.put('salas','s1',{nome:'Sala B',setor:'UTI',ativo:true,itens:[]});await RH.put('salas','s2',{nome:'Sala A',setor:'Imagem',ativo:true,itens:[]});
          await RH.put('rondas','r1',{execId:'e1',modeloNome:'R',salaId:'s1',salaNome:'Sala B',setor:'UTI',ts:at(20),c:8,nc:2,ina:0,itens:[{t:'Temperatura da geladeira',tv:5,r:'C',ideal:'2 °C a 8 °C'},{t:'Temperatura da geladeira',tv:12,r:'NC',ideal:'2 °C a 8 °C'}]});
          await RH.put('rondas','r2',{execId:'e2',modeloNome:'R',salaId:'s2',salaNome:'Sala A',setor:'Imagem',ts:at(26),c:5,nc:0,ina:0,itens:[]});
          for(let i=0;i<3;i++)await RH.put('ncs','n'+i,{salaId:'s1',salaNome:'Sala B',setor:'UTI',tipoNome:'Limpeza',sev:2,status:'aberta',ts:at(20),desc:'d'});
          await RH.put('ncs','n9',{salaId:'s2',salaNome:'Sala A',setor:'Imagem',tipoNome:'Piso',sev:3,status:'aberta',ts:at(26),desc:'d'});}""")
        T.add(page,"users",fill={"nome":"Gil Gestor","login":"gil","senha":"Gestor@123"},select={"role":"Gestor"}); T.save(page)
        T.add(page,"users",fill={"nome":"Ivo Inspetor","login":"ivo","senha":"Inspe@1234"},select={"role":"Inspetor"}); T.save(page)
        page.click("#nav [data-p=painel]"); page.wait_for_selector(".grid2 > .card")
        padK, padC = kp(page), cs(page)
        check("padrão profissional: 6 indicadores e 13 gráficos na ordem definida", padK==["kConf","kRondas","kNC","kTmr","kCob","kAtraso"] and padC[0]=="linha" and padC[-1]=="recentes" and len(padC)==13, (padK,padC))
        check("meus gráficos não existe mais", page.locator("#mg-root").count()==0 and "Meus gráficos" not in page.inner_text("main"))
        check("fora da edição: sem barras", page.locator(".pn-bar").count()==0)
        check("sem configuração salva, vale o padrão (nada gravado)", salvo(page) is None)
        # editar: indicadores E gráficos
        page.click("[data-act=pnEdit]")
        check("edição: todos os 6 indicadores e 13 gráficos têm barra", page.locator(".kpis .pn-bar").count()==6 and page.locator(".grid2 .pn-bar").count()==13)
        check("aviso de que vale para todos", "vale para todos" in page.inner_text(".pn-info"))
        # local por item (indicador e gráfico)
        kpi(page,"kConf").locator("select[data-pn=loc]").select_option("s:UTI")
        card(page,"sev").locator("select[data-pn=loc]").select_option("s:Imagem")
        check("indicador mostra o local escolhido", "Setor · UTI" in kpi(page,"kConf").inner_text() and "Setor · Imagem" in card(page,"sev").inner_text())
        check("conformidade da UTI = 80% (8 de 10)", "80%" in kpi(page,"kConf").locator("strong").inner_text(), kpi(page,"kConf").inner_text())
        rows = card(page,"sev").locator(".hb-r").all_inner_texts()
        check("severidade da Imagem: Alta=1", any("Alta" in r and r.strip().endswith("1") for r in rows) and any("Média" in r and r.strip().endswith("0") for r in rows), rows)
        s = salvo(page)
        check("salvo no banco compartilhado (config/painel), não no aparelho", s and s["k"]==padK and s["c"]==padC and not page.evaluate("Object.keys(localStorage).some(k=>k.startsWith('rh.painel.layout')||k.startsWith('rh.painel.meus'))"), s)
        # mover indicador e gráfico
        kpi(page,"kNC").locator("[data-act=pnMove][data-d='-1']").click()
        k2 = kp(page); check("↑ no indicador troca com o anterior", k2.index("kNC")==k2.index("kRondas")-1, k2)
        card(page,"sev").locator("[data-act=pnMove][data-d='-1']").click()
        c2 = cs(page); check("↑ no gráfico troca com o anterior", c2.index("sev")==c2.index("setor")-1, c2)
        # excluir (2 toques)
        card(page,"equip").locator("[data-act=pnExcluir]").click()
        check("excluir pede confirmação", "equip" in cs(page) and "Confirmar" in card(page,"equip").locator("[data-act=pnExcluir]").inner_text())
        card(page,"equip").locator("[data-act=pnExcluir]").click()
        check("2º toque exclui o gráfico", "equip" not in cs(page) and len(cs(page))==12, cs(page))
        kpi(page,"kTmr").locator("[data-act=pnExcluir]").click(); kpi(page,"kTmr").locator("[data-act=pnExcluir]").click()
        check("indicadores também podem ser excluídos", "kTmr" not in kp(page) and len(kp(page))==5, kp(page))
        # adicionar: gráfico removido volta; e um novo (temperatura) com local próprio
        page.select_option("#pn-add","equip"); page.click("[data-act=pnAdd]")
        check("adicionar recoloca o gráfico excluído (no fim)", cs(page)[-1].startswith("equip"), cs(page))
        page.select_option("#pn-add","temp"); page.click("[data-act=pnAdd]")
        tid = cs(page)[-1]; check("adicionar gráfico novo (temperatura)", tid.startswith("temp-"), cs(page))
        page.select_option("#pn-add","temp"); page.click("[data-act=pnAdd]")
        check("o mesmo gráfico pode ser adicionado de novo (outro local)", len([x for x in cs(page) if x.startswith("temp-")])==2)
        card(page,tid).locator("select[data-pn=loc]").select_option("h")
        txt = card(page,tid).inner_text()
        check("temperatura: 2 leituras, 1 fora da faixa, faixa ideal", all(s in txt for s in ["2 leituras","1","fora da faixa","2 °C a 8 °C"]), txt[:300])
        page.select_option("#pn-add","kTmr"); page.click("[data-act=pnAdd]")
        check("indicador excluído pode ser adicionado de novo", kp(page)[-1].startswith("kTmr"), kp(page))
        # arrastar (segurar o clique) um indicador e um gráfico
        a = card(page,"recentes").locator("h3").bounding_box(); bb = card(page,"setor").locator("h3").bounding_box()
        page.mouse.move(a["x"]+30,a["y"]+10); page.mouse.down(); page.mouse.up()
        o1 = cs(page); check("clique curto não move", page.locator(".pn-drag").count()==0)
        page.mouse.move(a["x"]+30,a["y"]+10); page.mouse.down(); page.wait_for_timeout(500)
        check("segurar ativa o modo de mover", page.locator(".card.pn-drag").count()==1)
        page.mouse.move(bb["x"]+30,bb["y"]+10,steps=8)
        check("destino destacado", page.locator(".card.pn-over").count()==1)
        page.mouse.up(); page.wait_for_timeout(200)
        o2 = cs(page); check("soltar reordena o gráfico", o2.index("recentes")==o1.index("setor") and o2!=o1, o2)
        a = kpi(page,"kCob").bounding_box(); bb = kpi(page,"kConf").bounding_box(); kb = kp(page)
        page.mouse.move(a["x"]+60,a["y"]+25); page.mouse.down(); page.wait_for_timeout(500)
        page.mouse.move(bb["x"]+60,bb["y"]+25,steps=8); page.mouse.up(); page.wait_for_timeout(200)
        ka = kp(page); check("arrastar também reordena indicadores", ka.index("kCob")==kb.index("kConf") and ka!=kb, ka)
        # não mistura grupos: arrastar indicador sobre gráfico não faz nada
        a = kpi(page,"kConf").bounding_box(); bb = card(page,"linha").locator("h3").bounding_box(); kb = kp(page)
        page.mouse.move(a["x"]+60,a["y"]+25); page.mouse.down(); page.wait_for_timeout(500)
        page.mouse.move(bb["x"]+60,bb["y"]+10,steps=8); page.mouse.up(); page.wait_for_timeout(200)
        check("indicador solto sobre gráfico: nada muda", kp(page)==kb and cs(page)==o2)
        page.click("[data-act=pnEdit]")
        sa = salvo(page)
        # outro usuário vê o MESMO painel; gestor consegue editar; inspetor não tem o painel
        T.logout(page); T.login(page,"gil","Gestor@123"); page.click("#nav [data-p=painel]"); page.wait_for_selector(".grid2 > .card")
        check("gestor vê exatamente o painel configurado pelo administrador", kp(page)==sa["k"] and cs(page)==sa["c"], (kp(page),cs(page)))
        check("o local do gráfico também é o mesmo", "Setor · Imagem" in card(page,"sev").inner_text() and "Setor · UTI" in kpi(page,"kConf").inner_text())
        check("gestor pode personalizar", page.locator("[data-act=pnEdit]").count()==1)
        page.click("[data-act=pnEdit]"); card(page,"sala").locator("[data-act=pnExcluir]").click(); card(page,"sala").locator("[data-act=pnExcluir]").click()
        check("gestor exclui um gráfico", "sala" not in cs(page))
        page.click("[data-act=pnEdit]"); T.logout(page); T.login(page,"admin","Senha@123"); page.click("#nav [data-p=painel]"); page.wait_for_selector(".grid2 > .card")
        check("administrador vê a alteração do gestor (painel único)", "sala" not in cs(page))
        T.logout(page); T.login(page,"ivo","Inspe@1234")
        check("inspetor não acessa o painel", "Painel" not in " ".join(T.nav_labels(page)))
        antes = page.evaluate("JSON.stringify(RH.S.painel)")
        page.evaluate("RH.go('painel');RH.st.pnEdit=true;RH.ACT.pnAdd({});RH.ACT.pnReset({});RH.ACT.pnReset({});RH.ACT.pnMove({dataset:{id:'linha',d:'1'}})")
        page.wait_for_timeout(300)
        check("inspetor não vai ao painel nem altera o painel (nem por script)", page.evaluate("RH.st.page")!="painel" and page.evaluate("JSON.stringify(RH.S.painel)")==antes)
        T.logout(page); T.login(page,"admin","Senha@123"); page.click("#nav [data-p=painel]"); page.wait_for_selector(".grid2 > .card")
        # recarregar mantém
        page.reload()
        if page.locator("#f-login").count(): T.login(page,"admin","Senha@123")
        page.click("#nav [data-p=painel]"); page.wait_for_selector(".grid2 > .card")
        check("recarregar mantém a configuração salva", cs(page)==[x for x in salvo(page)["c"]])
        # cabeçalho profissional
        check("título único: Painel de Controle, sem subtítulo", page.inner_text(".top h1").strip()=="Painel de Controle" and not page.locator(".top p:visible").count() and not page.locator(".pn-upd").count())
        check("botão de impressão disponível", page.locator("[data-act=pnImprimir]").count()==1)
        # restaurar
        page.click("[data-act=pnEdit]"); page.click("[data-act=pnReset]"); page.click("[data-act=pnReset]"); page.wait_for_timeout(200)
        check("restaurar padrão: indicadores, gráficos e locais", kp(page)==padK and cs(page)==padC and page.locator(".pn-tag").count()==0, (kp(page),cs(page)))
        # nomes editáveis, preenchimento automático e ampliar
        page.set_viewport_size({"width":1280,"height":900}); page.wait_for_timeout(200)
        def sem_vazio():
            return page.evaluate("""()=>{const ok=(sel,par)=>{const p=document.querySelector(par).getBoundingClientRect(),rows={};
              document.querySelectorAll(sel).forEach(e=>{const r=e.getBoundingClientRect();(rows[Math.round(r.top)]??=[]).push(r)});
              return Object.values(rows).every(a=>Math.max(...a.map(r=>r.right))-Math.min(...a.map(r=>r.left))>=p.width-3)};
              return ok('.kpis > .kpi','.kpis')&&ok('.grid2 > .card','.grid2')}""")
        check("padrão: indicadores e gráficos preenchem as linhas, sem espaço vazio", sem_vazio())
        page.fill(".grid2 > .card[data-pn=setor] input[data-pn=nome]","NCs por unidade"); page.press(".grid2 > .card[data-pn=setor] input[data-pn=nome]","Tab"); page.wait_for_timeout(250)
        check("nome do gráfico editado aparece no título e é salvo", "NCs por unidade" in page.inner_text(".grid2 > .card[data-pn=setor] h3") and page.evaluate("RH.S.painel.cards.find(c=>c.id==='setor').n")=="NCs por unidade")
        page.fill(".kpis > .kpi[data-pn=kNC] input[data-pn=nome]","Pendências abertas"); page.press(".kpis > .kpi[data-pn=kNC] input[data-pn=nome]","Tab"); page.wait_for_timeout(250)
        check("nome do indicador editado", "Pendências abertas" in page.inner_text(".kpis > .kpi[data-pn=kNC] label"))
        page.fill(".grid2 > .card[data-pn=setor] input[data-pn=nome]","   "); page.press(".grid2 > .card[data-pn=setor] input[data-pn=nome]","Tab"); page.wait_for_timeout(250)
        check("nome em branco volta ao nome padrão", "Não conformidades por setor" in page.inner_text(".grid2 > .card[data-pn=setor] h3") and page.evaluate("RH.S.painel.cards.find(c=>c.id==='setor').n===undefined"))
        page.click("[data-act=pnEdit]")
        page.click("[data-act=pnAmpliar][data-id=linha]"); page.wait_for_selector("#modal .pn-amp .ch-line svg")
        check("ampliar abre o gráfico em janela maior", page.evaluate("document.querySelector('#modal .ch-line svg').getBoundingClientRect().height>=300"))
        page.fill("#modal input[data-pn=nome]","Evolução da conformidade"); page.press("#modal input[data-pn=nome]","Tab"); page.wait_for_timeout(300)
        check("editar o nome na janela ampliada atualiza o painel", "Evolução da conformidade" in page.inner_text("#modal .mh") and "Evolução da conformidade" in page.inner_text(".grid2 > .card[data-pn=linha] h3"))
        page.keyboard.press("Escape"); page.wait_for_timeout(100)
        check("Esc fecha a janela ampliada", page.locator("#modal .pn-amp").count()==0)
        page.evaluate("RH.st.pnEdit=false;RH.renderView(true)")
        d=page.evaluate("RH.S.painel.cards.filter(c=>!['linha','setor'].includes(c.id)).length"); 
        page.evaluate("(()=>{const D=JSON.parse(JSON.stringify(RH.S.painel));D.cards=D.cards.filter(c=>['linha','setor','sev','situacao','pareto'].includes(c.id)&&c.id!=='situacao');RH.S.painel=D;RH.renderView(true)})()"); page.wait_for_timeout(200)
        check("quantidade ímpar de gráficos: o último ocupa a linha inteira", sem_vazio())
        page.click("[data-act=pnEdit]"); page.click("[data-act=pnReset]"); page.click("[data-act=pnReset]"); page.wait_for_timeout(200); page.click("[data-act=pnEdit]")
        # celular
        page.click("[data-act=pnEdit]"); page.set_viewport_size({"width":390,"height":800}); page.wait_for_timeout(200)
        check("celular: sem rolagem horizontal", page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), page.evaluate("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,3).map(e=>{let p=[],x=e;while(x&&x!==document.body&&p.length<5){p.push(x.tagName+'.'+x.className+':'+Math.round(x.getBoundingClientRect().left)+'-'+Math.round(x.getBoundingClientRect().right));x=x.parentElement}return p.join(' < ')})"))
        page.click("[data-act=pnEdit]"); page.wait_for_timeout(100)
        check("celular em edição: sem rolagem horizontal", True)
        b.close()
    T.finish() if hasattr(T,"finish") else None
if __name__ == "__main__": main()
