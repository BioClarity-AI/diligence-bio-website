/**
 * The Science stage — two drawn scenes on the shared scene panel.
 *
 * The first is the platform: unresolved claims cross a measurement seam and
 * either lock into what is known or fall away. The second is the question the
 * generalizability metrics exist to answer: how far past what a model was shown
 * does its understanding still hold?
 */

import { initScenePanel, type Scene } from './scenePanel';
import type { LayoutSpec } from './canvasStage';
import { applySettings } from './settings';

/** Tunable from the `science` section of public/settings.json. */
export interface ScienceOptions {
  /** Playback rate multiplier for both scenes. */
  speed: number;
  /** Ink-only rendering, no accent colour. */
  mono: boolean;
  /** Seconds the measurement-layer scene runs before the panel advances. */
  platformSeconds: number;
  /** Seconds the generalizability-frontier scene runs. */
  generalizabilitySeconds: number;
}

/**
 * Compiled-in fallbacks — the single source of truth for these values.
 * `public/settings.json` overrides them at runtime.
 */
export const SCIENCE_DEFAULTS: ScienceOptions = {
  speed: 1,
  mono: false,
  platformSeconds: 14,
  generalizabilitySeconds: 15,
};

export interface ScienceHandle {
  update(next: Partial<ScienceOptions>): void;
  destroy(): void;
}

/* ── SCENE 1 · PLATFORM — the measurement layer ─────────────────────────────
   Unresolved claims drift out of the unknown; each one crosses a single
   measurement seam, is read, and either locks into the known grid or falls
   away. Model → measurement → decision. */

interface Claim {
  x: number;
  y: number;
  y0: number;
  ph: number;
  vx: number;
  pass: boolean;
  state: 'drift' | 'scan' | 'fly' | 'fall';
  a: number;
  sT: number;
  fx: number;
  fy: number;
  slot: number;
}

