// Audio entièrement généré (Web Audio) : patins, lancers, poteaux, bandes, mises en échec, sifflet, klaxon, foule
export class Audio {
  constructor(settings) { this.set = settings; this.ctx = null; this.excite = 0; this.skate = 0; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.set.volume; this.master.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // foule : bruit filtré en boucle dont le volume suit l'intensité
    const mkLoop = (freq, q) => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
      return { g, f };
    };
    this.crowd = mkLoop(520, 0.5); this.crowdHi = mkLoop(1500, 0.8); this.skateN = mkLoop(4200, 1.6);
    this.loadSamples();
  }

  // Vrais enregistrements de foule dans des arénas de la LNH (Freesound, licence CC0, voir sons/LISEZMOI.txt).
  // Chargés en arrière-plan; tant qu'ils ne sont pas prêts (ou sans Internet), les sons fabriqués les remplacent.
  loadSamples() {
    if (this.samples || !this.ctx || typeof fetch === 'undefined') return;
    this.samples = {};
    for (const k of ['but_local', 'entree', 'huees']) {
      fetch(`sons/${k}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((b) => new Promise((ok, ko) => this.ctx.decodeAudioData(b, ok, ko)))
        .then((buf) => { this.samples[k] = buf; }).catch(() => { /* on garde les sons fabriqués */ });
    }
  }

  // joue seulement un passage d'un enregistrement (de « from » à « to » secondes), avec fondu; false s'il n'est pas chargé
  // limit : un limiteur évite que les pics grésillent quand on monte beaucoup le volume
  clip(name, from, to, vol, fadeIn = 0.25, fadeOut = 1, limit = false) {
    const buf = this.samples && this.samples[name], c = this.ctx;
    if (!buf || !c) return false;
    const t = c.currentTime, dur = Math.min(to, buf.duration) - from;
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + fadeIn);
    g.gain.setValueAtTime(vol, t + Math.max(fadeIn, dur - fadeOut)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(g);
    if (limit) {
      const k = c.createDynamicsCompressor();
      k.threshold.value = -5; k.knee.value = 2; k.ratio.value = 16; k.attack.value = 0.002; k.release.value = 0.15;
      g.connect(k); k.connect(this.master);
    } else g.connect(this.master);
    s.start(t, from, dur);
    return true;
  }

  // cérémonie : la foule hue les visiteurs, puis acclame l'équipe locale
  entryBoo() { const k = this.playoff ? 1.4 : 1; if (!this.clip('huees', 18, 22, 0.8 * k, 0.3, 1.2, this.playoff)) this.boo(3.4, 0.45 * k); }
  entryCheer() { const k = this.playoff ? 1.4 : 1; if (!this.clip('entree', 0, 9, 3.4 * k, 0.5, 2, true)) this.cheer(true); } // bien plus fort que les huées des visiteurs

  setVolume(v) { if (this.master) this.master.gain.value = v; }

  burst(freq, dur, vol, type = 'bandpass', q = 1, delay = 0) {
    const c = this.ctx; if (!c) return;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); const t = c.currentTime + delay;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  tone(freq, dur, vol, type = 'sine', slide = 0, delay = 0) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  // mélodie (hymnes de la cérémonie d'avant-match) : notes [MIDI, temps], son de cuivres doux
  melody(notes, bpm, vol = 0.1) {
    const c = this.ctx; if (!c) return;
    this.stopMelody();
    const spb = 60 / bpm; let t = c.currentTime + 0.05;
    this.mel = [];
    for (const [n, beats] of notes) {
      const f = 440 * 2 ** ((n - 69) / 12), d = beats * spb;
      for (const [mul, type, v] of [[1, 'sawtooth', vol * 0.45], [1, 'triangle', vol], [0.5, 'triangle', vol * 0.55]]) {
        const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
        fl.type = 'lowpass'; fl.frequency.value = 1700;
        o.type = type; o.frequency.setValueAtTime(f * mul, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.05);
        g.gain.setValueAtTime(v * 0.85, t + Math.max(0.06, d - 0.12)); g.gain.linearRampToValueAtTime(0.0001, t + d);
        o.connect(fl); fl.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + 0.05);
        this.mel.push(o);
      }
      t += d;
    }
  }
  stopMelody() { if (this.mel) for (const o of this.mel) { try { o.stop(); } catch { /* déjà arrêté */ } } this.mel = null; }

  // clameur de la foule : bruit filtré qui enfle puis retombe
  swell(freq, dur, vol, attack = 0.25, q = 0.6) {
    const c = this.ctx; if (!c) return;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(), t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    f.frequency.setValueAtTime(freq, t); f.frequency.linearRampToValueAtTime(freq * 0.75, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.1);
  }
  roar(big) { this.swell(700, big ? 4.5 : 2, big ? 0.7 : 0.3, 0.3); this.swell(1700, big ? 3.5 : 1.5, big ? 0.3 : 0.12, 0.4, 0.9); }
  ooh() { this.swell(480, 1.1, 0.32, 0.12, 1.4); }
  groan() { this.swell(260, 1.6, 0.22, 0.3, 1.2); }
  // applaudissements rythmés : clap, clap, clap-clap-clap
  claps() {
    const c = this.ctx; if (!c) return;
    for (const d of [0, 0.5, 1.0, 1.25, 1.5, 2.25, 2.75, 3.25, 3.5, 3.75]) setTimeout(() => this.burst(1700, 0.07, 0.28, 'bandpass', 1.2), d * 1000);
  }
  // huées : des dizaines de voix graves sur un « ouuuu » qui descend, avec le souffle de la foule
  boo(dur = 3, vol = 0.4) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(vol, t + 0.4);
    out.gain.setValueAtTime(vol, t + dur * 0.6); out.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.7;
    const vw = c.createBiquadFilter(); vw.type = 'peaking'; vw.frequency.value = 330; vw.gain.value = 9; vw.Q.value = 1.1; // la voyelle « ou »
    lp.connect(vw); vw.connect(out); out.connect(this.master);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(), g = c.createGain(), f0 = 100 + Math.random() * 95, st = t + Math.random() * 0.45;
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 1.07, st); o.frequency.linearRampToValueAtTime(f0, st + 0.45); o.frequency.linearRampToValueAtTime(f0 * 0.88, t + dur);
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 3.5 + Math.random() * 3; lg.gain.value = f0 * 0.018;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.value = 0.55 / n; o.connect(g); g.connect(lp);
      o.start(st); o.stop(t + dur + 0.1); lfo.start(st); lfo.stop(t + dur + 0.1);
    }
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.9;
    const g = c.createGain(); g.gain.value = 0.35;
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.1);
  }
  // applaudissements : des centaines de mains, plus serrés au début
  applause(dur = 3, rate = 25, vol = 0.22) {
    if (!this.ctx) return;
    const n = Math.round(dur * rate);
    for (let i = 0; i < n; i++) {
      const d = dur * Math.pow(Math.random(), 1.5);
      this.burst(1100 + Math.random() * 2200, 0.025 + Math.random() * 0.035, vol * (0.4 + Math.random() * 0.6), 'bandpass', 1.4, d);
    }
  }
  // cris de joie : des « wouhou » qui montent
  whoops(n = 4, dur = 2.5) {
    for (let i = 0; i < n; i++) {
      const f = 420 + Math.random() * 380, d = Math.random() * dur;
      this.tone(f, 0.45 + Math.random() * 0.3, 0.035, 'triangle', f * (0.4 + Math.random() * 0.5), d);
      this.tone(f * 2.01, 0.4, 0.012, 'sine', f * 0.6, d);
    }
  }
  // la foule acclame : clameur, applaudissements et cris
  cheer(big = true) {
    this.roar(big);
    this.applause(big ? 4.5 : 2.5, big ? 30 : 18, big ? 0.24 : 0.16);
    this.whoops(big ? 8 : 3, big ? 3.5 : 2);
  }

  // accords d'orgue montants avant une mise au jeu
  organ() {
    const chords = [[262, 330, 392], [294, 370, 440], [330, 415, 494], [392, 494, 587]];
    chords.forEach((ch, i) => { for (const f of ch) { this.tone(f, i === 3 ? 0.7 : 0.22, 0.07, 'square', 0, i * 0.26); this.tone(f * 2, i === 3 ? 0.7 : 0.22, 0.03, 'triangle', 0, i * 0.26); } });
  }

  horn() { for (const f of [147, 185, 220, 294]) { this.tone(f, 2.2, 0.16, 'sawtooth'); this.tone(f * 1.005, 2.2, 0.1, 'square'); } }
  whistle() { this.tone(2300, 0.45, 0.14, 'square'); this.tone(2420, 0.45, 0.1, 'square'); this.burst(2600, 0.4, 0.08, 'bandpass', 6); }

  onEvent(type, d) {
    if (!this.ctx) return;
    switch (type) {
      case 'shot': this.burst(d.type === 'slap' ? 900 : 1600, 0.12, d.type === 'slap' ? 0.9 : 0.5); if (d.type === 'slap') this.tone(160, 0.1, 0.4, 'triangle', -80); this.excite += 0.15;
        if (d.type === 'slap') { // claquement plus lourd, d'autant plus fort que le lancer est puissant
          const pw = Math.max(0, Math.min(1, ((d.speed || 30) - 24) / 16));
          this.burst(480, 0.2, 0.5 + 0.6 * pw, 'lowpass'); this.tone(95, 0.22, 0.3 + 0.3 * pw, 'triangle', -45); this.burst(3200, 0.05, 0.25 + 0.2 * pw, 'highpass');
        }
        break;
      case 'pass': case 'dump': this.burst(1900, 0.06, 0.25); break;
      case 'gain': this.burst(2400, 0.035, 0.12); break;
      case 'post': this.tone(d.bar ? 1850 : 2100, 0.7, 0.4, 'sine'); this.tone(3350, 0.5, 0.15, 'sine'); this.excite += 0.5; this.ooh(); break;
      case 'miss': this.ooh(); this.excite += 0.2; break;
      case 'breakaway': this.swell(900, 1.6, 0.25, 0.9); this.excite += 0.6; break;
      case 'faceoffSetup': if (Math.random() < 0.22) this.organ(); else if (Math.random() < 0.2) this.claps(); break;
      case 'lastMinute': this.tone(880, 0.25, 0.12, 'square'); break;
      case 'final': this.horn(); this.roar(true); break;
      case 'board': this.burst(d.glass ? 700 : 220, 0.16, Math.min(0.9, d.v / 25), 'lowpass'); break;
      case 'hit': this.burst(140, 0.28, d.weak ? 0.5 : 1, 'lowpass'); this.burst(600, 0.1, 0.3); this.excite += d.big ? 0.6 : 0.25; if (d.big) this.roar(false); break;
      case 'block': this.burst(400, 0.1, 0.5, 'lowpass'); break;
      case 'save': this.burst(d.caught ? 500 : 300, 0.12, 0.6, 'lowpass'); this.excite += 0.4; if (d.onNet) (d.goalie.team.idx === 0 ? this.roar(false) : this.ooh()); break;
      case 'whistle': this.whistle(); break;
      case 'puckDrop': this.burst(1200, 0.05, 0.3); break;
      case 'goal': // la foule appuie l'équipe locale
        // but local : klaxon, la foule crie et applaudit; but des visiteurs : soupir et légères huées
        // en séries, la foule est plus bruyante (limiteur pour que ça ne grésille pas)
        if (!d.team || d.team.idx === 0) { if (!this.clip('but_local', 4, 11, this.playoff ? 1.35 : 0.9, 0.15, 1.5, this.playoff)) { this.horn(); this.cheer(true); } this.excite = this.playoff ? 3 : 2.2; }
        else { if (!this.clip('huees', 18, 22, this.playoff ? 0.85 : 0.6, 0.3, 1.2)) { this.groan(); this.boo(2.4, this.playoff ? 0.32 : 0.22); } this.excite = 0.3; }
        break;
      case 'attemptEnd': if (d.result === 'goal') { this.horn(); this.excite = 2; } else this.excite += 0.5; break;
      case 'periodEnd': this.tone(330, 1.6, 0.25, 'sawtooth'); break;
      case 'punch': this.burst(d.blocked ? 500 : 180, 0.1, 0.8, 'lowpass'); this.excite += 0.2; break;
      case 'fightStart': this.excite = 1.6; break;
      case 'deke': this.burst(5000, 0.12, 0.12, 'highpass'); break;
    }
  }

  // appelé à chaque image : niveau de foule et son des patins
  update(m, dt, menu) {
    if (!this.ctx || !m) return;
    this.excite = Math.max(0, this.excite - dt * 0.45);
    const p = m.puck;
    let danger = 0;
    if (m.state === 'play') danger = Math.max(0, (Math.abs(p.x) - 14) / 14) * 0.35;
    // séries : la foule est plus bruyante (murmure de fond plus fort, réactions plus grosses)
    const po = !menu && m.set && m.set.playoff, L = po ? 1.7 : 1;
    const lvl = ((menu ? 0.03 : 0.06) + Math.min(1, danger + this.excite * 0.5) * (menu ? 0.08 : 0.3)) * L;
    const t = this.ctx.currentTime;
    this.crowd.g.gain.setTargetAtTime(lvl, t, 0.25);
    this.crowdHi.g.gain.setTargetAtTime(Math.min(po ? 0.32 : 0.2, (this.excite + (po ? 0.25 : 0)) * 0.09 * L), t, 0.2);
    const b = m.userBody;
    let sk = 0;
    if (!menu && b && b.active && m.state === 'play') {
      const sp = Math.hypot(b.vx, b.vz);
      const turn = Math.abs(b.ctrl.mx * b.vz - b.ctrl.mz * b.vx) / (sp + 1);
      sk = Math.min(0.1, sp * 0.004 + turn * 0.06) * (0.6 + 0.4 * Math.abs(Math.sin(b.stride * 2.4)));
      // freinage ou virage serré : grattement de lames
      this.scrapeCd = (this.scrapeCd || 0) - dt;
      if (turn > 0.75 && sp > 4.5 && this.scrapeCd <= 0) { this.burst(5200, 0.3, 0.16, 'highpass'); this.scrapeCd = 0.6; }
    }
    this.skateN.g.gain.setTargetAtTime(sk, t, 0.05);
  }
}
