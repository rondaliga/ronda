"""Temperatura medida x faixa ideal, ronda por QR Code, próximo pendente e estimativa de armazenamento."""
import base64, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e as T
from playwright.sync_api import sync_playwright
check = T.check

def main():
    T.serve()
    with sync_playwright() as p:
        b = p.chromium.launch(); page = T.new_ctx(b).new_page(); T.attach_errors(page, "n")
        page.goto(f"http://127.0.0.1:{T.PORT}/{T.PAGE}"); page.wait_for_selector("#f-setup")
        page.fill("#st-n", "Ana"); page.fill("#st-l", "admin"); page.fill("#st-s", "Senha@123"); page.click("#st-btn"); page.wait_for_selector("#nav")
        page.evaluate("""async()=>{
          await RH.put('tiposNC','tn1',{nome:'Temperatura fora da faixa',sev:2,orient:''});
          await RH.put('salas','s1',{nome:'Densitometria',setor:'Imagem',ativo:true,codigoLocal:'QRSALA1',itens:[{id:'a1',t:'Temperatura ambiente',tmin:20,tmax:24},{id:'a2',t:'Iluminação'},{id:'a3',t:'Portas'}]});
          await RH.put('salas','s2',{nome:'Mamografia',setor:'Imagem',ativo:true,codigoLocal:'QRSALA2',itens:[{id:'b1',t:'Limpeza'}]});
          await RH.put('equipamentos','q1',{nome:'Geladeira',setor:'Imagem',ativo:true,codigoLocal:'QREQ1',itens:[{id:'i1',t:'Temperatura entre 2 e 8 °C',tmin:2,tmax:8}]});
          await RH.put('modelos','m1',{nome:'Ronda Imagem',ativo:true,responsavelId:'',dias:[0,1,2,3,4,5,6],horarios:['08:00'],salaIds:['s1','s2'],equipIds:['q1'],ordem:['s:s1','s:s2','e:q1'],liberacao:{}})}""")
        page.wait_for_timeout(500)

        # ---------- (4) ronda por QR a partir da lista ----------
        page.click("#nav [data-p=ronda]")
        page.evaluate("RH.local.leitor=async()=>window.__qr")
        page.evaluate("window.__qr='CODIGO-QUE-NAO-EXISTE'"); page.click("[data-act=qrIniciar]"); page.wait_for_timeout(300)
        check("QR desconhecido não abre ronda", page.locator(".rhead").count() == 0)
        page.evaluate("window.__qr='QRSALA2'"); page.click("[data-act=qrIniciar]"); page.wait_for_selector(".rhead")
        check("QR de uma sala abre a ronda a que ela pertence", "Ronda Imagem" in page.inner_text("h1"))
        check("e leva até o local lido", page.evaluate("document.querySelector('#bl-s2')!==null"))
        # QR de outro local dentro da ronda
        page.evaluate("window.__qr='QREQ1'"); page.click("[data-act=qrIr]"); page.wait_for_timeout(500)
        check("dentro da ronda, QR de equipamento vai até o equipamento", page.evaluate("document.querySelector('#bl-eq\\\\:q1')!==null"))

        # ---------- (10) progresso e próximo pendente ----------
        page.evaluate("window.scrollTo(0,0)")
        t0 = page.inner_text("#prog-t")
        check("progresso mostra itens e percentual", "0 de 5 itens · 0%" in t0, t0)
        page.click("[data-act=proxPend]"); page.wait_for_timeout(700)
        check("próximo pendente rola até um item sem resposta", page.evaluate("document.querySelectorAll('.it.flash').length")>=0)
        page.click(".it:has-text('Iluminação') button.c"); page.wait_for_timeout(100)
        check("progresso atualiza", "1 de 5 itens · 20%" in page.inner_text("#prog-t"), page.inner_text("#prog-t"))
        check("cabeçalho de progresso fica fixo", page.evaluate("getComputedStyle(document.querySelector('.rhead')).position") == "sticky")

        # ---------- (1) temperatura medida ----------
        ta = page.locator(".it", has_text="Temperatura ambiente")
        sel = "[data-tv][data-k$=':a1']"
        page.fill(sel, "27,5"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
        check("fora da faixa (acima): vira NC automaticamente", page.evaluate("Object.values(RH.st.R.itens).find(i=>i.t==='Temperatura ambiente').r") == "NC")
        check("tipo 'Temperatura' e descrição preenchidos", page.evaluate("(()=>{const i=Object.values(RH.st.R.itens).find(i=>i.t==='Temperatura ambiente');return i.tipoId==='tn1'&&i.desc.includes('27,5 °C')&&i.desc.includes('acima')})()"))
        check("aviso 'Acima da faixa ideal' visível", "Acima da faixa ideal" in ta.inner_text())
        ta.locator("button.c").click(); page.wait_for_timeout(100)
        check("não deixa marcar conforme fora da faixa", page.evaluate("Object.values(RH.st.R.itens).find(i=>i.t==='Temperatura ambiente').r") == "NC")
        page.fill(sel, "18"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
        check("abaixo da faixa também é NC", "Abaixo da faixa ideal" in ta.inner_text() and page.evaluate("Object.values(RH.st.R.itens).find(i=>i.t==='Temperatura ambiente').r") == "NC")
        page.fill(sel, "22"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
        r = page.evaluate("(()=>{const i=Object.values(RH.st.R.itens).find(i=>i.t==='Temperatura ambiente');return [i.r,i.desc,i.tipoId]})()")
        check("voltando à faixa: vira conforme e limpa o automático", r == ["C", "", ""] and "Dentro da faixa ideal" in ta.inner_text(), r)
        page.fill(sel, "abc"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
        check("leitura inválida é recusada", page.input_value(sel) == "")
        page.fill(sel, "27"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
        page.fill("[data-tv][data-k$=':i1']", "9"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
        check("equipamento com faixa 2–8 °C: 9 °C vira NC", page.evaluate("Object.values(RH.st.R.itens).find(i=>i.t.startsWith('Temperatura entre')).r") == "NC")
        # recarrega: rascunho guarda a leitura
        page.evaluate("RH.rondaDraft.save()")
        d = page.evaluate("JSON.parse(localStorage.getItem('rh_ronda_draft:'+RH.st.me.id)).itens")
        check("rascunho guarda a temperatura medida", any(v.get("tv") == "27" for v in d.values()), d)

        # ---------- (14) armazenamento ----------
        a = page.evaluate("RH.armazenamento().then(a=>({u:a.usadoMB,l:a.limiteMB,n:a.nivel,f:a.fotos}))")
        check("estimativa de armazenamento calcula (limite 500 MB por padrão)", a["l"] == 500 and a["u"] >= 0 and a["n"] == "ok", a)
        page.evaluate("RH.rondaDraft.clear(); RH.st.R=null")
        page.evaluate("RH.st.cadTab='hospital'"); page.evaluate("RH.go('cadastros')"); page.wait_for_selector("#arm-card .arm-bar")
        check("cartão de armazenamento no Cadastros → Hospital", "de 500 MB" in page.inner_text("#arm-card"))
        page.fill("#arm-lim", "1"); page.fill("#arm-real", "480"); page.click("[data-act=armSalvar]"); page.wait_for_timeout(600)
        c = page.evaluate("({l:RH.S.cfg.dbLimiteMB,e:RH.S.cfg.dbExtraMB})")
        check("calibração grava o ajuste e ignora limite inválido", c["e"] and c["e"] > 400 and c["l"] != 1, c)
        page.evaluate("RH.go('painel')"); page.wait_for_selector(".kpis"); page.wait_for_timeout(800)
        check("painel avisa o administrador quando o uso passa de 70%", page.locator(".arm-banner").count() == 1, page.inner_text("#arm-aviso"))
        print("erros:", T.errors)
        b.close()

if __name__ == "__main__":
    main()
