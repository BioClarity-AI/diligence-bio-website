/**
 * Emergence — the hero's particle field.
 *
 * Ported from the React component in design/landing-bundle.html to plain
 * TypeScript. The simulation never needed React: it owns a canvas, a particle
 * array, and a rAF loop, and touches the DOM only to update the readout label.
 * Dropping the framework takes the hero from ~140KB of runtime to ~6KB.
 *
 * 340 particles ease between ten target formations — two separate populations
 * (AI and biology) that converge and then resolve up the scales of living
 * systems, molecule to organism.
 */

export interface EmergenceOptions {
  /** Playback rate multiplier. */
  speed: number;
  /** Seconds a formation is held before it morphs into the next. */
  holdTime: number;
  /** Opacity multiplier for the links drawn between nearby particles. */
  linkStrength: number;
  /** How strongly the pointer pushes particles away. */
  mouseForce: number;
  /** Ink-only rendering, no accent colour. */
  mono: boolean;
}

/**
 * Compiled-in fallbacks — the single source of truth for these values.
 * `public/settings.json` overrides them at runtime; this is what renders if
 * that file is missing, unreachable, or malformed.
 */
export const DEFAULTS: EmergenceOptions = {
  speed: 1.3,
  holdTime: 3.8,
  linkStrength: 1,
  mouseForce: 0.5,
  mono: false,
};

/** The tunable keys, in one place so the readers below stay in sync. */
const NUMERIC_KEYS = ['speed', 'holdTime', 'linkStrength', 'mouseForce'] as const;

export interface EmergenceHandle {
  /**
   * Retune a running simulation. Keys pinned by an explicit `data-*` attribute
   * are ignored, so a value set on the component always beats settings.json.
   */
  update(next: Partial<EmergenceOptions>): void;
  /** Stop the loop and remove every listener. */
  destroy(): void;
}

const SHAPES = [
  'separate', 'converge', 'molecular', 'dna', 'protein',
  'pathways', 'cell', 'tissue', 'organ', 'organism',
] as const;

type Shape = (typeof SHAPES)[number];

const LABELS: Record<Shape, string> = {
  separate: 'INITIALIZING',
  converge: 'CONVERGENCE',
  molecular: 'MOLECULAR',
  dna: 'DNA',
  protein: 'PROTEIN',
  pathways: 'PATHWAYS',
  cell: 'CELL',
  tissue: 'TISSUE',
  organ: 'ORGAN',
  organism: 'ORGANISM',
};

interface Particle {
  x: number; y: number; vx: number; vy: number;
  pop: number; hub: boolean;
  r1: number; r2: number; r3: number; r4: number; r5: number; r6: number;
}

const N = 340;
const TRANS = 1.8;

// Signalling pathway: membrane receptors -> kinase cascade -> nucleus -> feedback
// to the membrane. One CLOSED circuit, so flow beads never teleport.
const PATH: readonly [number, number][] = [
  [-0.42, -0.70], [-0.54, -0.38], [-0.34, -0.08], [-0.15, 0.22], [0, 0.46],
  [0.15, 0.22], [0.34, -0.08], [0.54, -0.38], [0.42, -0.70], [0, -0.70],
];

const INK = { r: 32, g: 30, b: 29 };
const RED = { r: 236, g: 48, b: 19 };

function readOptions(el: HTMLElement): EmergenceOptions {
  const num = (name: string, fallback: number) => {
    const raw = el.dataset[name];
    const parsed = raw == null ? NaN : Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    speed: num('speed', DEFAULTS.speed),
    holdTime: num('holdTime', DEFAULTS.holdTime),
    linkStrength: num('linkStrength', DEFAULTS.linkStrength),
    mouseForce: num('mouseForce', DEFAULTS.mouseForce),
    mono: el.dataset.mono != null ? el.dataset.mono === 'true' : DEFAULTS.mono,
  };
}

/**
 * Keys given explicitly as `data-*` on the element. These were authored on the
 * component deliberately, so settings.json must not overwrite them.
 */
