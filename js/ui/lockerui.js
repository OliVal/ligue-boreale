// Écran « Succès et vestiaire » : succès obtenus et choix des objets débloqués
import { ACH, ITEMS, profile, owned, equip, equipped, sourceOf } from '../save/profile.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function locker(ui) {
  const p = profile(), eq = equipped(), done = ACH.filter((a) => p.ach[a.id]).length;
  ui.back = () => ui.main();
  const cat = (k) => `<div class="lcat"><h4>${ITEMS[k].label}</h4>${Object.keys(ITEMS[k].list).map((id) => {
    const it = ITEMS[k].list[id], has = owned(k, id), src = sourceOf(k, id);
    const sw = it.color || it.ice ? `<i class="sw" style="background:${it.color || it.ice}"></i>` : '';
    return `<button data-eq="${k},${id}" class="${eq[k] === id ? 'cur' : ''}" ${has ? '' : 'disabled'}>${sw}${esc(it.name)}${has ? '' : ` <small>🔒 ${esc(src.name)}</small>`}</button>`;
  }).join('')}</div>`;
  ui.show(`<h1>Succès et vestiaire</h1>
    <div class="locker">
      <div class="cbody"><h4>Succès — ${done} sur ${ACH.length}</h4>
        <ul class="achs">${ACH.map((a) => { const it = ITEMS[a.item[0]]; return `<li class="${p.ach[a.id] ? 'ok' : ''}"><b>${p.ach[a.id] ? '🏆' : '🔒'} ${esc(a.name)}</b><span>${esc(a.desc)}</span><em>${it.label} : ${esc(it.list[a.item[1]].name)}</em></li>`; }).join('')}</ul></div>
      <div class="cbody"><h4>Vestiaire</h4><p class="dim">Tes choix s'appliquent à ton équipe dans tous les modes.</p>${Object.keys(ITEMS).map(cat).join('')}</div>
    </div>
    <div class="row"><button data-a="back" data-focus class="primary">Retour</button></div>`, 'career');
  ui.on('[data-eq]', (n) => { const [k, id] = n.dataset.eq.split(','); equip(k, id); locker(ui); const b = ui.el.querySelector(`[data-eq="${k},${id}"]`); if (b) b.focus(); });
  ui.on('[data-a]', () => ui.main());
}
