/**
 * The Services stage — four drawn scenes, one per service, on the shared
 * scene panel.
 *
 * Each scene argues its service rather than decorating it: candidates are
 * screened on whether they change a decision, vendor rankings are re-run on
 * your data, a product is built out of the client's own material, and evidence
 * accumulates until a gate resolves.
 *
 * The third slot is still being chosen between two competing builds —
 * fabrication and a kit of parts — so it ships as a `SceneChoice` with a picker
 * in the overlay rather than as a settled scene.
 */

import { initScenePanel, type Scene, type SceneChoice } from './scenePanel';
import type { LayoutSpec } from './canvasStage';
import { applySettings } from './settings';

/** Tunable from the `services` section of public/settings.json. */
export interface ServicesOptions {
  /** Playback rate multiplier for every scene. */
  speed: number;
  /** Ink-only rendering, no accent colour. */
  mono: boolean;
  /** Seconds the adoption-screening scene runs before the panel advances. */
  adoptionSeconds: number;
  /** Seconds the vendor-benchmark scene runs. */
  validationSeconds: number;
  /** Seconds the products scene runs, whichever build is picked. */
  productsSeconds: number;
  /** Seconds the portfolio-gate scene runs. */
  portfolioSeconds: number;
}

/**
 * Compiled-in fallbacks — the single source of truth for these values.
 * `public/settings.json` overrides them at runtime; this is what renders if
 * that file is missing, unreachable, or malformed.
 */
export const SERVICES_DEFAULTS: ServicesOptions = {
  speed: 1,
  mono: false,
  adoptionSeconds: 16.5,
  validationSeconds: 10.6,
  productsSeconds: 24,
  portfolioSeconds: 11.9,
};

export interface ServicesHandle {
  update(next: Partial<ServicesOptions>): void;
  destroy(): void;
}

/* ── SCENE 1 · Adoption screening ───────────────────────────────────────────
   Candidates are measured on whether they change a decision; usage alone never
   crosses the threshold. */

const CASES: readonly [string, number, number][] = [
  ['Target triage', 0.86, 0.34],
  ['Meeting summaries', 0.09, 0.94],
  ['Assay QC anomalies', 0.69, 0.48],
  ['Slide drafting', 0.07, 0.88],
  ['Trial site selection', 0.83, 0.29],
  ['Literature triage', 0.42, 0.81],
  ['Compound ranking', 0.77, 0.44],
  ['Chat rollout', 0.11, 0.97],
  ['Biomarker shortlist', 0.74, 0.26],
  ['Inbox triage', 0.05, 0.9],
  ['Cohort matching', 0.71, 0.56],
  ['Dose-response fits', 0.57, 0.37],
];

interface Candidate {
  name: string;
  impact: number;
  usage: number;
  age: number;
  x: number;
  y: number;
  verdict: 'adopt' | 'decline' | null;
  a: number;
}