export function platformScene(): Scene {
  let t = 0;
  let parts: Claim[] = [];
  let assigned = 0;
  let landed: number[] = [];
  let next = 0.25;
  let full = 0;

  const reset = () => {
    t = 0;
    parts = [];
    assigned = 0;
    landed = [];
    next = 0.25;
    full = 0;
  };

  return {
    label: 'PLATFORM',
    duration: 14,
    reset,
    draw(dt, s) {
      const { ctx } = s;
      t += dt;

      const seamX = s.x0 + (s.x1 - s.x0) * (s.narrow ? 0.5 : 0.55);
      const cell = s.tight ? 24 : 28;
      const gx0 = seamX + (s.tight ? 26 : 44);
      const gx1 = s.x1 - 4;
      const cols = Math.max(2, Math.floor((gx1 - gx0) / cell));
      const rows = Math.max(3, Math.floor((s.y1 - s.y0 - 8) / cell));
      const cap = cols * rows;
      const slotPos = (i: number): [number, number] => [
        gx0 + (i % cols) * cell + cell / 2,
        s.y0 + 10 + Math.floor(i / cols) * cell + cell / 2,
      ];

      // Frame.
      s.txt('UNKNOWN', s.x0, s.y0 - 22, 10, s.dim, 800, '0.14em');
      s.rtxt('KNOWN', s.x1, s.y0 - 22, 10, s.ink, 800, '0.14em');
      s.line(seamX, s.y0 - 14, seamX, s.y1, s.acc, 2);
      ctx.save();
      ctx.translate(seamX - 8, s.y1 - 6);
      ctx.rotate(-Math.PI / 2);
      s.txt(s.y1 - s.y0 > 240 ? 'MEASUREMENT LAYER' : 'MEASURE', 0, 0, 9, s.acc, 800, '0.16em');
      ctx.restore();

      // Spawn.
      if (t > next && parts.length < 11 && assigned < cap) {
        parts.push({
          x: s.x0 - 14,
          y: 0,
          y0: s.y0 + 14 + Math.random() * (s.y1 - s.y0 - 28),
          ph: Math.random() * 6.28,
          vx: 42 + Math.random() * 26,
          pass: Math.random() < 0.84,
          state: 'drift',
          a: 1,
          sT: 0,
          fx: 0,
          fy: 0,
          slot: 0,
        });
        next = t + 0.55;
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]!;
        if (p.state === 'drift') {
          p.x += p.vx * dt;
          p.y = p.y0 + Math.sin(t * 0.9 + p.ph) * 9;
          ctx.save();
          ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 3 + p.ph * 2);
          ctx.strokeStyle = s.dim;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
          ctx.restore();
          if (p.x >= seamX - 14) {
            p.state = 'scan';
            p.sT = 0;
          }
        } else if (p.state === 'scan') {
          p.sT += dt;
          ctx.save();
          ctx.strokeStyle = s.dim;
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = 0.8;
          ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
          ctx.restore();
          ctx.save();
          ctx.strokeStyle = s.acc;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(p.x - 12, p.y - 12, 24, 24);
          ctx.restore();
          if (p.sT > 0.65) {
            if (p.pass && assigned < cap) {
              p.slot = assigned++;
              p.state = 'fly';
              p.sT = 0;
              p.fx = p.x;
              p.fy = p.y;
            } else {
              p.state = 'fall';
              p.sT = 0;
            }
          }
        } else if (p.state === 'fly') {
          p.sT += dt;
          const [tx, ty] = slotPos(p.slot);
          const e = s.ease(Math.min(1, p.sT / 0.7));
          ctx.fillStyle = s.ink;
          ctx.fillRect(s.lerp(p.fx, tx, e) - 4, s.lerp(p.fy, ty, e) - 4, 8, 8);
          if (p.sT >= 0.7) {
            landed.push(p.slot);
            parts.splice(i, 1);
          }
        } else {
          p.sT += dt;
          p.y += 60 * dt;
          p.a -= dt * 1.4;
          if (p.a <= 0) {
            parts.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.a);
          ctx.strokeStyle = s.dim;
          ctx.lineWidth = 1;
          ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
          s.line(p.x - 6, p.y - 6, p.x + 6, p.y + 6, s.dim, 1);
          ctx.restore();
        }
      }

      // The known grid — measured claims, locked in place.
      landed.forEach((slot, j) => {
        const [x, y] = slotPos(slot);
        ctx.fillStyle = j % 7 === 3 ? s.acc : s.ink;
        ctx.fillRect(x - 4, y - 4, 8, 8);
      });
      if (landed.length >= cap) {
        full += dt;
        if (full > 2) reset();
      }

      const cap1 = 'MODEL → MEASUREMENT → DECISION';
      s.txt(
        s.mText(cap1, 12, 800, '0.14em') < s.x1 - s.x0 - 90 ? cap1 : 'MEASURE, THEN DECIDE',
        s.x0,
        s.y1 + 26,
        12,
        s.ink,
        800,
        '0.14em',
      );
      s.rtxt(`RESOLVED ${landed.length}`, s.x1, s.y1 + 26, 9, s.dim, 800, '0.14em');
    },
  };
}

/* ── SCENE 2 · GENERALIZABILITY — the frontier ──────────────────────────────
   Biology is a lattice mostly unseen. A model is shown a small region; the
   frontier is how far its understanding holds beyond it. Where it holds, the
   unknown resolves; where it breaks, it stays dark. */

const hash = (i: number, j: number, k = 0) => {
  const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return x - Math.floor(x);
};

