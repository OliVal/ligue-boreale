"""Dessine l'icône de l'application (écran d'accueil du téléphone) : icones/icone-*.png
Usage : python outils/icone.py   (nécessite Pillow : pip install pillow)
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'icones')


def font(size):
    for name in ('arialbi.ttf', 'Arial Bold Italic.ttf', 'DejaVuSans-BoldOblique.ttf', 'segoeuib.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def draw(size, maskable=False):
    S = 1024  # dessin en grand puis réduit (bords lisses)
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle((0, 0, S, S), fill=(8, 18, 36, 255))
    else:
        d.rounded_rectangle((0, 0, S - 1, S - 1), radius=210, fill=(8, 18, 36, 255))
    k = 0.8 if maskable else 1.0  # zone sûre des icônes « maskable »
    c = S / 2

    def P(x, y):
        return (c + (x - 512) * k, c + (y - 512) * k)

    # glace : cercle de mise au jeu
    r = 330 * k
    d.ellipse((c - r, c - r, c + r, c + r), fill=(226, 240, 252, 255), outline=(200, 32, 28, 255), width=int(26 * k))
    d.line([P(512, 182), P(512, 842)], fill=(200, 32, 28, 255), width=int(18 * k))
    # bâton
    d.line([P(360, 250), P(560, 700)], fill=(20, 24, 32, 255), width=int(54 * k))
    d.line([P(548, 690), P(700, 720)], fill=(20, 24, 32, 255), width=int(60 * k))
    # rondelle
    d.ellipse([*P(700, 600), *P(800, 650)], fill=(10, 10, 12, 255))
    # lettres
    f = font(int(230 * k))
    d.text(P(512, 400), 'LB', font=f, fill=(53, 200, 255, 255), anchor='mm', stroke_width=int(12 * k), stroke_fill=(8, 18, 36, 255))
    return im.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for s in (180, 192, 512):
        draw(s).save(os.path.join(OUT, f'icone-{s}.png'))
    draw(512, maskable=True).save(os.path.join(OUT, 'icone-maskable-512.png'))
    print('icônes écrites dans', OUT)


if __name__ == '__main__':
    main()