export function adoptionScene(): Scene {
  let t = 0;
  let queue: number[] = [];
  let live: Candidate[] = [];
  let rail: { name: string; x: number; y: number }[] = [];
  let screened = 0;
  let adopted = 0;
  let next = 0.3;

  const reset = () => {
    t = 0;
    queue = CASES.map((_, i) => i);
    live = [];
    rail = [];
    screened = 0;
    adopted = 0;
    next = 0.3;
  };

  return {
    label: 'AI ADOPTION STRATEGY',
    duration: 16.5,
    reset,
    draw(dt, s) {
      const { ctx } = s;
      const showRail = !s.narrow;
      const railW = showRail ? Math.min(230, Math.max(160, s.w * 0.26)) : 0;
      const px1 = showRail ? s.x1 - railW - 34 : s.x1;
      const tx = s.x0 + (px1 - s.x0) * 0.62;
      const px = (v: number) => s.x0 + (px1 - s.x0) * v;
      const py = (v: number) => s.y1 - (s.y1 - s.y0) * v;

      t += dt;
      if (t > next && live.length < 5) {
        if (!queue.length) queue = CASES.map((_, i) => i);
        const [name, impact, usage] = CASES[queue.shift()!]!;
        live.push({ name, impact, usage, age: 0, x: s.x0 - 60, y: py(usage), verdict: null, a: 1 });
        next = t + 1.15;
      }

      s.line(s.x0, s.y0 - 14, s.x0, s.y1, s.rule, 2);
      s.line(s.x0, s.y1, px1, s.y1, s.rule, 2);

      // Axis titles: bold ink, a long drawn arrow, sized to the room available.
      const axisArrow = (x: number, y: number, len: number) => {
        s.line(x, y, x + len, y, s.ink, 2);
        s.line(x + len, y, x + len - 6, y - 4, s.ink, 2);
        s.line(x + len, y, x + len - 6, y + 4, s.ink, 2);
      };
      // Without the rail the tally shares this baseline — leave room for it.
      const tallyW = showRail ? 0 : s.mText('SCREENED 88   ADOPTED 88', 9, 800, '0.14em') + 16;
      const availW = px1 - s.x0 - tallyW;
      let xLabel = 'CHANGES THE SCIENTIFIC DECISION';
      let xfs = 12;
      if (s.mText(xLabel, xfs, 800, '0.14em') + 46 > availW) xLabel = 'CHANGES THE DECISION';
      if (s.mText(xLabel, xfs, 800, '0.14em') + 46 > availW) xfs = 10;
      if (s.mText(xLabel, xfs, 800, '0.14em') + 40 > availW) xLabel = 'DECISION IMPACT';
      const xw = s.mText(xLabel, xfs, 800, '0.14em');
      s.txt(xLabel, s.x0, s.y1 + 26, xfs, s.ink, 800, '0.14em');
      axisArrow(s.x0 + xw + 10, s.y1 + 22, Math.max(24, Math.min(64, availW - xw - 16)));

      const availH = s.y1 - s.y0;
      const yLabel = 'AI USAGE';
      const yw = s.mText(yLabel, xfs, 800, '0.14em');
      const yArrow = Math.max(24, Math.min(64, availH - yw - 30));
      // Lift the label up the axis: sitting in the corner it reads as a
      // continuation of the x-axis label below it. Clamped against the room
      // the text and its arrow need, so it cannot run off a short panel.
      const yLift = Math.min(56, Math.max(0, availH - yw - yArrow - 8));
      ctx.save();
      ctx.translate(s.x0 - 14, s.y1 - 8 - yLift);
      ctx.rotate(-Math.PI / 2);
      s.txt(yLabel, 0, 3, xfs, s.ink, 800, '0.14em');
      axisArrow(yw + 10, -1, yArrow);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = s.acc;
      ctx.fillRect(tx, s.y0 - 14, px1 - tx, s.y1 - s.y0 + 14);
      ctx.restore();
      s.line(tx, s.y0 - 14, tx, s.y1, s.acc, 2);
      s.txt(s.narrow ? 'THRESHOLD' : 'ADOPTION THRESHOLD', tx + 10, s.y0 - 22, 10, s.acc, 800, '0.14em');
      if (tx - s.x0 > 250) {
        s.txt('HIGH USAGE, NO DECISION CHANGE', s.x0 + 8, s.y0 - 22, 10, s.dim, 800, '0.14em');
      }

      for (let i = live.length - 1; i >= 0; i--) {
        const it = live[i]!;
        it.age += dt;
        const target = px(it.impact);
        if (it.age < 1) {
          it.x = s.lerp(s.x0 - 60, target, s.ease(it.age));
        } else if (it.age < 1.85) {
          const p = (it.age - 1) / 0.85;
          it.x = target + Math.sin(p * 26) * 9 * (1 - p);
        } else {
          it.x = target;
          if (!it.verdict) {
            it.verdict = it.impact >= 0.62 ? 'adopt' : 'decline';
            screened++;
            if (it.verdict === 'adopt') {
              adopted++;
              rail.unshift({ name: it.name, x: it.x, y: it.y });
              const rows = Math.max(3, Math.floor((s.y1 - s.y0 - 20) / 30));
              if (rail.length > rows) rail.length = rows;
            }
          }
        }

        const out = it.age - 2.35;
        if (it.verdict === 'decline' && out > 0) {
          const p = Math.min(1, out / 1.1);
          it.y = py(it.usage) + 46 * s.ease(p);
          it.a = 1 - p;
        }
        if (out > 1.1 || (it.verdict === 'adopt' && out > 0.05)) {
          live.splice(i, 1);
          continue;
        }

        const dec = it.verdict === 'decline';
        const size = dec ? 5 : 7;
        ctx.globalAlpha = it.a;
        if (dec) {
          ctx.strokeStyle = s.dim;
          ctx.lineWidth = 1;
          ctx.strokeRect(it.x - size / 2, it.y - size / 2, size, size);
        } else {
          ctx.fillStyle = it.verdict === 'adopt' ? s.acc : s.ink;
          ctx.fillRect(it.x - size / 2, it.y - size / 2, size, size);
        }

        const fs = s.tight ? 11 : 13;
        // Fade the name in only once the mark has cleared the axis gutter.
        const nameA = Math.max(0, Math.min(1, (it.x - s.x0 - 4) / 26));
        if (nameA > 0) {
          ctx.save();
          ctx.globalAlpha = it.a * nameA;
          s.txt(it.name, it.x + 13, it.y + 4, fs, dec ? s.dim : s.ink, dec ? 400 : 700);
          if (dec) s.line(it.x + 12, it.y, it.x + 16 + it.name.length * fs * 0.5, it.y, s.dim, 1);
          ctx.restore();
        }
        if (it.age >= 1 && it.age < 1.85) {
          ctx.save();
          ctx.strokeStyle = s.acc;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(it.x - 15, it.y - 15, 30, 30);
          ctx.restore();
          s.txt('MEASURING', it.x - 15, it.y - 23, 9, s.acc, 800, '0.14em');
        }
        ctx.globalAlpha = 1;
      }

      // Without the rail the tally moves to the caption row — the threshold
      // label already owns the top baseline.
      if (!showRail) {
        s.rtxt(`SCREENED ${screened}   ADOPTED ${adopted}`, s.x1, s.y1 + 26, 9, s.dim, 800, '0.14em');
        return;
      }

      const railX = px1 + 34;
      s.line(railX, s.y0 - 14, railX, s.y1, s.rule, 2);
      s.txt('ADOPTED', railX + 14, s.y0 - 22, 10, s.acc, 800, '0.14em');
      rail.forEach((r, i) => {
        const ty = s.y0 + 12 + i * 30;
        r.x = s.lerp(r.x, railX + 14, 0.12);
        r.y = s.lerp(r.y, ty, 0.12);
        ctx.fillStyle = s.acc;
        ctx.fillRect(r.x, r.y - 4, 7, 7);
        s.txt(r.name, r.x + 14, r.y + 3, s.tight ? 11 : 13, s.ink, 700);
        ctx.globalAlpha = 0.45;
        s.line(railX + 14, r.y + 14, s.x1, r.y + 14, s.rule, 1);
        ctx.globalAlpha = 1;
      });
      s.rtxt(`SCREENED ${screened}   ADOPTED ${adopted}`, s.x1, s.y1 + 26, 9, s.dim, 800, '0.14em');
    },
  };
}

