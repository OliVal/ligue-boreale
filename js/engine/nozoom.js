// La fenêtre du jeu ne doit jamais se mettre à zoomer : on bloque le zoom du navigateur pendant le jeu et dans les menus.
//   - téléphone et tablette : pincer à deux doigts, double toucher, zoom automatique de Safari sur les champs de texte
//   - ordinateur : Ctrl + molette (et pincer sur le pavé tactile), Ctrl + « + », « − » ou « 0 »
// Si la page est quand même zoomée (Safari ignore parfois l'interdiction), on la remet à sa taille normale tout seul.
// Pour agrandir l'affichage, il reste Options → Taille de l'interface.

const ZOOM_KEYS = ['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Digit0', 'Numpad0'];

export function lockZoom() {
  // ordinateur : Ctrl + molette, pincer sur le pavé tactile (le navigateur le transmet comme Ctrl + molette)
  addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
  // ordinateur : Ctrl + « + », « − », « 0 »
  addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ZOOM_KEYS.includes(e.code)) e.preventDefault(); }, true);
  // iPhone et iPad : gestes de zoom de Safari
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  // pincer à deux doigts (les deux pouces sur l'écran en jouant) : on empêche le zoom, les contrôles du jeu continuent de fonctionner
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });

  // remettre la page à sa taille normale si elle a quand même été zoomée
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  const base = meta.getAttribute('content');
  let busy = false;
  const reset = () => {
    if (busy) return;
    busy = true;
    // changer la balise viewport force Safari à recalculer l'échelle (retour à 1), puis on remet la valeur d'origine
    meta.setAttribute('content', base + ', minimum-scale=1');
    setTimeout(() => { meta.setAttribute('content', base); busy = false; }, 60);
  };
  const vv = window.visualViewport;
  if (vv) vv.addEventListener('resize', () => { if (vv.scale > 1.01) reset(); });
  // Safari zoome sur un champ de texte ou une liste : on dézoome en le quittant
  document.addEventListener('focusout', (e) => { if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) setTimeout(reset, 80); });
  addEventListener('orientationchange', () => setTimeout(reset, 300));
}
