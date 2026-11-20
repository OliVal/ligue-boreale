"""Assemble tout le jeu dans un seul fichier : LigueBoreale.html
Ce fichier s'ouvre d'un double-clic (sans Python ni serveur) et peut être envoyé à un ami.
Usage : python outils/bundle.py
        python outils/bundle.py --mobile mobile   (dossier à publier : index.html, manifeste, icônes, service worker)
"""
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'LigueBoreale.html')


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def main():
    mods = {}
    for d, _, files in os.walk(os.path.join(ROOT, 'js')):
        for name in sorted(files):
            if name.endswith('.js'):
                rel = os.path.relpath(os.path.join(d, name), ROOT).replace('\\', '/')
                mods[rel] = read(rel)
    html = read('index.html')
    css = read('css/style.css')
    # Les modules sont chargés depuis le fichier lui-même : chaque import relatif est remplacé par une adresse blob:
    loader = r"""<script type="application/json" id="mods">__MODS__</script>
  <script type="module">
    const S = JSON.parse(document.getElementById('mods').textContent), urls = {};
    const norm = (base, rel) => {
      const out = base.split('/').slice(0, -1);
      for (const x of rel.split('/')) { if (x === '..') out.pop(); else if (x !== '.') out.push(x); }
      return out.join('/');
    };
    const url = (p, seen = []) => {
      if (urls[p]) return urls[p];
      if (!(p in S)) throw new Error('Module introuvable : ' + p);
      if (seen.includes(p)) throw new Error('Import circulaire : ' + seen.concat(p).join(' -> '));
      const src = S[p].replace(/(\bfrom\s*|\bimport\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (m, a, q, rel) => a + q + url(norm(p, rel), seen.concat(p)) + q);
      return (urls[p] = URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    };
    if (!(HTMLScriptElement.supports && HTMLScriptElement.supports('importmap'))) throw new Error('navigateur trop ancien');
    import(url('js/main.js')).catch((e) => { const b = document.getElementById('boot'); if (b) b.remove(); document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:40% 0 auto;text-align:center;color:#fff;font:18px sans-serif">Le jeu n\'a pas pu démarrer. Vérifie ta connexion Internet (la 3D se charge en ligne).<br><small>' + e.message + '</small></p>'); });
  </script>"""
    data = json.dumps(mods, ensure_ascii=False).replace('</', '<\\/')
    loader = loader.replace('__MODS__', data)
    html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>')
    html, n = re.subn(r'<script type="module" src="js/main.js"></script>', lambda m: loader, html)
    assert n == 1, 'balise du module principal introuvable'
    out = OUT
    if '--mobile' in sys.argv:  # version application web : la page et ses fichiers d'installation dans un dossier
        i = sys.argv.index('--mobile')
        d = os.path.join(ROOT, sys.argv[i + 1] if len(sys.argv) > i + 1 else 'mobile')
        os.makedirs(os.path.join(d, 'icones'), exist_ok=True)
        for rel in ['manifest.webmanifest', 'sw.js'] + ['icones/' + n for n in os.listdir(os.path.join(ROOT, 'icones'))]:
            shutil.copyfile(os.path.join(ROOT, rel), os.path.join(d, rel))
        out = os.path.join(d, 'index.html')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print(f'{os.path.relpath(out, ROOT)} : {len(mods)} modules, {os.path.getsize(out) // 1024} Ko')


if __name__ == '__main__':
    main()