/* ── SCENE 2 · Validation & benchmarking ────────────────────────────────────
   Vendor scores rank one way; re-run on your data, the ranking changes and the
   leader is not the one that was sold. */

const MODELS: readonly [string, number, number][] = [
  ['Model A', 0.94, 0.42],
  ['Model B', 0.76, 0.89],
  ['Model C', 0.83, 0.55],
  ['Model D', 0.58, 0.81],
  ['Model E', 0.7, 0.33],
];

interface ModelRow {
  name: string;
  vendor: number;
  yours: number;
  val: number;
  y: number;
  slot: number;
  set: boolean;
}

export function validationScene(): Scene {
  let t = 0;
  let rows: ModelRow[] = [];

  const reset = () => {
    t = 0;
    rows = MODELS.map(([name, vendor, yours], i) => ({ name, vendor, yours, val: 0, y: 0, slot: i, set: false }));
  };

  return {
    label: 'VALIDATION & BENCHMARKING',
    duration: 10.6,
    reset,
    draw(dt, s) {
      const { ctx } = s;
      t += dt;
      if (t > 10.8) reset();

      const phase = t < 3.2 ? 0 : t < 5.4 ? 1 : 2;
      const nameW = s.tight ? 92 : s.narrow ? 120 : 168;
      const valW = s.tight ? 34 : 62;
      const barX = s.x0 + nameW;
      const barW = Math.max(40, s.x1 - barX - valW);
      const rowH = Math.min(58, (s.y1 - s.y0 - 30) / 5);

      s.txt(
        phase === 0
          ? 'VENDOR BENCHMARK'
          : s.narrow
            ? 'RE-RUN ON YOUR DATA'
            : 'RE-RUN ON YOUR DATA, WORKFLOWS, STANDARDS',
        s.x0,
        s.y0 - 22,
        10,
        phase === 0 ? s.dim : s.acc,
        800,
        '0.14em',
      );

      const metric = (r: ModelRow) => (phase === 2 ? r.yours : r.vendor);
      rows
        .slice()
        .sort((a, b) => metric(b) - metric(a))
        .forEach((r, i) => {
          r.slot = i;
        });

      rows.forEach((r) => {
        const ty = s.y0 + 14 + r.slot * rowH;
        if (!r.set) {
          r.y = ty;
          r.set = true;
        } else {
          r.y = s.lerp(r.y, ty, 0.09);
        }
        r.val = s.lerp(r.val, phase === 0 ? r.vendor : metric(r), phase === 0 ? 0.05 : 0.06);

        const top = r.slot === 0;
        const weak = phase === 2 && r.yours < 0.5;
        s.line(s.x0, r.y + rowH * 0.62, s.x1, r.y + rowH * 0.62, s.rule, 1);
        s.txt(r.name, s.x0, r.y + rowH * 0.42, s.tight ? 12 : 15, weak ? s.dim : s.ink, 700);
        if (weak) s.line(s.x0, r.y + rowH * 0.36, s.x0 + Math.min(82, nameW - 14), r.y + rowH * 0.36, s.dim, 1);

        ctx.globalAlpha = 0.12;
        ctx.fillStyle = s.ink;
        ctx.fillRect(barX, r.y + rowH * 0.2, barW, 12);
        ctx.globalAlpha = 1;
        ctx.fillStyle = phase === 2 && top ? s.acc : weak ? s.dim : s.ink;
        ctx.fillRect(barX, r.y + rowH * 0.2, barW * Math.max(0, r.val), 12);
        s.rtxt(String(Math.round(r.val * 100)), s.x1, r.y + rowH * 0.42, s.tight ? 12 : 15, weak ? s.dim : s.ink, 800);
        if (phase === 2 && top) {
          s.txt(s.narrow ? 'PASSES' : 'PASSES ON YOUR DATA', barX, r.y + rowH * 0.2 - 8, 9, s.acc, 800, '0.14em');
        }
      });

      if (phase === 1) {
        const p = (t - 3.2) / 2.2;
        const sx = s.x0 + (s.x1 - s.x0) * p;
        s.line(sx, s.y0 - 6, sx, s.y1, s.acc, 2);
        s.txt('YOUR DATA', sx + 8, s.y0 + 2, 10, s.acc, 800, '0.14em');
      }

      s.txt(
        phase === 2
          ? s.narrow
            ? 'RANKING CHANGED'
            : 'RANKING CHANGED — THE VENDOR LEADER IS NOT YOURS'
          : 'SCORES AS PUBLISHED',
        s.x0,
        // Sit under the last row rule, not at the panel floor — rowH is capped,
        // so on tall panels the rows end well above y1.
        Math.min(s.y1 + 18, s.y0 + 14 + 4 * rowH + rowH * 0.62 + 30),
        11,
        phase === 2 ? s.acc : s.dim,
        800,
        '0.14em',
      );
    },
  };
}