function pinnedKeys(el: HTMLElement): Set<keyof EmergenceOptions> {
  const keys: (keyof EmergenceOptions)[] = [...NUMERIC_KEYS, 'mono'];
  return new Set(keys.filter((key) => el.dataset[key] != null));
}

export function initEmergence(root: HTMLElement): EmergenceHandle {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return { update() {}, destroy() {} };

  const opts = readOptions(root);
  const pinned = pinnedKeys(root);
  const readoutEl = root.querySelector<HTMLElement>('[data-readout]');
  const lockBtn = root.querySelector<HTMLButtonElement>('[data-lock]');
  const lockDot = root.querySelector<HTMLElement>('[data-lock-dot]');
  const lockLabel = root.querySelector<HTMLElement>('[data-lock-label]');
  const pagerEl = root.querySelector<HTMLElement>('[data-pager]');
  const pagerNumEl = root.querySelector<HTMLElement>('[data-pager-num]');
  const pagerTotalEl = root.querySelector<HTMLElement>('[data-pager-total]');
  const capEl = root.querySelector<HTMLElement>('[data-caption-bar]');
  const parent = canvas.parentElement as HTMLElement;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w = 0;
  let h = 0;
  const fit = () => {
    const r = parent.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(parent);

  const rand = (i: number, s: number) => {
    const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const ps: Particle[] = [];
  for (let i = 0; i < N; i++) {
    ps.push({
      x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0,
      pop: i % 2, hub: i % 11 === 0,
      r1: rand(i, 1), r2: rand(i, 2), r3: rand(i, 3),
      r4: rand(i, 4), r5: rand(i, 5), r6: rand(i, 6),
    });
  }

  const mouse = { x: 0, y: 0, on: false };
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.on = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= w && mouse.y <= h;
  };
  const onLeave = () => { mouse.on = false; };
  window.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);

  let targetSpeed = 1;
  let wheelT: number | undefined;
  const onWheel = () => {
    targetSpeed = 2.4;
    window.clearTimeout(wheelT);
    wheelT = window.setTimeout(() => { targetSpeed = 1; }, 450);
  };
  parent.addEventListener('wheel', onWheel, { passive: true });

  const n = SHAPES.length;
  let hold = opts.holdTime;
  let slot = hold + TRANS;
  let loop = slot * n;
  // holdTime is the only option the loop caches rather than reading per frame,
  // so a retune has to recompute the cycle it derives.
  const applyTiming = () => {
    hold = opts.holdTime;
    slot = hold + TRANS;
    loop = slot * n;
  };
  let tPhase = 0;
  const smooth = (x: number) => x * x * (3 - 2 * x);

  const PL: number[] = [];
  let PTOT = 0;
  for (let k = 0; k < PATH.length; k++) {
    const a = PATH[k]!;
    const b = PATH[(k + 1) % PATH.length]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    PL.push(l);
    PTOT += l;
  }
  const pt: [number, number] = [0, 0];
  const pathAt = (u: number) => {
    let d = (((u % 1) + 1) % 1) * PTOT;
    let k = 0;
    while (k < PL.length - 1 && d > PL[k]!) { d -= PL[k]!; k++; }
    const a = PATH[k]!;
    const b = PATH[(k + 1) % PATH.length]!;
    const f = PL[k] ? d / PL[k]! : 0;
    pt[0] = a[0] + (b[0] - a[0]) * f;
    pt[1] = a[1] + (b[1] - a[1]) * f;
  };

  const target = (
    shape: Shape, p: Particle, i: number, t: number,
    cx: number, cy: number, R: number, out: [number, number],
  ) => {
    let x = cx;
    let y = cy;
    switch (shape) {
      case 'separate': {
        if (p.pop === 0) {
          const ai = i >> 1;
          const nAI = Math.ceil(N / 2);
          const cols = Math.round(Math.sqrt(nAI));
          const rows = Math.ceil(nAI / cols);
          const col = ai % cols;
          const row = Math.floor(ai / cols);
          const s = (R * 1.25) / cols;
          x = cx - R * 0.82 + (col - (cols - 1) / 2) * s;
          y = cy + (row - (rows - 1) / 2) * s;
        } else {
          const a = p.r1 * Math.PI * 2 + t * 0.15;
          const rad = R * 0.62 * Math.sqrt(p.r2);
          x = cx + R * 0.82 + Math.cos(a) * rad;
          y = cy + Math.sin(a) * rad;
        }
        break;
      }
      case 'converge': {
        const r = R * 0.92 * Math.sqrt((i + 0.5) / N);
        const a = i * 2.399963 + t * 0.05;
        x = cx + Math.cos(a) * r;
        y = cy + Math.sin(a) * r;
        break;
      }
      case 'molecular': {
        const G = 6;
        const per = N / G;
        const g = Math.min(G - 1, Math.floor(i / per));
        const gi = i - g * per;
        const ga = (g / G) * Math.PI * 2 + t * 0.06;
        const ax = cx + Math.cos(ga) * R * 0.52;
        const ay = cy + Math.sin(ga) * R * 0.52;
        const shell = gi % 3;
        const dir = shell % 2 ? -1 : 1;
        const sr = shell === 0 ? R * 0.028 : R * (0.075 + (shell - 1) * 0.055);
        const sa = gi * 2.399963 + t * dir * (0.7 - shell * 0.18);
        x = ax + Math.cos(sa) * sr;
        y = ay + Math.sin(sa) * sr;
        break;
      }
      case 'dna': {
        const strand = i % 2;
        const j = i >> 1;
        const nPer = Math.ceil(N / 2);
        const u = j / nPer;
        const ph = u * Math.PI * 5 + t * 0.5;
        const amp = R * 0.36;
        y = cy - R * 0.95 + u * R * 1.9;
        // rungs between strands
        if (i % 9 === 8) x = cx + Math.sin(ph) * amp * (2 * p.r3 - 1);
        else x = cx + Math.sin(ph + strand * Math.PI) * amp;
        break;
      }
      case 'protein': {
        // ribbon diagram everyone knows: alpha-helix coil -> loop -> zigzag beta sheet
        const u = i / N;
        if (u < 0.45) {
          const v = u / 0.45;
          const x0 = cx - R * 0.85, y0 = cy - R * 0.5;
          const x1 = cx + R * 0.55, y1 = cy - R * 0.15;
          const bx = x0 + (x1 - x0) * v, by = y0 + (y1 - y0) * v;
          const ph = v * Math.PI * 16 + t * 0.35;
          const dxn = x1 - x0, dyn = y1 - y0;
          const len = Math.hypot(dxn, dyn);
          const px = -dyn / len, py = dxn / len;
          x = bx + px * Math.cos(ph) * R * 0.15 + (dxn / len) * Math.sin(ph) * R * 0.05;
          y = by + py * Math.cos(ph) * R * 0.15 + (dyn / len) * Math.sin(ph) * R * 0.05;
        } else if (u < 0.55) {
          const v = (u - 0.45) / 0.1;
          const x0 = cx + R * 0.55, y0 = cy - R * 0.15;
          const x1 = cx + R * 0.62, y1 = cy + R * 0.28;
          x = x0 + (x1 - x0) * v + Math.sin(v * Math.PI) * R * 0.22;
          y = y0 + (y1 - y0) * v;
        } else {
          const v = (u - 0.55) / 0.45;
          const strand = Math.min(2, Math.floor(v * 3));
          const wRaw = v * 3 - strand;
          const wdir = strand % 2 ? 1 - wRaw : wRaw;
          const zig = (Math.abs(((wdir * 7) % 1) - 0.5) - 0.25) * R * 0.16;
          x = cx - R * 0.72 + wdir * R * 1.34;
          y = cy + R * 0.22 + strand * R * 0.26 + zig + Math.sin(t * 0.4 + strand) * R * 0.015;
        }
        break;
      }
      case 'pathways': {
        const sc = R * 0.95;
        const m = i % 7;
        if (m < 2) {
          // lipid bilayer across the top
          const row = m;
          const j = Math.floor(i / 7);
          const per = Math.ceil(N / 7);
          const xn = -1 + 2 * ((j % per) / Math.max(1, per - 1));
          x = cx + xn * sc;
          y = cy + (-0.78 + row * 0.055) * sc + Math.sin(t * 0.5 + xn * 6) * R * 0.008;
        } else if (m === 2) {
          // nucleus at the pathway's output
          const a = p.r5 * Math.PI * 2;
          const rad = R * 0.16 * Math.sqrt(p.r6);
          x = cx + Math.cos(a) * rad;
          y = cy + 0.46 * sc + Math.sin(a) * rad * 0.8;
        } else if (m < 5) {
          // molecular complexes sitting at each pathway step
          const nd = PATH[i % PATH.length]!;
          const a = p.r3 * Math.PI * 2;
          const rad = R * 0.055 * Math.sqrt(p.r4);
          x = cx + nd[0] * sc + Math.cos(a) * rad;
          y = cy + nd[1] * sc + Math.sin(a) * rad;
        } else {
          // evenly spaced beads on the closed circuit — continuous flow
          const bead = Math.floor(i / 7) * 2 + (m - 5);
          const beads = Math.ceil(N / 7) * 2;
          pathAt(t * 0.038 + bead / beads);
          x = cx + pt[0] * sc;
          y = cy + pt[1] * sc;
        }
        break;
      }
      case 'cell': {
        const f = i / N;
        if (f < 0.44) {
          const a = (i / (0.44 * N)) * Math.PI * 2 + t * 0.05;
          const rr = R * 0.94 + (p.r1 - 0.5) * R * 0.03;
          x = cx + Math.cos(a) * rr;
          y = cy + Math.sin(a) * rr;
        } else if (f < 0.64) {
          const a = p.r2 * Math.PI * 2;
          const rr = R * 0.2 * Math.sqrt(p.r3);
          x = cx + Math.cos(a) * rr;
          y = cy + Math.sin(a) * rr;
        } else {
          const C = 4;
          const c = i % C;
          const ca = (c / C) * Math.PI * 2 + t * 0.1;
          const ox = cx + Math.cos(ca) * R * 0.55;
          const oy = cy + Math.sin(ca) * R * 0.55;
          const a = p.r4 * Math.PI * 2;
          const rr = R * 0.11 * Math.sqrt(p.r5);
          x = ox + Math.cos(a) * rr;
          y = oy + Math.sin(a) * rr;
        }
        break;
      }
      case 'tissue': {
        // packed epithelial sheet — hexagonal lattice of small cell rings
        const C = 19;
        const c = i % C;
        const gi = Math.floor(i / C);
        const cols = 5;
        const col = c % cols;
        const row = Math.floor(c / cols);
        const s = R * 0.42;
        const hx = cx + (col - (cols - 1) / 2) * s + (row % 2 ? s / 2 : 0);
        const hy = cy + (row - 1.5) * s * 0.87;
        const per = Math.ceil(N / C);
        const a = (gi / per) * Math.PI * 2 + t * (c % 2 ? 0.25 : -0.25);
        const rr = s * 0.46 * (1 + 0.06 * Math.sin(a * 3 + t * 0.4 + c));
        x = hx + Math.cos(a) * rr;
        y = hy + Math.sin(a) * rr * 0.92;
        break;
      }
      case 'organ': {
        // layered lobed cross-section — concentric folded shells
        const L = 4;
        const shell = i % L;
        const j = Math.floor(i / L);
        const nPer = Math.ceil(N / L);
        const u = j / nPer;
        const a = -Math.PI * 0.82 + u * Math.PI * 1.64 - Math.PI / 2;
        const base = R * (0.3 + shell * 0.19);
        const fold = 1 + 0.1 * Math.sin(a * 3 + t * 0.25 + shell * 0.8) + 0.05 * Math.sin(a * 7 - t * 0.2);
        x = cx + Math.cos(a) * base * fold + (p.r5 - 0.5) * R * 0.03;
        y = cy + Math.sin(a) * base * fold * 0.88 + (p.r6 - 0.5) * R * 0.03;
        break;
      }
      case 'organism': {
        const B = 7;
        const b = i % B;
        const j = Math.floor(i / B);
        const nPer = Math.ceil(N / B);
        const u = (j + p.r6) / nPer;
        const base = (b / B) * Math.PI * 2 + Math.sin(t * 0.12 + b * 1.7) * 0.035 * u;
        const curve = Math.sin(u * Math.PI * 1.6 + b + t * 0.12) * 0.55 * u;
        const ang = base + curve;
        const rad = u * R * 1.15 * (1 + 0.018 * Math.sin(t * 0.3 + b * 2.1 - u * 3.4));
        const perp = (p.r5 - 0.5) * R * 0.05 * (1 - u * 0.7) + Math.sin(t * 0.3 + u * 7 + b) * R * 0.008 * u;
        x = cx + Math.cos(ang) * rad + Math.cos(ang + Math.PI / 2) * perp;
        y = cy + Math.sin(ang) * rad + Math.sin(ang + Math.PI / 2) * perp;
        break;
      }
    }
    out[0] = x;
    out[1] = y;
  };

  const a0: [number, number] = [0, 0];
  const b0: [number, number] = [0, 0];
  let last = performance.now();
  let tGlobal = 0;
  let speed = 1;
  let curActive = '';
  /** Forces the readout to repaint even when the active shape has not changed. */
  let relabel = false;
  let locked = reduceMotion; // reduced motion: hold a formation instead of cycling
  let raf = 0;
  let running = true;

  // manual transition override: eases from one shape to another
  let ov: { from: number; to: number; p: number } | null = null;

  // The formation on screen right now, auto or manual. Stepping from the
  // segment index instead would jump back a shape when an auto transition is
  // already past halfway.
  let curIdx = 0;
  // Presses that arrive mid-transition, applied when the current one lands.
  let queued = 0;
  /** How far the running formation has got, 0..1 — what the pager tick fills. */
  let pagerFrac = 0;

  const nav = (d: number) => {
    if (ov) {
      // Reversing the move in flight: play it backwards from where it is.
      // The move under way went from -> to, so the press that undoes it is the
      // one whose step lands back on from. Testing `to - d` instead matches the
      // press that CONTINUES in the same direction, which is the opposite case.
      if ((((ov.to + d) % n) + n) % n === ov.from) {
        ov = { from: ov.to, to: ov.from, p: 1 - ov.p };
        return;
      }
      // Otherwise queue it. Restarting the ease from its destination makes
      // every particle target jump the remaining distance in one frame.
      queued = Math.max(-2, Math.min(2, queued + d));
      return;
    }
    ov = { from: curIdx, to: (((curIdx + d) % n) + n) % n, p: 0 };
  };
  const snap = () => {
    if (ov) { tPhase = ov.to * slot; return; }
    const tt = tPhase % loop;
    const seg = Math.floor(tt / slot);
    const local = tt - seg * slot;
    const bl = local < hold ? 0 : (local - hold) / TRANS;
    tPhase = (bl >= 0.5 ? (seg + 1) % n : seg) * slot;
  };

  /**
   * How much the spring toward the new targets is still being held back after a
   * pager jump, 1 down to 0. A jump changes every particle's target at once;
   * at full pull they would all cross the panel on the same frame, which reads
   * as a cut. Easing the pull in makes the network rewire into the formation.
   */
  let rewire = 0;

  /** Land straight on a formation, the way a transition ends — no morph. */
  const jump = (i: number) => {
    const to = ((i % n) + n) % n;
    if (to === curIdx && !ov) return;
    queued = 0;
    ov = null;
    curIdx = to;
    // Half a transition back from the slot's start: the same point the pager
    // measures a formation from, so its fill picks up where the eye expects.
    tPhase = to * slot - TRANS / 2;
    rewire = 1;
    relabel = true;
    if (locked) {
      locked = false;
      paintLock();
    }
  };

  const paintLock = () => {
    if (lockLabel) lockLabel.textContent = locked ? 'Locked' : 'Lock';
    if (lockDot) lockDot.style.background = locked ? 'currentColor' : 'transparent';
    if (lockBtn) {
      lockBtn.style.color = locked ? 'var(--color-accent)' : 'var(--color-neutral-600)';
      lockBtn.setAttribute('aria-pressed', String(locked));
    }
  };
  paintLock();

  /**
   * The pager: one tick per formation, the running one widened and filling.
   * Built here rather than in the markup because this module owns the
   * formation list — the component only says where the row goes.
   */
  const ticks: { el: HTMLElement; fill: HTMLElement }[] = [];
  if (pagerEl) {
    pagerEl.textContent = '';
    for (let i = 0; i < n; i++) {
      const tick = document.createElement('button');
      tick.type = 'button';
      tick.className = 'pager-tick';
      tick.title = LABELS[SHAPES[i]!];
      tick.setAttribute('aria-label', LABELS[SHAPES[i]!]);
      tick.addEventListener('click', () => jump(i));
      const fill = document.createElement('span');
      fill.className = 'pager-fill';
      tick.append(fill);
      pagerEl.append(tick);
      ticks.push({ el: tick, fill });
    }
    if (pagerTotalEl) pagerTotalEl.textContent = String(n).padStart(2, '0');
  }

  let curTick = -1;
  const paintPager = (i: number, frac: number) => {
    if (!ticks.length) return;
    if (i !== curTick) {
      curTick = i;
      ticks.forEach((tick, j) => {
        tick.el.classList.toggle('is-on', j === i);
        tick.el.classList.toggle('is-past', j < i);
        tick.el.setAttribute('aria-current', j === i ? 'true' : 'false');
        if (j !== i) tick.fill.style.width = '0%';
      });
      if (pagerNumEl) pagerNumEl.textContent = String(i + 1).padStart(2, '0');
    }
    ticks[i]!.fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  };

  const onPrev = () => nav(-1);
  const onNext = () => nav(1);
  const onLock = () => {
    locked = !locked;
    if (locked) snap();
    paintLock();
  };
  root.querySelector<HTMLElement>('[data-prev]')?.addEventListener('click', onPrev);
  root.querySelector<HTMLElement>('[data-next]')?.addEventListener('click', onNext);
  lockBtn?.addEventListener('click', onLock);

  const draw = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const sp = opts.speed;
    const linkK = opts.linkStrength;
    const mono = opts.mono;

    speed += (targetSpeed - speed) * 0.08;
    tGlobal += dt * speed * sp;
    if (!locked && !ov) tPhase += dt * speed * sp;

    // The caption bar owns the foot of the stage and the readout the head, so
    // the formation is centred on the band left between them rather than on
    // the panel. Measuring the bar means a wrapped caption pushes the drawing
    // up instead of being drawn over.
    const bandTop = 34;
    const bandBottom = (capEl ? capEl.getBoundingClientRect().height + 26 : 90) + 14;
    const drawH = Math.max(60, h - bandTop - bandBottom);
    const cx = w / 2;
    const cy = bandTop + drawH / 2;
    const R = Math.min(w, drawH) * 0.46;

    let cur: Shape;
    let nxt: Shape;
    let blend: number;
    let active: Shape;

    if (ov) {
      ov.p += (dt * speed * sp) / TRANS;
      if (ov.p >= 1) {
        const done = ov.to;
        tPhase = done * slot;
        cur = nxt = SHAPES[done]!;
        blend = 0;
        active = cur;
        curIdx = done;
        ov = null;
        pagerFrac = 0;
        if (queued) {
          const d = queued > 0 ? 1 : -1;
          queued -= d;
          ov = { from: done, to: (((done + d) % n) + n) % n, p: 0 };
        }
      } else {
        cur = SHAPES[ov.from]!;
        nxt = SHAPES[ov.to]!;
        blend = smooth(ov.p);
        active = blend < 0.5 ? cur : nxt;
        curIdx = blend < 0.5 ? ov.from : ov.to;
        pagerFrac = ov.p;
      }
    } else {
      const tt = tPhase % loop;
      const seg = Math.floor(tt / slot);
      const local = tt - seg * slot;
      cur = SHAPES[seg]!;
      nxt = SHAPES[(seg + 1) % n]!;
      blend = local < hold ? 0 : smooth((local - hold) / TRANS);
      active = blend < 0.5 ? cur : nxt;
      curIdx = blend < 0.5 ? seg : (seg + 1) % n;
      // One fill per formation, measured from mid-transition to mid-transition
      // so the tick advances with what the eye reads as the change.
      const half = hold + TRANS / 2;
      pagerFrac = ((local - half + slot) % slot) / slot;
    }

    if (rewire > 0) rewire = Math.max(0, rewire - dt / 1.5);

    for (let i = 0; i < N; i++) {
      const p = ps[i]!;
      target(cur, p, i, tGlobal, cx, cy, R, a0);
      let tx = a0[0];
      let ty = a0[1];
      if (blend > 0) {
        target(nxt, p, i, tGlobal, cx, cy, R, b0);
        tx = a0[0] + (b0[0] - a0[0]) * blend;
        ty = a0[1] + (b0[1] - a0[1]) * blend;
      }
      // After a jump every target moves at once; easing the spring in makes the
      // network rewire into the formation instead of cutting to it.
      const pull = 0.05 * (1 - 0.72 * rewire);
      let ax = (tx - p.x) * pull;
      let ay = (ty - p.y) * pull;
      if (mouse.on) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        const mr = R * 0.55;
        const mf = opts.mouseForce * 3.4;
        if (d2 < mr * mr) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / mr) * mf;
          ax += (dx / d) * f;
          ay += (dy / d) * f;
        }
      }
      p.vx = (p.vx + ax) * 0.86;
      p.vy = (p.vy + ay) * 0.86;
      p.x += p.vx;
      p.y += p.vy;
    }

    ctx.clearRect(0, 0, w, h);
    const link = R * 0.125;
    const link2 = link * link;
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      const p = ps[i]!;
      for (let j = i + 1; j < N; j++) {
        const q = ps[j]!;
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < link2) {
          const d = Math.sqrt(d2);
          const al = (1 - d / link) * 0.5 * linkK;
          const mixed = p.pop !== q.pop;
          if (mono) ctx.strokeStyle = `rgba(${INK.r},${INK.g},${INK.b},${al})`;
          else if (mixed) ctx.strokeStyle = `rgba(${RED.r},${RED.g},${RED.b},${al * 0.95})`;
          else if (p.pop === 1) ctx.strokeStyle = `rgba(${RED.r},${RED.g},${RED.b},${al * 0.5})`;
          else ctx.strokeStyle = `rgba(${INK.r},${INK.g},${INK.b},${al})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
    }
    for (let i = 0; i < N; i++) {
      const p = ps[i]!;
      const rr = p.hub ? 2.6 : 1.4;
      if (!mono && p.pop === 1) ctx.fillStyle = `rgba(${RED.r},${RED.g},${RED.b},0.95)`;
      else ctx.fillStyle = `rgba(${INK.r},${INK.g},${INK.b},0.9)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, 6.283);
      ctx.fill();
    }

    paintPager(curIdx % n, pagerFrac);

    if (active !== curActive || relabel) {
      curActive = active;
      relabel = false;
      if (readoutEl) readoutEl.textContent = LABELS[active];
    }

    if (running) raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  // Stop burning CPU when the hero is scrolled away or the tab is hidden.
  const setRunning = (next: boolean) => {
    if (next === running) return;
    running = next;
    if (running) { last = performance.now(); raf = requestAnimationFrame(draw); }
    else cancelAnimationFrame(raf);
  };
  const io = new IntersectionObserver(
    ([entry]) => setRunning(!!entry?.isIntersecting && !document.hidden),
    { threshold: 0 },
  );
  io.observe(parent);
  const onVisibility = () => setRunning(!document.hidden);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    update(next) {
      for (const key of NUMERIC_KEYS) {
        const value = next[key];
        if (pinned.has(key)) continue;
        if (typeof value === 'number' && Number.isFinite(value)) opts[key] = value;
      }
      if (!pinned.has('mono') && typeof next.mono === 'boolean') opts.mono = next.mono;
      applyTiming();
    },

    destroy() {
      cancelAnimationFrame(raf);
      running = false;
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      parent.removeEventListener('wheel', onWheel);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(wheelT);
    },
  };
}