export function frontierScene(): Scene {
  let t = 0;
  const reset = () => {
    t = 0;
  };

  return {
    label: 'GENERALIZABILITY',
    duration: 15,
    reset,
    draw(dt, s) {
      const { ctx } = s;
      t += dt;

      const cx = s.x0 + (s.x1 - s.x0) * 0.5;
      const cy = (s.y0 + s.y1) / 2;
      const sp = Math.max(30, Math.min(48, (s.x1 - s.x0) / 13));
      const r0 = sp * 1.55;
      const rate = sp * 0.5;
      const maxD = Math.max(cx - s.x0, s.x1 - cx, cy - s.y0, s.y1 - cy);
      const R = r0 + t * rate;
      if (R > maxD + sp * 2.4) {
        reset();
        return;
      }

      let holds = 0;
      let breaks = 0;
      const i0 = Math.floor((s.x0 - cx) / sp);
      const i1 = Math.ceil((s.x1 - cx) / sp);
      const j0 = Math.floor((s.y0 - cy) / sp);
      const j1 = Math.ceil((s.y1 - cy) / sp);

      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const x = cx + i * sp + (hash(i, j, 1) - 0.5) * sp * 0.4;
          const y = cy + j * sp + (hash(i, j, 2) - 0.5) * sp * 0.4;
          if (x < s.x0 || x > s.x1 || y < s.y0 - 4 || y > s.y1) continue;

          const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
          if (d <= r0) {
            ctx.fillStyle = s.ink;
            ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
            continue;
          }
          if (d <= R) {
            const age = (R - d) / rate; // seconds since the frontier crossed it
            if (age < 0.45) {
              // Resolving flash.
              ctx.fillStyle = s.acc;
              ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
            } else if (hash(i, j, 3) < 0.18) {
              breaks++;
              ctx.save();
              ctx.strokeStyle = s.dim;
              ctx.lineWidth = 1;
              ctx.globalAlpha = 0.75;
              ctx.beginPath();
              ctx.moveTo(x - 3.5, y - 3.5);
              ctx.lineTo(x + 3.5, y + 3.5);
              ctx.moveTo(x + 3.5, y - 3.5);
              ctx.lineTo(x - 3.5, y + 3.5);
              ctx.stroke();
              ctx.restore();
            } else {
              holds++;
              ctx.fillStyle = hash(i, j, 4) < 0.06 ? s.acc : s.ink;
              ctx.globalAlpha = 0.88;
              ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
              ctx.globalAlpha = 1;
            }
          } else {
            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.strokeStyle = s.dim;
            ctx.lineWidth = 1;
            ctx.strokeRect(x - 2, y - 2, 4, 4);
            ctx.restore();
          }
        }
      }

      // The shown region and the moving frontier.
      ctx.save();
      ctx.strokeStyle = s.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - r0, cy - r0, r0 * 2, r0 * 2);
      ctx.restore();
      if (cy - r0 - 9 > s.y0 - 12) s.ctext('SHOWN', cx, cy - r0 - 9, 9, s.ink, 800, '0.16em');

      ctx.save();
      ctx.strokeStyle = s.acc;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(cx - R, cy - R, R * 2, R * 2);
      ctx.restore();

      const fy = cy - R - 9;
      if (fy > s.y0 + 8) s.txt('HOLDS TO HERE', Math.max(s.x0, cx - R) + 4, fy, 9, s.acc, 800, '0.16em');
      s.rtxt('UNSEEN', s.x1, s.y0 - 22, 10, s.dim, 800, '0.14em');

      const cap2 = 'DOES IT HOLD BEYOND WHAT IT WAS SHOWN?';
      s.txt(
        s.mText(cap2, 12, 800, '0.14em') < s.x1 - s.x0 - 120 ? cap2 : 'BEYOND THE SHOWN',
        s.x0,
        s.y1 + 26,
        12,
        s.ink,
        800,
        '0.14em',
      );
      s.rtxt(`HOLDS ${holds}   BREAKS ${breaks}`, s.x1, s.y1 + 26, 9, s.dim, 800, '0.14em');
    },
  };
}

/** Stage geometry the science scenes are drawn against. */
export const SCIENCE_LAYOUT: LayoutSpec = {
  gutter: [44, 26],
  inset: [40, 22],
  bottom: 84,
  topGap: 44,
};

export function initScience(root: HTMLElement): ScienceHandle {
  const opts: ScienceOptions = { ...SCIENCE_DEFAULTS };

  const panel = initScenePanel(root, {
    scenes: [platformScene(), frontierScene()],
    sectionAttr: 'data-sci',
    titleAttr: 'data-sci-title',
    hashPrefix: 'sci',
    pickEvent: 'dbio:science',
    gutter: [44, 26],
    inset: [40, 22],
    bottom: 84,
    topGap: 44,
  });

  const push = () =>
    panel.update({
      speed: opts.speed,
      mono: opts.mono,
      durations: [opts.platformSeconds, opts.generalizabilitySeconds],
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
