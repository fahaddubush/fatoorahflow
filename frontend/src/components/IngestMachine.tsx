import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { FlightInfo } from './PaperFlight';
import { sound } from '../lib/sound';

/**
 * The intake unit: a real-time 3D document ingester.
 * A sheet is pulled slowly into the top slot, travels through the body (hidden by the
 * housing, handled by the depth buffer rather than faked), and is pushed out of the lower
 * front slot onto the desk with a red RECEIVED stamp.
 */
export type MachinePhase = 'idle' | 'feeding' | 'waiting' | 'scanning' | 'ejecting' | 'done' | 'failed';

interface IngestMachineProps {
  phase: MachinePhase;
  filename?: string;
  /** Two short lines for the LCD readout. */
  lcd?: [string, string];
  isRtl?: boolean;
  /** Sheet is already inside when mounted (used when resuming a job in progress). */
  startInside?: boolean;
  /** Fires once the sheet has fully left the machine and settled, with where it landed on screen. */
  onEjected?: (info?: FlightInfo) => void;
  /** Current job stage; drives the preview sheet's scan bar and field pings. */
  stage?: string | null;
  /** Night desk theme: dimmer exposure and deeper shadows. */
  dark?: boolean;
  /** high = cloth physics, shadows, vibration; light = analytic paper, no shadows; off is handled by the parent. */
  quality?: 'high' | 'light' | 'off';
  /** Calm motion: shorter, gentler tweens. */
  calm?: boolean;
  /** Real evidence boxes [ymin, xmin, ymax, xmax] (0..1) shown on the preview sheet once known. */
  boxes?: number[][];
  /** Real page image for the preview sheet once rendered. */
  pageImageUrl?: string | null;
  /** Camera and hovering sheet respond to page scroll (empty-state unit). */
  scrollLinked?: boolean;
  /** How many sheets are queued (batch upload); extra sheets stack behind the first. */
  stackCount?: number;
  className?: string;
}

// ---- geometry constants (scene units; 1 unit is roughly 10 cm) ----
const FEET = 0.25;
const BODY_W = 9.2, BODY_H = 2.6, BODY_D = 6.2;
const BODY_TOP = FEET + BODY_H;           // 2.85
const UP_H = 1.5;
const TOP = BODY_TOP + UP_H - 0.05;       // top of upper housing
const SLOT_Z = -0.9;                      // z of the intake slot
const FRONT_Z = BODY_D / 2;               // z of the lower front face
const OUT_Y = FEET + 0.62;                // height of the exit slot
const SHEET_W = 3.3, SHEET_H = SHEET_W * 1.414;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface Tween { from: number; to: number; start: number; dur: number; ease: (t: number) => number; done?: () => void }

