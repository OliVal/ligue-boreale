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
  }

  setVolume(v) { if (this.master) this.master.gain.value = v; }

  burst(freq, dur, vol, type = 'bandpass', q = 1) {
    const c = this.ctx; if (!c) return;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); const t = c.currentTime;
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
        if (!d.team || d.team.idx === 0) { this.horn(); this.roar(true); this.excite = 2.2; } else { this.groan(); this.excite = 0.3; }
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
    const lvl = (menu ? 0.03 : 0.06) + Math.min(1, danger + this.excite * 0.5) * (menu ? 0.08 : 0.3);
    const t = this.ctx.currentTime;
    this.crowd.g.gain.setTargetAtTime(lvl, t, 0.25);
    this.crowdHi.g.gain.setTargetAtTime(Math.min(0.2, this.excite * 0.09), t, 0.2);
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