/* ── SCENE 3 · AI & data products ───────────────────────────────────────────
   Fabrication. A solid is printed layer by layer out of the client's own
   material: a head sweeps each layer, deposits cool from accent to ink, and the
   finished object turns once. Then it breaks apart and the same material
   re-forms as a different object — same foundation, product shaped to you,
   rebuildable rather than fixed.

   Real perspective: a voxel world, orbited by a camera, depth-sorted back to
   front, faces shaded by normal so the solid reads as a solid. */

/** Two silhouettes, built from the same material, over a GRID × GRID plate. */
const GRID = 11;

/** Height maps, in voxel layers. 0 is nothing here. */
/** A stepped massif, off-centre. */
function shapeA(u: number, v: number): number {
  const dx = u - 4.2;
  const dy = v - 5.4;
  const r = Math.sqrt(dx * dx + dy * dy);
  return Math.max(0, Math.round(11 - r * 1.85 + Math.sin(u * 0.9) * 1.4 + Math.cos(v * 0.7) * 1.1));
}

/** A ring with a raised spine. */
function shapeB(u: number, v: number): number {
  const dx = u - 5;
  const dy = v - 5;
  const r = Math.sqrt(dx * dx + dy * dy);
  const ring = 8 - Math.abs(r - 3.1) * 3.4;
  const spine = v > 3.6 && v < 6.4 ? 6 - Math.abs(u - 5) * 0.8 : 0;
  return Math.max(0, Math.round(Math.max(ring, spine)));
}

/**
 * Phase boundaries in seconds: print → hold and turn → break apart → re-form as
 * the other. Every one has to fit inside half the loop — the shape flips at
 * FAB_LOOP / 2, so anything past that never plays.
 */
const FAB = { print: 7.2, hold: 8.8, fly: 11.4 };
/** Seconds for a full run: two objects, half each. */
const FAB_LOOP = 24;

interface Voxel {
  u: number;
  v: number;
  k: number;
}