function makeSheetTexture(filename: string, stamped: boolean, isRtl: boolean): THREE.CanvasTexture {
  const W = 640, H = 905;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#FBF8F0'; g.fillRect(0, 0, W, H);
  // paper fibre
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(120,90,40,${Math.random() * 0.035})`; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1); }
  g.fillStyle = '#15120E'; g.fillRect(44, 44, W - 88, 4);
  g.font = "500 22px 'JetBrains Mono', monospace"; g.textBaseline = 'alphabetic';
  g.fillText('TAX INVOICE', 44, 86);
  g.textAlign = 'right'; g.font = "400 30px 'Amiri', serif"; g.fillText('فاتورة ضريبية', W - 44, 90);
  g.textAlign = 'left'; g.font = "400 15px 'JetBrains Mono', monospace"; g.fillStyle = '#7A7160';
  const name = filename.length > 34 ? filename.slice(0, 31) + '...' : filename;
  g.fillText(name || 'document.pdf', 44, 122);
  const bar = (x: number, y: number, w: number, h = 9, col = '#CFC5AE') => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  for (let i = 0; i < 4; i++) { bar(44, 160 + i * 24, 150 + ((i * 53) % 90)); bar(W / 2 + 20, 160 + i * 24, 130 + ((i * 37) % 80)); }
  g.fillStyle = '#15120E'; g.fillRect(44, 290, W - 88, 30);
  g.fillStyle = '#FBF8F0'; g.font = "500 13px 'JetBrains Mono', monospace"; g.fillText('DESCRIPTION', 54, 310); g.textAlign = 'right'; g.fillText('TOTAL', W - 54, 310); g.textAlign = 'left';
  for (let i = 0; i < 7; i++) {
    const y = 342 + i * 40;
    bar(54, y, 190 + ((i * 61) % 140), 10, '#B9AE96'); bar(W - 54 - 70, y, 70, 10, '#B9AE96');
    g.fillStyle = '#E4DCC8'; g.fillRect(44, y + 22, W - 88, 1);
  }
  g.fillStyle = '#15120E'; g.fillRect(W - 280, 650, 236, 2);
  g.font = "500 18px 'JetBrains Mono', monospace"; g.fillText('TOTAL (SAR)', W - 280, 682); g.textAlign = 'right'; g.fillText('0000.00', W - 44, 682); g.textAlign = 'left';
  // QR-ish block
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x * 7 + y * 13 + x * y) % 3 !== 0) { g.fillStyle = '#15120E'; g.fillRect(44 + x * 12, 720 + y * 12, 11, 11); }
  if (stamped) {
    g.save(); g.translate(W * 0.58, H * 0.62); g.rotate(-0.21);
    g.strokeStyle = '#C9301A'; g.fillStyle = '#C9301A'; g.lineWidth = 9;
    g.strokeRect(-150, -46, 300, 92); g.lineWidth = 2; g.strokeRect(-140, -36, 280, 72);
    g.textAlign = 'center'; g.font = "400 64px 'Instrument Serif', serif";
    g.fillText(isRtl ? 'مُستلمة' : 'RECEIVED', 0, 16);
    g.font = "500 12px 'JetBrains Mono', monospace"; g.fillText('FATOORAHFLOW  INTAKE', 0, 36);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

function makeLcd(lines: [string, string], phase: MachinePhase, tick: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  drawLcd(c, lines, phase, tick);
  return tex;
}
function drawLcd(c: HTMLCanvasElement, lines: [string, string], phase: MachinePhase, tick: number) {
  const g = c.getContext('2d')!;
  g.fillStyle = '#17130D'; g.fillRect(0, 0, c.width, c.height);
  const col = phase === 'failed' ? '#FF6B4A' : '#FFB84D';
  g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 10;
  g.font = "500 40px 'JetBrains Mono', monospace"; g.textBaseline = 'middle';
  g.fillText(lines[0].toUpperCase().slice(0, 17), 22, 40);
  g.globalAlpha = 0.75; g.font = "400 30px 'JetBrains Mono', monospace";
  g.fillText((lines[1].toUpperCase().slice(0, 20)) + (tick % 2 === 0 ? '_' : ' '), 22, 94);
  g.globalAlpha = 1; g.shadowBlur = 0;
  g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < c.height; y += 4) g.fillRect(0, y, c.width, 1);
}

function makePlate(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#F4EEDF'; g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#15120E'; g.font = "400 46px 'Instrument Serif', serif"; g.textBaseline = 'middle'; g.fillText('Fatoorah', 22, 40);
  const fw = g.measureText('Fatoorah').width;
  g.font = "italic 400 46px 'Instrument Serif', serif"; g.fillText('Flow', 22 + fw + 4, 40);
  g.font = "500 15px 'JetBrains Mono', monospace"; g.fillStyle = '#7A7160'; g.fillText('INTAKE UNIT  MK.II  /  KSA', 22, 76);
  g.fillStyle = '#D2391E'; g.fillRect(430, 22, 60, 52);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Paper fibre bump map. */
function makeFiber() {
  const t = canvasTex(256, 256, (g) => { g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 2600; i++) { const v = 90 + Math.random() * 90; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 5, 1); } }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 3); return t;
}
/** What shows through the back of a sheet: the same page, mirrored by the UVs, at low contrast. */
function makeBackTexture(src: HTMLCanvasElement) {
  return canvasTex(src.width, src.height, (g) => { g.fillStyle = '#F3EEE0'; g.fillRect(0, 0, src.width, src.height); g.globalAlpha = 0.2; g.drawImage(src, 0, 0); });
}
/** Brushed-metal roughness stripes. */
function makeBrushed() {
  const t = canvasTex(256, 64, (g) => { for (let y = 0; y < 64; y++) { const v = 90 + Math.random() * 90; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, 256, 1); } }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
/** Diagonal glare streak for the LCD glass; its offset follows the pointer. */
function makeGloss() {
  const t = canvasTex(256, 64, (g) => { const gr = g.createLinearGradient(0, 0, 256, 64); gr.addColorStop(0.2, 'rgba(255,255,255,0)'); gr.addColorStop(0.38, 'rgba(255,255,255,.34)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,.14)'); gr.addColorStop(0.8, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 64); });
  t.wrapS = THREE.RepeatWrapping; return t;
}
function makeRadial(color: string, inner: number) {
  return canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 64 * inner, 64, 64, 64); gr.addColorStop(0, color); gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)')); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
}

export default function IngestMachine({ phase, filename = '', lcd = ['READY', 'FEED A SHEET'], isRtl = false, startInside = false, onEjected, stage = null, dark = false, quality = 'high', calm = false, boxes, pageImageUrl = null, scrollLinked = false, stackCount = 1, className }: IngestMachineProps) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const props = useRef({ phase, lcd, onEjected, filename, isRtl, startInside, stage, dark, quality, calm, scrollLinked, stackCount });
  props.current = { phase, lcd, onEjected, filename, isRtl, startInside, stage, dark, quality, calm, scrollLinked, stackCount };
  const api = useRef<{ setPhase: (p: MachinePhase) => void; setSheet: (name: string, rtl: boolean) => void; setDark: (d: boolean) => void; setBoxes: (b: number[][] | undefined) => void; setPage: (url: string | null) => void } | null>(null);

  useEffect(() => {
    const el = host.current!;
    if (props.current.quality === 'off') { setFailed(true); return; }
    const hq = props.current.quality !== 'light';
    const tscale = props.current.calm ? 0.4 : 1;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch { setFailed(true); return; }
    renderer.setPixelRatio(hq ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = hq; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 80);
    const target = new THREE.Vector3(0.1, 3.0, 2.2);

    // ---- lights ----
    const key = new THREE.DirectionalLight(0xfff0d6, 2.4);
    key.position.set(-6, 12, 9); key.castShadow = hq;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.radius = 5;
    Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 34 });
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xfff4de, 0xb59a6a, 0.55));
    const rim = new THREE.DirectionalLight(0xff9a70, 0.9); rim.position.set(9, 4, -6); scene.add(rim);
    const slotGlow = new THREE.PointLight(0xff6a3d, 0, 6, 2); slotGlow.position.set(0, TOP + 0.55, SLOT_Z); scene.add(slotGlow);
    const exitGlow = new THREE.PointLight(0xffa36b, 0, 5, 2); exitGlow.position.set(0, OUT_Y + 0.5, FRONT_Z + 0.7); scene.add(exitGlow);

    // ---- materials ----
    const cream = new THREE.MeshStandardMaterial({ color: 0xe6dcc2, roughness: 0.5, metalness: 0.04 });
    const creamDeep = new THREE.MeshStandardMaterial({ color: 0xd4c7a6, roughness: 0.55, metalness: 0.04 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d1a15, roughness: 0.38, metalness: 0.15 });
    const void_ = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1, metalness: 0 });
    const vermilion = new THREE.MeshStandardMaterial({ color: 0xd2391e, roughness: 0.42 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9a9384, roughness: 0.4, metalness: 0.9, roughnessMap: makeBrushed() });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x24211b, roughness: 0.8 });
    const glowLine = new THREE.MeshBasicMaterial({ color: 0xff6a3d, transparent: true, opacity: 0 });

    const machine = new THREE.Group(); scene.add(machine);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; machine.add(m); return m;
    };

    // body
    add(new RoundedBoxGeometry(BODY_W, BODY_H, BODY_D, 5, 0.24), cream, 0, FEET + BODY_H / 2, 0);
    add(new RoundedBoxGeometry(BODY_W - 0.5, 0.12, BODY_D - 0.5, 2, 0.05), creamDeep, 0, FEET + 0.06, 0);        // plinth
    for (const [fx, fz] of [[-3.9, -2.5], [3.9, -2.5], [-3.9, 2.5], [3.9, 2.5]]) add(new THREE.CylinderGeometry(0.34, 0.4, FEET, 20), rubber, fx, FEET / 2, fz);
    // upper housing, split into front/back blocks around the intake gap
    const GAP = 0.36;
    const frontZ0 = SLOT_Z + GAP / 2, frontZ1 = 2.55;
    const backZ1 = SLOT_Z - GAP / 2, backZ0 = -2.85;
    add(new RoundedBoxGeometry(8.5, UP_H, frontZ1 - frontZ0, 4, 0.18), dark, 0, BODY_TOP + UP_H / 2 - 0.05, (frontZ0 + frontZ1) / 2);
    add(new RoundedBoxGeometry(8.5, UP_H, backZ1 - backZ0, 4, 0.18), dark, 0, BODY_TOP + UP_H / 2 - 0.05, (backZ0 + backZ1) / 2);
    add(new THREE.BoxGeometry(8.5, 1.1, GAP + 0.04), void_, 0, TOP - 0.62, SLOT_Z, false);                      // deep throat
    // intake guide lips: thin cream edges framing the slot
    add(new THREE.BoxGeometry(8.52, 0.06, 0.08), cream, 0, TOP + 0.02, frontZ0 - 0.04);
    add(new THREE.BoxGeometry(8.52, 0.06, 0.08), cream, 0, TOP + 0.02, backZ1 + 0.04);
    // rollers peeking out of the throat
    const rollerGeo = new THREE.CylinderGeometry(0.11, 0.11, 7.7, 20); rollerGeo.rotateZ(Math.PI / 2);
    const rollers = [add(rollerGeo, steel, 0, TOP - 0.2, SLOT_Z - 0.115, false), add(rollerGeo, steel, 0, TOP - 0.2, SLOT_Z + 0.115, false)];
    // scan line sitting just under the lip
    const scanLine = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.03, 0.3), glowLine); scanLine.position.set(0, TOP - 0.08, SLOT_Z); machine.add(scanLine);
    // paper rest on the back of the housing
    const rest = add(new THREE.BoxGeometry(5.2, 0.08, 1.35), creamDeep, 0, TOP + 0.04, backZ0 + 0.45); rest.rotation.x = -0.06;

    // front panel: LCD, buttons, LEDs
    const lcdCanvasTex = makeLcd(props.current.lcd, props.current.phase, 0);
    const lcdMat = new THREE.MeshBasicMaterial({ map: lcdCanvasTex, toneMapped: false });
    const lcdBezel = add(new RoundedBoxGeometry(3.5, 0.98, 0.12, 2, 0.04), void_, -2.45, BODY_TOP + 0.62, frontZ1 + 0.02, false); void lcdBezel;
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), lcdMat); lcd.position.set(-2.45, BODY_TOP + 0.62, frontZ1 + 0.09); machine.add(lcd);
    const glossTex = makeGloss();
    const gloss = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: glossTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.55 }));
    gloss.position.set(-2.45, BODY_TOP + 0.62, frontZ1 + 0.1); machine.add(gloss);
    for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 24), i === 0 ? vermilion : cream, 0.15 + i * 0.62, BODY_TOP + 0.62, frontZ1 + 0.06).rotation.x = Math.PI / 2;
    const leds = [0, 1].map((i) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0x000000, roughness: 0.3 });
      const m = add(new THREE.SphereGeometry(0.1, 16, 12), mat, 2.7 + i * 0.4, BODY_TOP + 0.62, frontZ1 + 0.08, false); void m; return mat;
    });
    // name plate + accent stripe + exit slot on the lower front
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.64), new THREE.MeshStandardMaterial({ map: makePlate(), roughness: 0.6 }));
    plate.position.set(-2.55, FEET + 1.85, FRONT_Z + 0.012); machine.add(plate);
    add(new THREE.BoxGeometry(BODY_W - 0.2, 0.09, 0.05), vermilion, 0, FEET + 2.3, FRONT_Z + 0.02, false);
    add(new THREE.BoxGeometry(7.9, 0.2, 0.34), void_, 0, OUT_Y, FRONT_Z + 0.04, false);                         // exit mouth
    add(new THREE.BoxGeometry(8.1, 0.05, 0.12), steel, 0, OUT_Y - 0.14, FRONT_Z + 0.2);                          // lower lip
    // output tray: a shallow ramp so the sheet slides out and rests presented, instead of buckling against the desk
    const RAMP_Z0 = FRONT_Z + 0.3, RAMP_Z1 = FRONT_Z + 3.3, RAMP_Y0 = OUT_Y - 0.12, RAMP_Y1 = 0.05;
    const rampLen = Math.hypot(RAMP_Z1 - RAMP_Z0, RAMP_Y0 - RAMP_Y1), rampAng = Math.atan2(RAMP_Y0 - RAMP_Y1, RAMP_Z1 - RAMP_Z0);
    const tray = add(new RoundedBoxGeometry(8.1, 0.06, rampLen, 2, 0.02), creamDeep, 0, (RAMP_Y0 + RAMP_Y1) / 2 - 0.035, (RAMP_Z0 + RAMP_Z1) / 2); tray.rotation.x = rampAng;
    for (const sx of [-4.02, 4.02]) { const rail = add(new THREE.BoxGeometry(0.09, 0.14, rampLen), cream, sx, (RAMP_Y0 + RAMP_Y1) / 2 + 0.02, (RAMP_Z0 + RAMP_Z1) / 2); rail.rotation.x = rampAng; }
    // side vents
    for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(0.05, 0.9, 0.09), void_, BODY_W / 2 + 0.005, FEET + 1.15, -2 + i * 0.5, false);

    // ---- desk shadow catcher ----
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.24, color: 0x5a4116 }));
    desk.rotation.x = -Math.PI / 2; desk.receiveShadow = true; scene.add(desk);
    const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!; const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64); gr.addColorStop(0, 'rgba(60,40,10,.5)'); gr.addColorStop(1, 'rgba(60,40,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.set(0.3, 0.01, 0.4); scene.add(blob);
    // contact shadow where the body meets the desk, a soft one under the ejected sheet, and warm light spilling from the exit slot
    const aoBlob = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 7.4), new THREE.MeshBasicMaterial({ map: makeRadial('rgba(30,18,4,.75)', 0.55), transparent: true, depthWrite: false }));
    aoBlob.rotation.x = -Math.PI / 2; aoBlob.position.set(0, 0.012, 0); scene.add(aoBlob);
    const sheetShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0 }));
    sheetShadow.rotation.x = -Math.PI / 2; sheetShadow.position.y = 0.014; scene.add(sheetShadow);
    const spillMat = new THREE.MeshBasicMaterial({ map: makeRadial('rgba(255,176,104,.9)', 0.05), transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending });
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 3.6), spillMat); spill.rotation.x = -Math.PI / 2; spill.position.set(0, 0.02, FRONT_Z + 2.2); scene.add(spill);

    // ---- sheets ----
    let texIn = makeSheetTexture(props.current.filename, false, props.current.isRtl);
    let texOut = makeSheetTexture(props.current.filename, true, props.current.isRtl);
    let texInBack = makeBackTexture(texIn.image as HTMLCanvasElement);
    let texOutBack = makeBackTexture(texOut.image as HTMLCanvasElement);
    const fiber = makeFiber();
    const clipIn = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(BODY_TOP + 0.05));    // keep y above the body top
    const clipOut = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(FRONT_Z - 0.05));    // keep z in front of the face
    const paperMat = (map: THREE.Texture, side: THREE.Side, clip: THREE.Plane) => new THREE.MeshStandardMaterial({ map, bumpMap: fiber, bumpScale: side === THREE.BackSide ? 0.4 : 0.7, roughness: 0.93, side, clippingPlanes: [clip] });
    const matIn = paperMat(texIn, THREE.FrontSide, clipIn), matInBack = paperMat(texInBack, THREE.BackSide, clipIn);
    const matOut = paperMat(texOut, THREE.FrontSide, clipOut), matOutBack = paperMat(texOutBack, THREE.BackSide, clipOut);
    // incoming sheet: segmented so it can crumple when the unit jams; back face shows the ink faintly through the paper
    const inGeo = new THREE.PlaneGeometry(SHEET_W, SHEET_H, 6, 24);
    const inBase = Float32Array.from(inGeo.attributes.position.array as Float32Array);
    const inGroup = new THREE.Group(); scene.add(inGroup);
    const inFront = new THREE.Mesh(inGeo, matIn); inFront.castShadow = true; inFront.receiveShadow = true; inGroup.add(inFront);
    inGroup.add(new THREE.Mesh(inGeo, matInBack));
    const stackSheets = Array.from({ length: 4 }, () => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.PlaneGeometry(SHEET_W, SHEET_H), matIn); m.castShadow = true; g.add(m); g.visible = false; scene.add(g); return g; });

    // outgoing sheet: a cloth. Rows still inside the slot are driven by the feed; the rest are free particles (verlet) with
    // distance + bend constraints (stiffness), gravity, lip and desk collisions, friction and a little rebound.
    const CC = 7, RR = 32, NN = CC * RR;
    const dxr = SHEET_W / (CC - 1), dyr = SHEET_H / (RR - 1), hw = SHEET_W / 2;
    const outGeo = new THREE.PlaneGeometry(SHEET_W, SHEET_H, CC - 1, RR - 1);
    const sheetOut = new THREE.Mesh(outGeo, matOut); sheetOut.castShadow = true; sheetOut.receiveShadow = true; sheetOut.frustumCulled = false; scene.add(sheetOut);
    const sheetOutBack = new THREE.Mesh(outGeo, matOutBack); sheetOutBack.frustumCulled = false; scene.add(sheetOutBack);
    const P = new Float32Array(NN * 3), O = new Float32Array(NN * 3), pin = new Uint8Array(NN);
    const cons: [number, number, number][] = [];
    for (let r = 0; r < RR; r++) for (let c = 0; c < CC; c++) {
      const i = r * CC + c;
      if (c < CC - 1) cons.push([i, i + 1, dxr]);
      if (r < RR - 1) cons.push([i, i + CC, dyr]);
      if (r < RR - 1 && c < CC - 1) { const d = Math.hypot(dxr, dyr); cons.push([i, i + CC + 1, d], [i + 1, i + CC, d]); }
      if (r < RR - 2) cons.push([i, i + 2 * CC, 2 * dyr]);                    // bend constraint = paper stiffness
      if (c < CC - 2) cons.push([i, i + 2, 2 * dxr]);                         // cross-bend keeps the sheet from rolling at the edges
    }
    const drag = { idx: -1, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.8), target: new THREE.Vector3(), has: false };
    const nominal = (i: number, tail: number): [number, number, number] => { const r = Math.floor(i / CC), c = i % CC; return [-hw + c * dxr, OUT_Y, tail + r * dyr]; };
    const resetPose = (tail: number) => { for (let i = 0; i < NN; i++) { const [x, y, z] = nominal(i, tail); P.set([x, y, z], i * 3); O.set([x, y, z], i * 3); } };
    // while the sheet is being pushed out it simply slides along the tray (deterministic, never buckles);
    // once it has fully left, the cloth takes over so it can settle, rebound and be grabbed
    const droopPose = (tail: number) => {
      for (let i = 0; i < NN; i++) {
        const r = Math.floor(i / CC), c = i % CC; const x = -hw + c * dxr, z = tail + r * dyr;
        const u = clamp01((z - RAMP_Z0) / (RAMP_Z1 - RAMP_Z0));
        const y = z <= RAMP_Z0 ? OUT_Y : RAMP_Y0 + (RAMP_Y1 - RAMP_Y0) * u + 0.04;
        P.set([x, y, z], i * 3);
      }
    };
    const clothStep = (dt: number, tail: number) => {
      const h = dt / 2;
      for (let sub = 0; sub < 2; sub++) {
        for (let i = 0; i < NN; i++) {
          const [nx, ny, nz] = nominal(i, tail); const k = i * 3;
          const driven = nz < FRONT_Z + 0.15 && drag.idx !== i;
          pin[i] = driven || drag.idx === i ? 1 : 0;
          if (driven) { P[k] = nx; P[k + 1] = ny; P[k + 2] = nz; O[k] = nx; O[k + 1] = ny; O[k + 2] = nz; continue; }
          if (drag.idx === i) continue;
          const vx = (P[k] - O[k]) * 0.985, vy = (P[k + 1] - O[k + 1]) * 0.99, vz = (P[k + 2] - O[k + 2]) * 0.985;
          O[k] = P[k]; O[k + 1] = P[k + 1]; O[k + 2] = P[k + 2];
          P[k] += vx; P[k + 1] += vy - 14 * h * h; P[k + 2] += vz;
        }
        if (drag.idx >= 0 && drag.has) {
          const k = drag.idx * 3; O[k] = P[k]; O[k + 1] = P[k + 1]; O[k + 2] = P[k + 2];
          P[k] += (drag.target.x - P[k]) * 0.5; P[k + 1] += (drag.target.y - P[k + 1]) * 0.5; P[k + 2] += (drag.target.z - P[k + 2]) * 0.5;
        }
        for (let it = 0; it < 9; it++) {
          for (let q = 0; q < cons.length; q++) {
            const [a, b, rest] = cons[q]; const ka = a * 3, kb = b * 3;
            const dx = P[kb] - P[ka], dy = P[kb + 1] - P[ka + 1], dz = P[kb + 2] - P[ka + 2];
            const d = Math.hypot(dx, dy, dz) || 1e-6; const diff = (d - rest) / d;
            const wa = pin[a] ? 0 : 1, wb = pin[b] ? 0 : 1; const wsum = wa + wb; if (!wsum) continue;
            const fa = (wa / wsum) * diff, fb = (wb / wsum) * diff;
            P[ka] += dx * fa; P[ka + 1] += dy * fa; P[ka + 2] += dz * fa; P[kb] -= dx * fb; P[kb + 1] -= dy * fb; P[kb + 2] -= dz * fb;
          }
        }
        for (let i = 0; i < NN; i++) {
          if (pin[i]) continue; const k = i * 3;
          // the exit lip: sheet rides over it instead of sagging into the mouth
          if (P[k + 2] > FRONT_Z - 0.05 && P[k + 2] < FRONT_Z + 0.32 && P[k + 1] < OUT_Y - 0.1 && O[k + 1] >= OUT_Y - 0.14) { P[k + 1] = OUT_Y - 0.1; O[k + 1] = P[k + 1]; }
          if (P[k + 2] > RAMP_Z0 - 0.02 && P[k + 2] < RAMP_Z1) {                  // tray: the sheet slides down the ramp
            const ry = RAMP_Y0 + (RAMP_Y1 - RAMP_Y0) * ((P[k + 2] - RAMP_Z0) / (RAMP_Z1 - RAMP_Z0)) + 0.04;
            if (P[k + 1] < ry && O[k + 1] >= ry - 0.2) {
              const vy = P[k + 1] - O[k + 1]; P[k + 1] = ry; O[k + 1] = ry + vy * 0.1;
              const fr = st.pOut < 0.999 && drag.idx < 0 ? 0.05 : 0.3; O[k] += (P[k] - O[k]) * fr; O[k + 2] += (P[k + 2] - O[k + 2]) * fr;
            }
          }
          if (P[k + 1] < 0.03) {                                                // desk: friction + a little rebound
            const vy = P[k + 1] - O[k + 1]; P[k + 1] = 0.03; O[k + 1] = 0.03 + vy * 0.12;
            const fr = st.pOut < 0.999 && drag.idx < 0 ? 0.06 : 0.5;   // slides freely while being pushed out, grips once it has landed
            O[k] += (P[k] - O[k]) * fr; O[k + 2] += (P[k + 2] - O[k + 2]) * fr;
          }
          P[k] = Math.max(-11, Math.min(11, P[k])); P[k + 2] = Math.max(-4, Math.min(13, P[k + 2]));
        }
      }
    };
    void texInBack; void texOutBack;

    // ---- preview sheet: rises above the slot while scanning and shows what each stage is doing to the page ----
    const GW = 640, GH = 905;
    const ghostBaseY = TOP + SHEET_H / 2 + 0.9;
    const ghost = new THREE.Group(); ghost.position.set(0, ghostBaseY, SLOT_Z + 0.05); ghost.visible = false; scene.add(ghost);
    const ghostMat = new THREE.MeshBasicMaterial({ map: texIn, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    ghost.add(new THREE.Mesh(new THREE.PlaneGeometry(SHEET_W, SHEET_H), ghostMat));
    const frameMat = new THREE.LineBasicMaterial({ color: 0xd2391e, transparent: true, opacity: 0 });
    ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(SHEET_W + 0.14, SHEET_H + 0.14)), frameMat));
    const px01 = (x: number) => (x - 0.5) * SHEET_W, py01 = (y: number) => (0.5 - y) * SHEET_H;
    const defaultBoxes: number[][] = [[156, 44, 260, 244], [156, 340, 260, 540], [286, 44, 324, 596],
      ...[0, 1, 2, 3, 4].map((i) => [336 + i * 40, 44, 366 + i * 40, 596]), [644, 330, 698, 596], [716, 40, 824, 152]].map(([y0, x0, y1, x1]) => [y0 / GH, x0 / GW, y1 / GH, x1 / GW]);
    let rects: THREE.Mesh[] = [];
    const buildRects = (defs: number[][]) => {
      rects.forEach((m) => { ghost.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
      rects = defs.slice(0, 30).map(([y0, x0, y1, x1]) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.05, (x1 - x0) * SHEET_W), Math.max(0.05, (y1 - y0) * SHEET_H)), new THREE.MeshBasicMaterial({ color: 0xf4df4e, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
        m.position.set(px01((x0 + x1) / 2), py01((y0 + y1) / 2), 0.012); ghost.add(m); return m;
      });
    };
    buildRects(defaultBoxes);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(SHEET_W + 0.3, 0.07), new THREE.MeshBasicMaterial({ color: 0xff5a36, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    bar.position.z = 0.02; ghost.add(bar);
    let ghostA = 0, gt = 0, lastNote = -1, realTex: THREE.Texture | null = null;

    // ---- state + tweens ----
    const st = { pIn: props.current.startInside ? 1 : 0, pOut: 0, scan: 0, shake: 0, phase: props.current.phase, hum: 0, jam: 0 };
    let jamDirty = false, scrollP = 0.5, clothLive = false;
    const tweens: Record<string, Tween | undefined> = {};
    const tw = (key: 'pIn' | 'pOut', to: number, dur: number, done?: () => void) => {
      tweens[key] = { from: st[key], to, start: performance.now(), dur: dur * tscale, ease: easeInOut, done };
    };
    let ejectedTimer: number | undefined;
    const flightInfo = (): FlightInfo | undefined => {
      try {
        camera.updateMatrixWorld(); const box = el.getBoundingClientRect(); const v = new THREE.Vector3();
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (let i = 0; i < NN; i++) {
          v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).project(camera);
          const sx = (v.x * 0.5 + 0.5) * box.width + box.left, sy = (-v.y * 0.5 + 0.5) * box.height + box.top;
          x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        }
        return { src: (texOut.image as HTMLCanvasElement).toDataURL('image/png'), rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
      } catch { return undefined; }
    };
    const setPhase = (p: MachinePhase) => {
      st.phase = p;
      window.clearTimeout(ejectedTimer);
      if (p === 'idle') { tw('pIn', 0, 900); tw('pOut', 0, 700); }
      else if (p === 'feeding') { tw('pOut', 0, 300); tw('pIn', 1, 3600); }
      else if (p === 'waiting') { tw('pOut', 0, 300); tw('pIn', 1, Math.max(700, (1 - st.pIn) * 2400)); }
      else if (p === 'scanning') { tw('pOut', 0, 300); if (st.pIn < 1) tw('pIn', 1, Math.max(900, (1 - st.pIn) * 3600)); }
      else if (p === 'ejecting') {
        const begin = () => tw('pOut', 1, 3800, () => {
          sound.slide(0.9);
          const fire = () => { if (drag.idx >= 0) { ejectedTimer = window.setTimeout(fire, 350); return; } props.current.onEjected?.(flightInfo()); };
          ejectedTimer = window.setTimeout(fire, 900 * tscale + 200);
        });
        if (st.pIn < 1) tw('pIn', 1, Math.max(500, (1 - st.pIn) * 1800), begin); else begin();
      } else if (p === 'done') { st.pIn = 1; st.pOut = 1; delete tweens.pIn; delete tweens.pOut; }
      else if (p === 'failed') { st.shake = 1; tw('pOut', 0, 300); tw('pIn', 0.62, 1400); }
    };
    api.current = {
      setPhase,
      setSheet: (name, rtl) => {
        texIn.dispose(); texOut.dispose(); texInBack.dispose(); texOutBack.dispose();
        texIn = makeSheetTexture(name, false, rtl); texOut = makeSheetTexture(name, true, rtl);
        texInBack = makeBackTexture(texIn.image as HTMLCanvasElement); texOutBack = makeBackTexture(texOut.image as HTMLCanvasElement);
        matIn.map = texIn; matOut.map = texOut; matInBack.map = texInBack; matOutBack.map = texOutBack;
        if (!realTex) ghostMat.map = texIn;
        [matIn, matOut, matInBack, matOutBack, ghostMat].forEach((m) => { m.needsUpdate = true; });
      },
      setDark: (d) => {
        renderer.toneMappingExposure = d ? 0.92 : 1.05; key.intensity = d ? 2.1 : 2.4; scene.environmentIntensity = d ? 0.4 : 0.55;
        (desk.material as THREE.ShadowMaterial).opacity = d ? 0.5 : 0.24;
      },
      setBoxes: (b) => { buildRects(b && b.length ? b : defaultBoxes); },
      setPage: (url) => {
        if (!url) { realTex?.dispose(); realTex = null; ghostMat.map = texIn; ghostMat.needsUpdate = true; return; }
        new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; realTex?.dispose(); realTex = t; ghostMat.map = t; ghostMat.needsUpdate = true; }, undefined, () => undefined);
      },
    };
    api.current.setDark(props.current.dark);
    setPhase(props.current.phase);
    if (props.current.phase === 'done') { st.pIn = 1; st.pOut = 1; }
    if (props.current.phase === 'scanning' || props.current.phase === 'ejecting') st.pIn = 1;

    // ---- sizing + camera ----
    let aspect = 1;
    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1; aspect = w / h;
      renderer.setSize(w, h, false); camera.aspect = aspect; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2; };
    window.addEventListener('pointermove', onMove);
    // grab the ejected sheet: nearest particle follows the pointer on a plane above the desk; release flings it
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let hoverTick = 0;
    const toNdc = (e: PointerEvent) => { const r = el.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); };
    const onDown = (e: PointerEvent) => {
      if (!hq || st.pOut < 0.95) return; toNdc(e);
      const hit = ray.intersectObject(sheetOut)[0]; if (!hit) return;
      let best = 0, bd = 1e9; for (let i = 0; i < NN; i++) { const d = (P[i * 3] - hit.point.x) ** 2 + (P[i * 3 + 1] - hit.point.y) ** 2 + (P[i * 3 + 2] - hit.point.z) ** 2; if (d < bd) { bd = d; best = i; } }
      drag.idx = best; drag.plane.constant = -Math.max(0.6, hit.point.y + 0.5); drag.has = false; renderer.domElement.setPointerCapture(e.pointerId); renderer.domElement.style.cursor = 'grabbing'; sound.slide(0.6);
    };
    const onDragMove = (e: PointerEvent) => {
      if (!hq) return; toNdc(e);
      if (drag.idx >= 0) { drag.has = ray.ray.intersectPlane(drag.plane, drag.target) !== null; return; }
      if (st.pOut > 0.95 && ++hoverTick % 4 === 0) renderer.domElement.style.cursor = ray.intersectObject(sheetOut).length ? 'grab' : 'default';
    };
    const onUp = () => { if (drag.idx >= 0) { drag.idx = -1; drag.has = false; renderer.domElement.style.cursor = 'grab'; sound.slide(1); } };
    renderer.domElement.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onDragMove); window.addEventListener('pointerup', onUp);
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(el);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- frame ----
    let raf = 0, last = performance.now(), lcdTick = 0, lcdKey = '';
    const pos = outGeo.attributes.position as THREE.BufferAttribute;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const prevIn = st.pIn, prevOut = st.pOut;
      (['pIn', 'pOut'] as const).forEach((k) => {
        const t = tweens[k]; if (!t) return;
        const u = clamp01((now - t.start) / t.dur);
        st[k] = t.from + (t.to - t.from) * (reduce ? 1 : t.ease(u));
        if (u >= 1) { delete tweens[k]; t.done?.(); }
      });
      const speed = (Math.abs(st.pIn - prevIn) + Math.abs(st.pOut - prevOut)) / Math.max(dt, 0.001);
      const motionAmt = clamp01(speed / 0.35);
      rollers[0].rotation.x += speed * 2.4 * dt * (st.phase === 'ejecting' ? -1 : 1); rollers[1].rotation.x -= speed * 2.4 * dt * (st.phase === 'ejecting' ? -1 : 1);

      const busy = st.phase === 'feeding' || st.phase === 'scanning' || st.phase === 'ejecting';
      st.hum = busy ? Math.min(1, st.hum + dt * 3) : Math.max(0, st.hum - dt * 2);
      st.shake = Math.max(0, st.shake - dt * 0.9);
      const t = now / 1000;
      // vibration follows the real roller speed and how much paper is in the machine
      const load = 0.4 + 0.6 * st.pIn * (1 - st.pOut);
      const amp = hq ? 0.003 + 0.011 * motionAmt * load : 0.004 * st.hum;
      machine.position.set(Math.sin(t * 61) * amp + Math.sin(t * 38) * 0.05 * st.shake * (st.phase === 'failed' ? 1 : 0), Math.sin(t * 83) * amp * 0.35, 0);
      machine.rotation.z = Math.sin(t * 47) * 0.0012 * motionAmt * load;

      // sheet in: hovers above the slot until fed, then is pulled down into it (scroll-linked units sink it as you scroll)
      const yStart = TOP + SHEET_H / 2 + 0.75, yEnd = TOP - 0.55 - SHEET_H / 2;
      const bob = st.phase === 'idle' ? Math.sin(t * 1.5) * 0.08 : 0;
      let pInEff = st.pIn;
      if (props.current.scrollLinked && st.phase === 'idle') { const rr = el.getBoundingClientRect(); scrollP = clamp01(1 - rr.top / window.innerHeight); pInEff = 0.5 * scrollP; }
      inGroup.position.set(Math.sin(t * 9) * 0.004 * st.hum, yStart + (yEnd - yStart) * pInEff + bob, SLOT_Z);
      inGroup.rotation.set(0, 0, st.phase === 'idle' ? Math.sin(t * 1.1) * 0.012 : Math.sin(t * 17) * 0.002 * st.hum);
      inGroup.visible = st.pIn < 0.995 && st.pOut < 0.01;
      const cnt = props.current.stackCount;
      stackSheets.forEach((g, k) => {
        const sgn = k % 2 ? -1 : 1;
        g.visible = k < cnt - 1 && st.pOut < 0.01 && (st.phase === 'idle' || st.phase === 'feeding' || st.phase === 'failed');
        g.position.set(0.05 * (k + 1) * sgn, yStart + bob - 0.025 * (k + 1), SLOT_Z - 0.08 * (k + 1)); g.rotation.z = sgn * 0.014 * (k + 1);
      });
      // jam: the half-fed sheet crumples against the rollers and shudders
      st.jam += ((st.phase === 'failed' ? 1 : 0) - st.jam) * Math.min(1, dt * 3);
      if (hq && (st.jam > 0.003 || jamDirty)) {
        const ip = inGeo.attributes.position as THREE.BufferAttribute, j = st.jam;
        for (let i = 0; i < ip.count; i++) {
          const bx = inBase[i * 3], by = inBase[i * 3 + 1]; const w = 0.5 + 0.5 * Math.sin(by * 2.2 + 1.3);
          ip.setXYZ(i, bx * (1 - 0.06 * j * w), by * (1 - 0.14 * j) + 0.12 * j * Math.sin(bx * 3.1 + by * 1.7), 0.26 * j * Math.sin(by * 3.4 + bx * 1.9) + 0.018 * j * Math.sin(t * 41 + by * 5));
        }
        ip.needsUpdate = true; inGeo.computeVertexNormals(); jamDirty = st.jam > 0.003;
      }

      // sheet out: cloth when high quality, analytic droop when light
      const tail = FRONT_Z - SHEET_H + 0.1 + st.pOut * (SHEET_H + 0.4);
      if (st.pOut < 0.001) { clothLive = false; resetPose(tail); }
      else if (hq && (st.pOut >= 0.999 || drag.idx >= 0)) {
        if (!clothLive) { clothLive = true; droopPose(tail); for (let i = 0; i < NN; i++) { const k = i * 3; if (P[k + 2] > RAMP_Z0) P[k + 1] += 0.07; O[k] = P[k]; O[k + 1] = P[k + 1] - 0.0; O[k + 2] = P[k + 2]; } }
        clothStep(dt, tail);
      } else { clothLive = false; droopPose(tail); }
      for (let i = 0; i < NN; i++) pos.setXYZ(i, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      pos.needsUpdate = true; outGeo.computeVertexNormals(); outGeo.computeBoundingSphere();
      sheetOut.visible = st.pOut > 0.001; sheetOutBack.visible = sheetOut.visible;

      // contact shadow under the sheet + light spill from the exit slot
      const sm = sheetShadow.material as THREE.MeshBasicMaterial;
      if (st.pOut > 0.02) {
        let cx = 0, cy = 0, cz = 0, m = 0;
        for (let i = 0; i < NN; i++) if (P[i * 3 + 2] > FRONT_Z + 0.2) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; m++; }
        if (m > 3) { cx /= m; cy /= m; cz /= m; sheetShadow.position.set(cx, 0.014, cz); sheetShadow.scale.set(SHEET_W * 1.5, SHEET_H * (0.3 + 0.8 * (m / NN)), 1); sm.opacity = clamp01(0.75 - cy * 0.45) * Math.min(1, m / (NN * 0.25)); } else sm.opacity = 0;
      } else sm.opacity = 0;
      spillMat.opacity += ((st.phase === 'ejecting' ? 0.3 : 0) - spillMat.opacity) * Math.min(1, dt * 5);
      glossTex.offset.x = pointer.x * 0.12;

      // glow + LEDs
      const scanning = st.phase === 'feeding' || st.phase === 'scanning';
      const feedingMotion = Math.abs(st.pIn - prevIn) > 0;
      glowLine.opacity += (((scanning ? 0.55 + Math.sin(t * 22) * 0.18 : 0) * (feedingMotion || st.phase === 'scanning' ? 1 : 0.4)) - glowLine.opacity) * Math.min(1, dt * 10);
      slotGlow.intensity += ((scanning ? 1.1 + Math.sin(t * 6) * 0.3 : 0) - slotGlow.intensity) * Math.min(1, dt * 6);
      exitGlow.intensity += ((st.phase === 'ejecting' ? 1.4 : 0) - exitGlow.intensity) * Math.min(1, dt * 6);
      const blink = Math.floor(t * 2) % 2 === 0;
      const ledA = st.phase === 'failed' ? (blink ? 0xff3b1f : 0x220500) : busy ? 0x39e07b : st.phase === 'done' ? 0x39e07b : 0xffb84d;
      const ledB = st.phase === 'feeding' || st.phase === 'scanning' ? (blink ? 0xffb84d : 0x221400) : st.phase === 'failed' ? 0x220500 : 0x221400;
      leds[0].emissive.setHex(ledA); leds[0].emissiveIntensity = 2.2; leds[1].emissive.setHex(ledB); leds[1].emissiveIntensity = 2.2;

      // lcd text
      const lines = props.current.lcd; const tick = Math.floor(t * 2);
      const k = lines.join('|') + props.current.phase + tick;
      if (k !== lcdKey) { lcdKey = k; lcdTick = tick; drawLcd(lcdCanvasTex.image as HTMLCanvasElement, lines, props.current.phase, lcdTick); lcdCanvasTex.needsUpdate = true; }

      // preview sheet + stage effects
      ghostA += ((st.phase === 'scanning' ? 1 : 0) - ghostA) * Math.min(1, dt * 4);
      ghost.visible = ghostA > 0.01;
      if (ghost.visible) {
        gt += dt; const stg = props.current.stage;
        ghostMat.opacity = 0.96 * ghostA; frameMat.opacity = 0.85 * ghostA;
        ghost.position.y = ghostBaseY + Math.sin(t * 1.4) * 0.07; ghost.rotation.y = Math.sin(t * 0.55) * 0.09;
        (bar.material as THREE.MeshBasicMaterial).opacity = (stg === 'RENDER' || !stg ? 0.9 : 0) * ghostA;
        bar.position.y = (0.5 - ((gt * 0.5) % 1)) * SHEET_H;
        const n = rects.length;
        if (stg === 'EXTRACT' || stg === 'VALIDATE') { const idx = Math.floor(gt / (stg === 'EXTRACT' ? 0.3 : 0.2)); if (idx !== lastNote) { lastNote = idx; sound.note(idx); } } else lastNote = -1;
        rects.forEach((m, i) => {
          const mat = m.material as THREE.MeshBasicMaterial; let v = 0;
          if (stg === 'EXTRACT') { const ph = (gt / 0.3) % (n + 3); v = clamp01(1 - Math.abs(ph - i) / 1.5); mat.color.setHex(0xf4df4e); }
          else if (stg === 'VALIDATE') { const ph = (gt / 0.2) % (n + 6); v = ph > i ? 0.5 + 0.35 * clamp01(1 - Math.abs(ph - i) / 1.2) : 0; mat.color.setHex(0x39c27b); }
          mat.opacity = v * 0.78 * ghostA;
        });
      }

      // camera: gentle drift + pointer parallax
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3); pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);
      const fit = Math.max(1, 1.2 / aspect);
      const ang = -0.62 + pointer.x * 0.13 + Math.sin(t * 0.25) * 0.03 + (props.current.scrollLinked ? (scrollP - 0.5) * 0.8 : 0);
      const dist = 28 * fit, h = 10.2 + pointer.y * -0.9 + (fit - 1) * 3;
      camera.position.set(target.x + Math.sin(ang) * dist * 0.62, h, target.z + Math.cos(ang) * dist);
      camera.lookAt(target);
      const mv = new THREE.Vector3(0, 2, 0).project(camera); sound.machine(motionAmt, mv.x * 0.8);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf); window.clearTimeout(ejectedTimer); ro.disconnect(); io.disconnect();
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointermove', onDragMove); window.removeEventListener('pointerup', onUp); renderer.domElement.removeEventListener('pointerdown', onDown); sound.machine(0); realTex?.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); });
      });
      texIn.dispose(); texOut.dispose(); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove(); api.current = null;
    };
  }, []);

  useEffect(() => { api.current?.setPhase(phase); }, [phase]);
  useEffect(() => { api.current?.setSheet(filename, isRtl); }, [filename, isRtl]);
  useEffect(() => { api.current?.setDark(dark); }, [dark]);
  const boxKey = JSON.stringify(boxes ?? null);
  useEffect(() => { api.current?.setBoxes(boxes); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxKey]);
  useEffect(() => { api.current?.setPage(pageImageUrl); }, [pageImageUrl]);

  useEffect(() => {
    if (!failed || phase !== 'ejecting') return;
    const id = window.setTimeout(() => props.current.onEjected?.(), 2400);
    return () => window.clearTimeout(id);
  }, [failed, phase]);

  if (failed) {
    return (
      <div className={`grid place-items-center ${className ?? ''}`} role="img" aria-label="Document intake unit">
        <div className="relative h-40 w-72 rounded-2xl bg-paper-warm shadow-lift">
          <div className="absolute inset-x-6 top-4 h-3 rounded bg-ink" />
          <div className="absolute inset-x-10 bottom-6 h-24 origin-top animate-pulse rounded-b bg-paper shadow-sheet" />
        </div>
      </div>
    );
  }
  return <div ref={host} className={className} role="img" aria-label={isRtl ? 'جهاز استلام الفواتير' : 'Document intake unit'} />;
}
