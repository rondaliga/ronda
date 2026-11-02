"""
Gera UM único arquivo HTML (css e js embutidos) a partir de index.html.
Útil se você preferir publicar só um arquivo no lugar da pasta inteira.

Uso:
    python3 tools/gerar-arquivo-unico.py                 -> dist/ronda-hospitalar.html
    python3 tools/gerar-arquivo-unico.py --sem-config    -> igual, mas sem as chaves do Supabase (para testes)
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sem_config = "--sem-config" in sys.argv
html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()

def ler(rel):
    rel = rel.split("?")[0]
    return open(os.path.join(ROOT, rel), encoding="utf-8").read()

def css(m):
    return "<style>\n" + ler(m.group(1)) + "\n</style>"

def js(m):
    src = m.group(1)
    code = "window.RONDA_CONFIG={supabaseUrl:'',supabaseKey:''};" if (sem_config and src.startswith("js/config.js")) else ler(src)
    return "<script>\n" + code.replace("</script", "<\\/script") + "\n</script>"

html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', css, html)
html = re.sub(r'<script src="(js/[^"]+)"></script>', js, html)
assert 'src="js/' not in html and 'href="css/' not in html, "sobrou referência a arquivo local"

dest = os.path.join(ROOT, "dist", "ronda-hospitalar-teste.html" if sem_config else "ronda-hospitalar.html")
os.makedirs(os.path.dirname(dest), exist_ok=True)
open(dest, "w", encoding="utf-8").write(html)
print(dest, f"({len(html)//1024} KB)")
