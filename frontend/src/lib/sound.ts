/**
 * Synthesized sound engine, no audio files. Off until the navbar toggle is pressed (browsers need a gesture).
 *
 * Buses: ui (clicks, pings, foley), machine (continuous, driven by the 3D unit's real feed speed, spatialised),
 * ambient (room tone, lamp hum, clock). Every one-shot gets small random pitch/level variation so repeats differ.
 */
interface Cfg { master: number; ui: boolean; ambient: boolean }
let ctx: AudioContext | null = null;
let on = false;
let dark = false;
const cfg: Cfg = { master: 0.8, ui: true, ambient: false };
let master!: GainNode, uiBus!: GainNode, machBus!: GainNode, ambBus!: GainNode, panner!: StereoPannerNode;
let noiseBuf: AudioBuffer | null = null;

const jit = (v: number, p = 0.05) => v * (1 + (Math.random() * 2 - 1) * p);

function graph(): AudioContext | null {
  if (!on) return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain(); master.connect(ctx.destination);
    uiBus = ctx.createGain(); uiBus.connect(master);
    ambBus = ctx.createGain(); ambBus.connect(master);
    machBus = ctx.createGain(); panner = ctx.createStereoPanner(); machBus.connect(panner).connect(master);
    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = n; applyCfg();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
function applyCfg() {
  if (!ctx) return;
  master.gain.setTargetAtTime(on ? cfg.master : 0, ctx.currentTime, 0.05);
  uiBus.gain.setTargetAtTime(cfg.ui ? 1 : 0, ctx.currentTime, 0.05);
  ambBus.gain.setTargetAtTime(cfg.ambient ? 1 : 0, ctx.currentTime, 0.4);
  refreshAmbient();
}
function noiseSrc(c: AudioContext, loop = false) {
  const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = loop; return s;
}
function burst(c: AudioContext, dest: AudioNode, o: { dur: number; gain: number; type?: BiquadFilterType; freq: number; q?: number; at?: number; sweepTo?: number }) {
  const t = c.currentTime + (o.at ?? 0);
  const s = noiseSrc(c); const f = c.createBiquadFilter(); f.type = o.type ?? 'bandpass'; f.frequency.setValueAtTime(o.freq, t); f.Q.value = o.q ?? 1;
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain, t + Math.min(0.01, o.dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  s.connect(f).connect(g).connect(dest); s.start(t, Math.random()); s.stop(t + o.dur + 0.02);
}
function tone(c: AudioContext, dest: AudioNode, o: { freq: number; dur: number; gain: number; type?: OscillatorType; at?: number; glideTo?: number; attack?: number }) {
  const t = c.currentTime + (o.at ?? 0);
  const x = c.createOscillator(); x.type = o.type ?? 'sine'; x.frequency.setValueAtTime(o.freq, t);
  if (o.glideTo) x.frequency.exponentialRampToValueAtTime(o.glideTo, t + o.dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack ?? 0.008)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  x.connect(g).connect(dest); x.start(t); x.stop(t + o.dur + 0.03);
}

/* ---------- continuous machine engine: pitch, level and tick rate follow the real feed speed ---------- */
const eng = { built: false, motor: null as OscillatorNode | null, sub: null as OscillatorNode | null, mg: null as GainNode | null, rg: null as GainNode | null, speed: 0, target: 0, last: 0, phase: 0, timer: 0, quiet: 0 };
function buildEngine(c: AudioContext) {
  if (eng.built) return; eng.built = true;
  eng.motor = c.createOscillator(); eng.motor.type = 'sawtooth'; eng.sub = c.createOscillator(); eng.sub.type = 'sine';
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360;
  eng.mg = c.createGain(); eng.mg.gain.value = 0;
  eng.motor.connect(lp); eng.sub.connect(lp); lp.connect(eng.mg).connect(machBus);
  const r = noiseSrc(c, true); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.9;
  eng.rg = c.createGain(); eng.rg.gain.value = 0; r.connect(bp).connect(eng.rg).connect(machBus);
  eng.motor.start(); eng.sub.start(); r.start();
  eng.timer = window.setInterval(() => {
    const cx = ctx; if (!cx || !on) return;
    eng.speed += (eng.target - eng.speed) * 0.25;
    const s = eng.speed, t = cx.currentTime;
    eng.motor!.frequency.setTargetAtTime(46 + s * 62, t, 0.08); eng.sub!.frequency.setTargetAtTime(23 + s * 31, t, 0.08);
    eng.mg!.gain.setTargetAtTime(s > 0.015 ? 0.012 + s * 0.05 : 0, t, 0.12);
    eng.rg!.gain.setTargetAtTime(s > 0.015 ? 0.004 + s * 0.03 : 0, t, 0.1);
    // roller ticks: one every N units of travel
    eng.phase += s * 0.9;
    while (eng.phase >= 1) {
      eng.phase -= 1;
      burst(cx, machBus, { dur: 0.018, gain: jit(0.05 + s * 0.05, 0.3), type: 'highpass', freq: jit(2400, 0.2), q: 0.7 });
    }
  }, 30);
}
function stopEngine() { eng.target = 0; }

/* ---------- ambient bed ---------- */
const amb = { built: false, hum: null as GainNode | null, timer: 0, flip: false };
function refreshAmbient() {
  const c = ctx; if (!c) return;
  if (cfg.ambient && on && !amb.built) {
    amb.built = true;
    const n = noiseSrc(c, true); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; const g = c.createGain(); g.gain.value = 0.035;
    n.connect(lp).connect(g).connect(ambBus); n.start();
    const h = c.createOscillator(); h.type = 'sine'; h.frequency.value = 118; const h2 = c.createOscillator(); h2.type = 'sine'; h2.frequency.value = 236;
    amb.hum = c.createGain(); amb.hum.gain.value = 0; h.connect(amb.hum); h2.connect(amb.hum); amb.hum.connect(ambBus); h.start(); h2.start();
    amb.timer = window.setInterval(() => {
      if (!cfg.ambient || !on || !ctx) return; amb.flip = !amb.flip;
      tone(ctx, ambBus, { freq: amb.flip ? 1150 : 980, dur: 0.035, gain: 0.018, type: 'square', attack: 0.002 });
    }, 1000);
  }
  if (amb.hum) amb.hum.gain.setTargetAtTime(dark ? 0.014 : 0.0035, c.currentTime, 0.8);
}

export const sound = {
  get enabled() { return on; },
  configure(next: Partial<Cfg>) { Object.assign(cfg, next); applyCfg(); },
  setTheme(isDark: boolean) { dark = isDark; refreshAmbient(); },
  setEnabled(v: boolean) { on = v; if (v) { graph(); applyCfg(); sound.click(); } else { stopEngine(); if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } },

  /** Driven every frame by the 3D unit: speed 0..1 (feed travel), pan -1..1 (screen position). */
  machine(speed: number, pan = 0) {
    const c = graph(); if (!c) return;
    buildEngine(c);
    const was = eng.target; eng.target = Math.min(1, speed);
    if ((was < 0.02) !== (eng.target < 0.02) && cfg.ui) burst(c, machBus, { dur: 0.03, gain: 0.12, type: 'bandpass', freq: 900, q: 3 }); // relay
    panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), c.currentTime, 0.05);
  },

  click() { const c = graph(); if (!c || !cfg.ui) return; tone(c, uiBus, { freq: jit(2100), glideTo: 900, dur: 0.045, gain: jit(0.06, 0.2), type: 'square', attack: 0.002 }); },
  ping(freq = 880) { const c = graph(); if (!c || !cfg.ui) return; tone(c, uiBus, { freq: jit(freq, 0.01), dur: 0.7, gain: 0.11, attack: 0.01 }); tone(c, uiBus, { freq: freq * 2.01, dur: 0.4, gain: 0.03, attack: 0.01 }); },
  /** Pentatonic note for extraction pings; index walks up the scale. */
  note(i: number) {
    const c = graph(); if (!c || !cfg.ui) return; const scale = [0, 2, 4, 7, 9]; const oct = Math.floor(i / 5) % 2;
    const f = 523.25 * Math.pow(2, (scale[i % 5] + 12 * oct) / 12);
    tone(c, uiBus, { freq: f, dur: 0.35, gain: 0.05, type: 'triangle', attack: 0.005 });
  },
  /** Folder tab snapping: two quick wooden clicks. */
  tab() { const c = graph(); if (!c || !cfg.ui) return; burst(c, uiBus, { dur: 0.03, gain: 0.16, freq: jit(1400), q: 4 }); burst(c, uiBus, { dur: 0.04, gain: 0.1, freq: jit(700), q: 5, at: 0.045 }); },
  /** Paper clip: a tiny metallic ring. */
  clip() { const c = graph(); if (!c || !cfg.ui) return; tone(c, uiBus, { freq: jit(3100, 0.02), dur: 0.16, gain: 0.04 }); tone(c, uiBus, { freq: jit(4650, 0.02), dur: 0.1, gain: 0.025, at: 0.01 }); burst(c, uiBus, { dur: 0.02, gain: 0.07, freq: 3000, q: 2 }); },
  /** Paper sliding across the desk. */
  slide(strength = 1) { const c = graph(); if (!c || !cfg.ui) return; burst(c, uiBus, { dur: 0.45 + strength * 0.2, gain: 0.04 * strength + 0.01, type: 'lowpass', freq: 1800, sweepTo: 300, q: 0.5 }); },
  /** Receipt torn from the roll: ragged noise. */
  tear() { const c = graph(); if (!c || !cfg.ui) return; for (let i = 0; i < 9; i++) burst(c, uiBus, { dur: 0.04, gain: jit(0.09, 0.5), type: 'highpass', freq: jit(2600, 0.3), at: i * 0.03 + Math.random() * 0.015 }); },
  /** Stamp hitting paper; heavier=true for a reject. */
  thud(pan = 0, heavy = false) {
    const c = graph(); if (!c || !cfg.ui) return;
    const bus = c.createGain(); const p = c.createStereoPanner(); p.pan.value = pan; bus.connect(p).connect(uiBus);
    tone(c, bus, { freq: jit(heavy ? 120 : 150), glideTo: heavy ? 32 : 42, dur: heavy ? 0.42 : 0.3, gain: heavy ? 1 : 0.8, attack: 0.002 });
    burst(c, bus, { dur: 0.14, gain: heavy ? 0.7 : 0.45, type: 'lowpass', freq: 520, q: 0.7 });
    burst(c, bus, { dur: 0.05, gain: 0.25, type: 'highpass', freq: 2500, at: 0.005 }); // ink spatter
  },
  whir() { /* superseded by the live machine engine */ },
};