function fabricationScene(): Scene {
  let t = 0;
  let shape = 0;
  let cells: Voxel[] = [];
  let perLayer: number[] = [];
  let top = 1;

  const build = (height: (u: number, v: number) => number) => {
    cells = [];
    top = 1;
    for (let u = 0; u < GRID; u++) {
      for (let v = 0; v < GRID; v++) {
        const hh = height(u, v);
        for (let k = 0; k < hh; k++) cells.push({ u, v, k });
        if (hh > top) top = hh;
      }
    }
    // Deposition order is by layer, then by the head's sweep across it.
    cells.sort((a, b) => a.k - b.k || (a.k % 2 ? -1 : 1) * (a.u - b.u) || a.v - b.v);
    perLayer = [];
    for (let k = 0; k < top; k++) perLayer[k] = cells.filter((c) => c.k === k).length;
  };

  const reset = () => {
    t = 0;
    shape = 0;
    build(shapeA);
  };

  return {
    label: 'AI & DATA PRODUCTS',
    duration: FAB_LOOP,
    reset,
    draw(dt, s) {
      const { ctx } = s;
      t += dt;

      // The second half of the loop prints the other silhouette.
      const half = FAB_LOOP / 2;
      const wanted = t >= half ? 1 : 0;
      if (wanted !== shape) {
        shape = wanted;
        build(wanted ? shapeB : shapeA);
      }
      if (t > FAB_LOOP) {
        reset();
        return;
      }
      const lt = t - (wanted ? half : 0); // local time within this object

      // Camera: slow orbit, fixed tilt.
      const spin = 0.55 + t * 0.16 + (lt > FAB.print ? (lt - FAB.print) * 0.34 : 0);
      const tilt = 0.62;
      const cx = (s.x0 + s.x1) / 2;
      const cy = (s.y0 + s.y1) / 2;
      const room = Math.min((s.x1 - s.x0) / 13.5, (s.y1 - s.y0) / 15);
      const vox = Math.max(9, Math.min(24, room)); // voxel size in px
      const sinA = Math.sin(spin);
      const cosA = Math.cos(spin);
      const proj = (u: number, v: number, k: number) => {
        const ux = (u - (GRID - 1) / 2) * vox;
        const vy = (v - (GRID - 1) / 2) * vox;
        const rx = ux * cosA - vy * sinA;
        const ry = ux * sinA + vy * cosA;
        // ry doubles as the painter's-sort depth.
        return { x: cx + rx, y: cy + ry * tilt - k * vox * 0.82 + vox * 2.4, d: ry - k * 0.6 };
      };

      // Build plate.
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (let i = 0; i <= GRID; i++) {
        const a = proj(i - 0.5, -0.5, 0);
        const b = proj(i - 0.5, GRID - 0.5, 0);
        const c = proj(-0.5, i - 0.5, 0);
        const e = proj(GRID - 0.5, i - 0.5, 0);
        s.line(a.x, a.y, b.x, b.y, s.dim, i % 5 === 0 ? 1 : 0.5);
        s.line(c.x, c.y, e.x, e.y, s.dim, i % 5 === 0 ? 1 : 0.5);
      }
      ctx.restore();

      // How much has been deposited.
      const printP = s.clamp01(lt / FAB.print);
      const madeN = Math.floor(printP * cells.length);
      const headCell = cells[Math.min(madeN, cells.length - 1)];
      const headK = headCell ? headCell.k : top;

      // Break-apart progress for the outgoing object.
      const flyP = s.ease(s.clamp01((lt - FAB.hold) / (FAB.fly - FAB.hold)));

      const drawn: { x: number; y: number; d: number; cell: Voxel; age: number; alpha: number }[] = [];
      for (let i = 0; i < madeN; i++) {
        const c = cells[i]!;
        const age = (printP * cells.length - i) / Math.max(1, perLayer[c.k]! * 0.9);
        let du = 0;
        let dv = 0;
        let dk = 0;
        let alpha = 1;
        if (flyP > 0) {
          // Scatter, then out.
          const seed = ((c.u * 37 + c.v * 91 + c.k * 13) % 100) / 100;
          const dir = seed * 6.28;
          du = Math.cos(dir) * flyP * 7;
          dv = Math.sin(dir) * flyP * 7;
          dk = (seed - 0.35) * flyP * 9;
          alpha = 1 - flyP;
        }
        const p = proj(c.u + du, c.v + dv, c.k + dk);
        drawn.push({ ...p, cell: c, age, alpha });
      }
      drawn.sort((a, b) => a.d - b.d);

      const halfVox = vox / 2;
      for (const it of drawn) {
        // Fresh deposits glow accent and cool to ink.
        const fresh = s.clamp01(1 - it.age);
        const hot = fresh > 0.02;
        const shade =
          0.42 + 0.5 * ((it.cell.k / Math.max(1, top)) * 0.5 + (Math.sin(spin + it.cell.u * 0.3) + 1) / 4);
        ctx.save();
        ctx.fillStyle = hot ? s.acc : s.ink;
        // Top face.
        ctx.globalAlpha = it.alpha * (hot ? 1 : 0.16 + 0.5 * shade);
        ctx.beginPath();
        ctx.moveTo(it.x, it.y - halfVox * tilt);
        ctx.lineTo(it.x + halfVox, it.y);
        ctx.lineTo(it.x, it.y + halfVox * tilt);
        ctx.lineTo(it.x - halfVox, it.y);
        ctx.closePath();
        ctx.fill();
        // One side face, for body.
        ctx.globalAlpha = it.alpha * (hot ? 0.8 : 0.1 + 0.34 * shade);
        ctx.beginPath();
        ctx.moveTo(it.x + halfVox, it.y);
        ctx.lineTo(it.x + halfVox, it.y + vox * 0.5);
        ctx.lineTo(it.x, it.y + halfVox * tilt + vox * 0.5);
        ctx.lineTo(it.x, it.y + halfVox * tilt);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // The print head: a bright plane sweeping the current layer.
      if (printP < 1 && flyP === 0) {
        const hp = proj(headCell ? headCell.u : 0, headCell ? headCell.v : 0, headK);
        const a = proj(-0.5, -0.5, headK);
        const b = proj(GRID - 0.5, -0.5, headK);
        const c = proj(GRID - 0.5, GRID - 0.5, headK);
        const e = proj(-0.5, GRID - 0.5, headK);
        ctx.save();
        ctx.strokeStyle = s.acc;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(e.x, e.y);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = s.acc;
        ctx.fillRect(hp.x - 3, hp.y - vox * 1.5, 6, vox * 1.2); // nozzle
        ctx.fillRect(hp.x - 5, hp.y - vox * 1.6 - 5, 10, 6);
        ctx.restore();
      }

      // Readouts.
      s.txt(
        `${shape ? 'BUILD 02' : 'BUILD 01'} — LAYER ${Math.min(headK + 1, top)}/${top}`,
        s.x0,
        s.y0 - 22,
        10,
        s.dim,
        800,
        '0.14em',
      );
      if (printP < 1) s.rtxt(`${Math.round(printP * 100)}%`, s.x1, s.y0 - 22, 10, s.acc, 800, '0.14em');
      else if (flyP === 0) s.rtxt('COMPLETE', s.x1, s.y0 - 22, 10, s.acc, 800, '0.14em');

      let cap: string;
      let col = s.ink;
      if (lt < FAB.print) {
        cap = shape ? 'REBUILT AROUND WHAT CHANGED' : 'BUILT FROM YOUR OWN DATA';
      } else if (lt < FAB.hold) {
        cap = 'A PRODUCT SHAPED TO YOUR SCIENCE';
      } else if (!shape) {
        cap = 'SAME MATERIAL — REBUILT, NOT REPLACED';
        col = s.acc;
      } else {
        cap = 'YOUR TEAMS KEEP BUILDING';
        col = s.acc;
      }
      s.txt(cap, s.x0, s.y1 + 26, s.mText(cap, 12, 800, '0.14em') < s.x1 - s.x0 ? 12 : 10, col, 800, '0.14em');
    },
  };
}


/* ── SCENE 3 · alternative build: kit of parts ───────────────────────────────
   Blocks fly in and snap together into a structure with visible joints, then
   break down and rebuild as a different configuration from the same parts:
   built around your workflows, not a platform's limits. Same camera as the
   fabrication build — isometric, depth-sorted. */

interface Part {
  w: number;
  d: number;
  h: number;
}

/** The same eight parts, in module units, whichever way they are arranged. */
const KIT: readonly Part[] = [
  { w: 3, d: 3, h: 1 },
  { w: 2, d: 3, h: 2 },
  { w: 3, d: 2, h: 1 },
  { w: 2, d: 2, h: 3 },
  { w: 4, d: 2, h: 1 },
  { w: 2, d: 4, h: 1 },
  { w: 1, d: 3, h: 2 },
  { w: 3, d: 1, h: 2 },
];

/** Where each part sits in each arrangement: [u, v, k] origin. */
const LAYOUT_A: readonly [number, number, number][] = [
  [0, 0, 0],
  [3, 0, 0],
  [0, 3, 0],
  [3, 3, 0],
  [0, 0, 1],
  [5, 0, 1],
  [3, 3, 2],
  [0, 5, 2],
];

const LAYOUT_B: readonly [number, number, number][] = [
  [2, 2, 0],
  [0, 0, 0],
  [2, 0, 1],
  [5, 0, 0],
  [0, 3, 1],
  [2, 3, 2],
  [6, 2, 1],
  [0, 2, 3],
];

/** Phase boundaries in seconds, within one arrangement's half of the loop. */
const KIT_IN = 3.6;
const KIT_HOLD = 8.2;
const KIT_OUT = 10.6;
/** One full run assembles both arrangements, half each. */
const KIT_HALF = 12;
const KIT_LOOP = 24;

interface Block {
  part: Part;
  u: number;
  v: number;
  k: number;
  alpha: number;
  settled: boolean;
  depth: number;
  /** Seconds since this part snapped into place; negative before it lands. */
  sinceLanded: number;
}

function kitScene(): Scene {
  let t = 0;
  let config = 0;

  const reset = () => {
    t = 0;
    config = 0;
  };

  return {
    label: 'AI & DATA PRODUCTS',
    duration: KIT_LOOP,
    reset,
    draw(dt, s) {
      const { ctx } = s;
      t += dt;
      if (t > KIT_LOOP) t = 0;

      // The second half of the loop rebuilds the same parts the other way.
      config = t >= KIT_HALF ? 1 : 0;
      const lt = t - (config ? KIT_HALF : 0); // local time within this arrangement
      const layout = config ? LAYOUT_B : LAYOUT_A;

      const spin = 0.62 + t * 0.11;
      const tilt = 0.58;
      const cx = (s.x0 + s.x1) / 2;
      const cy = (s.y0 + s.y1) / 2;
      const mod = Math.max(11, Math.min(30, Math.min((s.x1 - s.x0) / 12, (s.y1 - s.y0) / 13)));
      const sinA = Math.sin(spin);
      const cosA = Math.cos(spin);
      const proj = (u: number, v: number, k: number) => {
        const ux = (u - 3.5) * mod;
        const vy = (v - 3.5) * mod;
        const rx = ux * cosA - vy * sinA;
        const ry = ux * sinA + vy * cosA;
        return { x: cx + rx, y: cy + ry * tilt - k * mod * 0.8 + mod * 1.6, d: ry - k * 0.7 };
      };

      // Ground grid.
      ctx.save();
      ctx.globalAlpha = 0.4;
      for (let i = 0; i <= 8; i++) {
        const a = proj(i, 0, 0);
        const b = proj(i, 8, 0);
        const c = proj(0, i, 0);
        const e = proj(8, i, 0);
        s.line(a.x, a.y, b.x, b.y, s.dim, 0.6);
        s.line(c.x, c.y, e.x, e.y, s.dim, 0.6);
      }
      ctx.restore();

      const arriveOf = (i: number) => s.ease(s.clamp01((lt - i * 0.33) / 1.15));
      const leaveOf = (i: number) => s.ease(s.clamp01((lt - KIT_HOLD - i * 0.2) / (KIT_OUT - KIT_HOLD)));

      const blocks: Block[] = [];
      KIT.forEach((part, i) => {
        const origin = layout[i]!;
        const arrive = arriveOf(i); // flown in, staggered
        const leave = leaveOf(i);
        const alpha = Math.min(arrive, 1 - leave);
        if (alpha <= 0.02) return;

        // Off-board start, snap into place, then break away the same way out.
        const seed = ((i * 53) % 17) / 17;
        const dir = seed * 6.283;
        const offU = Math.cos(dir) * 9;
        const offV = Math.sin(dir) * 9;
        const offK = 5 + seed * 4;
        const u = s.lerp(origin[0] + offU, origin[0], arrive) + offU * leave * 1.1;
        const v = s.lerp(origin[1] + offV, origin[1], arrive) + offV * leave * 1.1;
        const k = s.lerp(origin[2] + offK, origin[2], arrive) + offK * leave * 1.1;

        blocks.push({
          part,
          u,
          v,
          k,
          alpha,
          settled: arrive >= 1 && leave === 0,
          depth: proj(u + part.w / 2, v + part.d / 2, k).d,
          sinceLanded: lt - (i * 0.33 + 1.15),
        });
      });
      blocks.sort((a, b) => a.depth - b.depth);

      for (const b of blocks) {
        const { part, u, v, k, alpha } = b;
        const top = [
          proj(u, v, k + part.h),
          proj(u + part.w, v, k + part.h),
          proj(u + part.w, v + part.d, k + part.h),
          proj(u, v + part.d, k + part.h),
        ];
        const backLeft = proj(u, v + part.d, k);
        const backRight = proj(u + part.w, v + part.d, k);
        const frontRight = proj(u + part.w, v, k);
        // A part flares accent as it lands, then settles to ink.
        const fresh = s.clamp01(1 - Math.abs(b.sinceLanded) / 0.5);

        ctx.save();
        const face = (pts: { x: number; y: number }[], shade: number, fill: string) => {
          ctx.globalAlpha = alpha * shade;
          ctx.fillStyle = fill;
          ctx.beginPath();
          pts.forEach((p, n) => (n ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.closePath();
          ctx.fill();
          // Every part keeps its edge: the joints are the point of the scene.
          ctx.globalAlpha = alpha * 0.55;
          ctx.strokeStyle = s.ink;
          ctx.lineWidth = 1;
          ctx.stroke();
        };
        face(top, 0.1 + fresh * 0.5, fresh > 0.05 ? s.acc : s.ink);
        face([top[3]!, top[2]!, backRight, backLeft], 0.24, s.ink);
        face([top[2]!, top[1]!, frontRight, backRight], 0.14, s.ink);
        ctx.restore();
      }

      // Joints: accent marks where two settled parts meet along u.
      if (lt > 1.4 && lt < KIT_OUT) {
        ctx.save();
        ctx.fillStyle = s.acc;
        ctx.globalAlpha = 0.9;
        for (let i = 0; i < KIT.length; i++) {
          const a = layout[i]!;
          const pa = KIT[i]!;
          for (let j = i + 1; j < KIT.length; j++) {
            const b = layout[j]!;
            const pb = KIT[j]!;
            const meets =
              (Math.abs(a[0] + pa.w - b[0]) < 0.01 || Math.abs(b[0] + pb.w - a[0]) < 0.01) &&
              Math.abs(a[1] - b[1]) < 3 &&
              Math.abs(a[2] - b[2]) < 2;
            if (!meets) continue;
            if (Math.min(arriveOf(i), arriveOf(j)) < 1 || leaveOf(i) > 0) continue;
            const mid = proj(a[0] + pa.w, (a[1] + b[1]) / 2 + 0.5, Math.max(a[2], b[2]) + 0.4);
            ctx.fillRect(mid.x - 2.5, mid.y - 2.5, 5, 5);
          }
        }
        ctx.restore();
      }

      const placed = blocks.filter((b) => b.settled).length;
      s.txt(`KIT — ${config ? 'CONFIGURATION 02' : 'CONFIGURATION 01'}`, s.x0, s.y0 - 22, 10, s.dim, 800, '0.14em');
      s.rtxt(`${placed}/${KIT.length} PARTS`, s.x1, s.y0 - 22, 10, s.acc, 800, '0.14em');

      let cap: string;
      let col = s.ink;
      if (lt < KIT_IN) {
        cap = config ? 'THE SAME PARTS, ARRANGED DIFFERENTLY' : 'MODULAR PARTS, NOT A FIXED PLATFORM';
      } else if (lt < KIT_HOLD) {
        cap = 'ASSEMBLED AROUND YOUR WORKFLOWS';
      } else if (!config) {
        cap = 'WORKFLOWS CHANGE — SO DOES THE BUILD';
        col = s.acc;
      } else {
        cap = 'YOUR TEAMS KEEP BUILDING';
        col = s.acc;
      }
      s.txt(cap, s.x0, s.y1 + 26, s.mText(cap, 12, 800, '0.14em') < s.x1 - s.x0 ? 12 : 10, col, 800, '0.14em');
    },
  };
}

/**
 * The two competing builds of the third service. The panel shows a picker while
 * this slot is on screen; adding a concept is one more entry here.
 */
export function productsChoice(): SceneChoice {
  return {
    label: 'AI & DATA PRODUCTS',
    // Order is the running order: the first entry is the letter the stage
    // opens on. The kit of parts leads.
    variants: [
      {
        id: 'A',
        label: 'Kit of parts',
        title: 'Modular parts, reassembled per workflow',
        scene: kitScene(),
      },
      {
        id: 'B',
        label: 'Fabrication',
        title: 'A product printed from your own data',
        scene: fabricationScene(),
      },
    ],
  };
}

/* ── SCENE 4 · Scientific & portfolio intelligence ──────────────────────────
   Evidence accumulates along each program until its next gate resolves:
   advance, hold, or stop. Columns are measured, not assumed, so the verdicts
   never run off a narrow panel. */

type Verdict = 'advance' | 'stop' | 'hold';

const PROGRAMS: readonly [string, number, Verdict][] = [
  ['Program A-114', 0.58, 'advance'],
  ['Program B-207', 0.72, 'stop'],
  ['Program C-031', 0.44, 'advance'],
  ['Program D-560', 0.8, 'hold'],
  ['Program E-088', 0.62, 'advance'],
];

const VERDICT: Record<Verdict, string> = {
  advance: 'ADVANCE',
  stop: 'STOP',
  hold: 'HOLD FOR EVIDENCE',
};

interface ProgramRow {
  name: string;
  gate: number;
  verdict: Verdict;
  n: number;
  start: number;
  done: boolean;
}

export function portfolioScene(): Scene {
  let t = 0;
  let rows: ProgramRow[] = [];

  const reset = () => {
    t = 0;
    rows = PROGRAMS.map(([name, gate, verdict], i) => ({
      name,
      gate,
      verdict,
      n: 0,
      start: 0.5 + i * 0.45,
      done: false,
    }));
  };

  return {
    label: 'PORTFOLIO INTELLIGENCE',
    duration: 11.9,
    reset,
    draw(dt, s) {
      const { ctx } = s;
      t += dt;
      if (t > 12) reset();

      const avail = s.x1 - s.x0;
      const nameSize = avail < 420 ? 11 : 14;
      const shortNames = avail < 520;
      const nameOf = (r: ProgramRow) => (shortNames ? r.name.split(' ')[1] || r.name : r.name);
      const nameW = Math.max(...rows.map((r) => s.mText(nameOf(r), nameSize, 700))) + 18;

      // Widest verdict block: glyph + gap + label.
      const GLYPH = 14;
      const GAP = 8;
      const labelSize = 11;
      let verdictW = GLYPH + GAP + Math.max(...Object.values(VERDICT).map((v) => s.mText(v, labelSize, 800, '0.14em'))) + 10;
      let showLabels = true;
      if (nameW + 120 + verdictW > avail) {
        verdictW = GLYPH + GAP + s.mText('HOLD', labelSize, 800, '0.14em') + 10;
      }
      if (nameW + 110 + verdictW > avail) {
        showLabels = false;
        verdictW = GLYPH + 14;
      }

      const trackX = s.x0 + nameW;
      const trackW = Math.max(60, avail - nameW - verdictW);
      const rowH = (s.y1 - s.y0 - 20) / 5;

      s.txt('EVIDENCE  →', trackX, s.y0 - 22, 10, s.dim, 800, '0.14em');
      if (avail - nameW - verdictW > 220) s.rtxt('NEXT DECISION', s.x1, s.y0 - 22, 10, s.acc, 800, '0.14em');

      let made = 0;
      rows.forEach((r, i) => {
        const y = s.y0 + 18 + i * rowH;
        const gateX = trackX + trackW * r.gate;
        s.line(trackX, y, trackX + trackW, y, s.rule, 1);
        s.txt(nameOf(r), s.x0, y + 4, nameSize, r.done && r.verdict === 'stop' ? s.dim : s.ink, 700);

        const step = avail < 420 ? 9 : 13;
        r.n = Math.min(Math.floor(Math.max(0, (t - r.start) / 0.28)), 60);
        for (let k = 0; k < r.n; k++) {
          const x = trackX + 6 + k * step;
          if (x > gateX - 4) break;
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = s.ink;
          ctx.fillRect(x, y - 3, 5, 5);
          ctx.restore();
        }

        const reached = trackX + 6 + r.n * step >= gateX - 4;
        s.line(gateX, y - 15, gateX, y + 15, reached ? s.acc : s.dim, 2);
        if (!reached) return;

        r.done = true;
        made++;
        const lx = trackX + trackW + 10;
        if (r.verdict === 'advance') {
          ctx.fillStyle = s.acc;
          ctx.beginPath();
          ctx.moveTo(lx, y - 6);
          ctx.lineTo(lx + 11, y);
          ctx.lineTo(lx, y + 6);
          ctx.closePath();
          ctx.fill();
        } else if (r.verdict === 'stop') {
          ctx.save();
          ctx.strokeStyle = s.dim;
          ctx.lineWidth = 2;
          ctx.strokeRect(lx, y - 6, 12, 12);
          ctx.restore();
          s.line(lx, y - 6, lx + 12, y + 6, s.dim, 2);
        } else {
          s.line(lx + 2, y - 6, lx + 2, y + 6, s.ink, 2);
          s.line(lx + 8, y - 6, lx + 8, y + 6, s.ink, 2);
        }

        if (showLabels) {
          const label =
            verdictW > GLYPH + GAP + 60 ? VERDICT[r.verdict] : r.verdict === 'hold' ? 'HOLD' : VERDICT[r.verdict];
          s.txt(
            label,
            lx + GLYPH + GAP,
            y + 4,
            labelSize,
            r.verdict === 'advance' ? s.acc : r.verdict === 'stop' ? s.dim : s.ink,
            800,
            '0.14em',
          );
        }
      });

      s.rtxt(`${avail < 520 ? 'RESOLVED ' : 'DECISIONS RESOLVED '}${made} / 5`, s.x1, s.y1 + 18, 11, s.dim, 800, '0.14em');
    },
  };
}

/** Stage geometry the services scenes are drawn against. */
export const SERVICES_LAYOUT: LayoutSpec = {
  gutter: [46, 30],
  inset: [40, 22],
  bottom: 90,
  topGap: 46,
};

export function initServices(root: HTMLElement): ServicesHandle {
  const opts: ServicesOptions = { ...SERVICES_DEFAULTS };

  const panel = initScenePanel(root, {
    scenes: [adoptionScene(), validationScene(), productsChoice(), portfolioScene()],
    sectionAttr: 'data-svc',
    titleAttr: 'data-svc-title',
    hashPrefix: 'svc',
    pickEvent: 'dbio:service',
    gutter: [46, 30],
    inset: [40, 22],
    bottom: 90,
    topGap: 46,
  });

  // The panel takes durations positionally; this is the one place that knows
  // which scene each named setting belongs to.
  const push = () =>
    panel.update({
      speed: opts.speed,
      mono: opts.mono,
      durations: [opts.adoptionSeconds, opts.validationSeconds, opts.productsSeconds, opts.portfolioSeconds],
    });
  push();

  return {
    update(next) {
      applySettings(opts, next);
      push();
    },
    destroy: () => panel.destroy(),
  };
}
