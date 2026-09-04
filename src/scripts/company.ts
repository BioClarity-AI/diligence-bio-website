/**
 * The Company stage — the adoption gap, priced.
 *
 * Two identical programs carry the same hidden flaw. One organisation measures
 * at discovery and catches it there; the other finds out at Phase III. Same
 * flaw, different bill — which is the gap the company exists to close.
 *
 * Every label is fitted to the panel before it is drawn: shortened, shrunk, or
 * dropped to its endpoints. The numbers are the point, so nothing may overflow.
 */

import { createStage, runLoop } from './canvasStage';
import { applySettings } from './settings';

/** Tunable from the `company` section of public/settings.json. */
export interface CompanyOptions {
  /** Playback rate multiplier. */
  speed: number;
  /** Ink-only rendering, no accent colour. */
  mono: boolean;
  /**
   * Seconds one telling of the story takes at speed 1. The phase table below
   * is authored against COMPANY_DEFAULTS.loopSeconds and scaled to fit this,
   * so the beats keep their relative timing however long the loop runs.
   */
  loopSeconds: number;
}

/**
 * Compiled-in fallbacks — the single source of truth for these values.
 * `public/settings.json` overrides them at runtime.
 */
export const COMPANY_DEFAULTS: CompanyOptions = {
  speed: 1,
  mono: false,
  loopSeconds: 14.5,
};

const GATES = ['DISCOVERY', 'PRECLIN', 'PH I', 'PH II', 'PH III'];
const SHORT = ['DISC', 'PRE', 'I', 'II', 'III'];
/** Cumulative burn when the flaw is found at each gate. */
const COST = [2e6, 30e6, 80e6, 300e6, 1.4e9];

/** Phase boundaries, in seconds through the loop. */
const T = { start: 0.8, scan: 2.2, caught: 3.4, g: [3.4, 4.9, 6.4, 7.9], fail: 9.4, end: 14.5 };

const money = (v: number) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${Math.round(v / 1e6)}M` : `$${Math.round(v / 1e3)}K`;

export interface CompanyHandle {
  update(next: Partial<CompanyOptions>): void;
  destroy(): void;
}

export function initCompany(root: HTMLElement): CompanyHandle {
  const noop: CompanyHandle = { update() {}, destroy() {} };
  const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]');
  if (!canvas) return noop;

  const handle = createStage(canvas);
  if (!handle) return noop;

  const { stage: s, measure } = handle;
  const { ctx } = s;
  const panel = canvas.parentElement as HTMLElement;
  const opts: CompanyOptions = { ...COMPANY_DEFAULTS };
  let t = 0;

  /**
   * A program on its track. The accent notch is the flaw it is carrying.
   *
   * `fscale` grows that notch as the program advances: the same defect costs
   * more the later it is found, so it should look like more. The notch is
   * anchored to the marker's own bottom edge and grows upward, so a large one
   * never reaches down into the gate labels.
   */
  const marker = (x: number, y: number, size: number, flawed: boolean, fscale = 1) => {
    ctx.save();
    ctx.fillStyle = s.ink;
    ctx.fillRect(x - size, y - size, size * 2, size * 2);
    if (flawed) {
      const fs = 5 * fscale;
      ctx.fillStyle = s.acc;
      ctx.fillRect(x + size - fs, y + size - fs, fs, fs);
    }
    ctx.restore();
  };

  const loop = runLoop(panel, (raw) => {
    measure();
    s.acc = opts.mono ? s.ink : s.accent;
    // Advance in the phase table's own units, so T.* stay authored constants
    // however long a caller wants the loop to take.
    const dt = raw * opts.speed * (T.end / opts.loopSeconds);
    t += dt;
    if (t > T.end) t = 0;

    ctx.clearRect(0, 0, s.w, s.h);
    const tight = s.w < 560;
    // A phone held sideways: the panel is ~250px tall, where placing the
    // tracks at fixed fractions of the height puts the top one's callouts
    // straight through the heading.
    const short = s.h < 430;
    const x0 = tight ? 26 : 52;
    const x1 = s.w - (tight ? 26 : 52);
    const gx = (i: number) => x0 + 80 + (x1 - x0 - 110) * (i / (GATES.length - 1));
    const ms = short ? 6 : tight ? 7 : 9;
    const availW = x1 - x0;

    // The claim is fixed at the top, in the accent it is about: the animation
    // below is the evidence for it, so it must not wait for the run to reach
    // its last beat to be readable.
    const headY = short ? 34 : tight ? 52 : 62;
    const subGap = short ? 16 : tight ? 20 : 24;
    let headFs = short ? 15 : tight ? 19 : 25;
    const head1 = 'SAME FLAW.';
    const head2 = ' 700× THE PRICE.';
    while (headFs > 12 && s.mText(head1 + head2, headFs, 800, '0.01em') > availW) headFs -= 1;
    s.txt(head1, x0, headY, headFs, s.ink, 800, '0.01em');
    s.txt(head2, x0 + s.mText(head1, headFs, 800, '0.01em'), headY, headFs, s.acc, 800, '0.01em');

    let sub = 'CATCH IT EARLY';
    let subFs = 10.5;
    while (subFs > 8 && s.mText(sub, subFs, 800, '0.16em') > availW) subFs -= 0.5;
    s.txt(sub, x0, headY + subGap, subFs, s.ink, 800, '0.16em');

    // Vertical layout. Each track hangs a label 34px above itself and, on the
    // top one, a callout 59px above that again. With room the tracks sit at the
    // authored fractions; when short they are packed against what there is, so
    // the callout clears the heading block rather than printing through it.
    // 62 = the 59 of that callout plus a hairline of margin.
    const yA = short ? headY + subGap + 62 : s.h * 0.34;
    const yB = short ? Math.max(yA + 58, s.h - 34) : s.h * 0.62;

    // Three things share the row above each track: the track's own label on the
    // left, the burn meter on the right, and — on the top track only — the seam
    // label centred on the seam. The meter bounds every label; the seam bounds
    // the top one, which is otherwise long enough to run straight through it.
    const meterRoom = s.mText('$1.4B', (tight ? 15 : 19) + 4, 800, '0.02em') + 14;
    const seamX = (gx(0) + gx(1)) / 2;
    const measureW = s.mText('MEASURE', 8.5, 800, '0.14em');
    const seamRoom = seamX - measureW / 2 - 12 - x0;

    const tracks: [number, string, string][] = [
      [yA, 'MEASURED AT DISCOVERY', 'AT DISCOVERY'],
      [yB, 'MEASURED BY PHASE III', 'BY PHASE III'],
    ];
    let topLabelW = 0;
    for (const [y, long, short] of tracks) {
      s.line(x0, y, x1 - 28, y, s.ink, 2);
      const room = y === yA ? Math.min(availW - meterRoom, seamRoom) : availW - meterRoom;
      let label = long;
      let lfs = 9;
      if (s.mText(label, lfs, 800, '0.14em') > room) label = short;
      while (lfs > 7 && s.mText(label, lfs, 800, '0.14em') > room) lfs -= 0.5;
      if (y === yA) topLabelW = s.mText(label, lfs, 800, '0.14em');
      s.txt(label, x0, y - 34, lfs, y === yA ? s.acc : s.dim, 800, '0.14em');
    }

    // Gates — full names, short names, or just the endpoints, whichever fits.
    const gap = gx(1) - gx(0);
    const fitsAll = (names: string[], fs: number) => names.every((n) => s.mText(n, fs, 800, '0.12em') < gap - 6);
    const gnames = fitsAll(GATES, 8.5) && !tight ? GATES : fitsAll(SHORT, 8.5) ? SHORT : null;
    GATES.forEach((_, i) => {
      const x = gx(i);
      for (const y of [yA, yB]) s.line(x, y - 8, x, y + 8, s.ink, 2);
      if (gnames) s.ctext(gnames[i]!, x, yB + 26, 8.5, s.dim, 800, '0.12em');
      else if (i === 0) s.txt(SHORT[i]!, x, yB + 26, 8.5, s.dim, 800, '0.12em');
      else if (i === 4) s.ctext(SHORT[i]!, x, yB + 26, 8.5, s.dim, 800, '0.12em');
    });

    // Validation seam, on the top track only — between DISC and PRECLIN.
    s.line(seamX, yA - 26, seamX, yA + 26, s.acc, 2, [5, 4]);
    // Even shortened and shrunk to 7px the track label can outgrow the room
    // before the seam. Drop the seam label rather than overlap it: the dashed
    // line still marks the moment, and the copy beside the panel carries it.
    if (!tight && x0 + topLabelW + 12 <= seamX - measureW / 2) {
      s.ctext('MEASURE', seamX, yA - 32, 8.5, s.acc, 800, '0.14em');
    }

    // The caught label is the one string that can run off the right edge.
    const caughtLabel = () =>
      s.mText(`FLAW, CAUGHT — ${money(COST[0]!)}`, 9, 800, '0.12em') + seamX + 26 > x1
        ? `CAUGHT — ${money(COST[0]!)}`
        : `FLAW, CAUGHT — ${money(COST[0]!)}`;

    // ── Top program: caught at the seam, flaw extracted, advances clean.
    let burnA = 0;
    if (t < T.start) {
      marker(gx(0), yA, ms, true);
    } else if (t < T.scan) {
      const p = s.ease(s.clamp01((t - T.start) / (T.scan - T.start)));
      marker(s.lerp(gx(0), seamX, p), yA, ms, true);
      burnA = COST[0]! * p * 0.6;
    } else if (t < T.caught) {
      marker(seamX, yA, ms, false);
      burnA = COST[0]! * s.clamp01(0.6 + (0.4 * (t - T.scan)) / (T.caught - T.scan));
      ctx.save();
      ctx.strokeStyle = s.acc;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(seamX - ms - 8, yA - ms - 8, ms * 2 + 16, ms * 2 + 16);
      ctx.restore();
      // The flaw, pulled out of the program.
      const fp = s.ease(s.clamp01((t - T.scan) / 0.6));
      const fy = yA - 32 - 30 * fp;
      ctx.fillStyle = s.acc;
      ctx.fillRect(seamX + 16 - 3, fy - 3, 6, 6);
      if (fp > 0.9) s.txt(caughtLabel(), seamX + 26, fy + 3, 9, s.acc, 800, '0.12em');
    } else {
      burnA = COST[0]!;
      const p = s.ease(s.clamp01((t - T.caught) / 2.6));
      marker(s.lerp(seamX, gx(4), p), yA, ms, false);
      s.txt(caughtLabel(), seamX + 26, yA - 59, 9, s.acc, 800, '0.12em');
      ctx.fillStyle = s.acc;
      ctx.fillRect(seamX + 16 - 3, yA - 62 - 3, 6, 6);
      if (p >= 1) {
        ctx.save();
        ctx.strokeStyle = s.acc;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(gx(4) + 16, yA - 2);
        ctx.lineTo(gx(4) + 21, yA + 5);
        ctx.lineTo(gx(4) + 31, yA - 9);
        ctx.stroke();
        ctx.restore();
        if (!tight) s.rtxt('ADVANCES ON EVIDENCE', gx(4), yA + 24, 8.5, s.ink, 800, '0.12em');
      }
    }

    // ── Bottom program: the same flaw rides every gate; the burn compounds.
    let burnB = 0;
    if (t < T.start) {
      marker(gx(0), yB, ms, true);
    } else if (t < T.fail) {
      // Which leg is it on?
      const legs = [T.start, ...T.g];
      let leg = 0;
      while (leg < 4 && t >= legs[leg + 1]!) leg++;
      const lp = s.ease(s.clamp01((t - legs[leg]!) / ((legs[leg + 1] ?? T.fail) - legs[leg]!)));
      const bx = s.lerp(gx(leg), gx(Math.min(4, leg + 1)), lp);
      // How far along the track it has travelled, 0 at DISCOVERY and 1 at
      // PH III — the flaw is drawn that much bigger by the time it is found.
      const adv = s.clamp01((bx - gx(0)) / Math.max(1, gx(4) - gx(0)));
      marker(bx, yB, ms, true, 1 + adv * 4.6);
      burnB = s.lerp(leg === 0 ? 0 : COST[leg - 1]!, COST[leg]!, lp);
    } else {
      burnB = COST[4]!;
      const bx = gx(4);
      ctx.save();
      ctx.strokeStyle = s.dim;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(bx - ms, yB - ms);
      ctx.lineTo(bx + ms, yB + ms);
      ctx.moveTo(bx + ms, yB - ms);
      ctx.lineTo(bx - ms, yB + ms);
      ctx.stroke();
      ctx.restore();
      const found =
        s.mText('SAME FLAW, FOUND HERE', 9, 800, '0.12em') > bx - 4 - x0 ? 'FOUND HERE' : 'SAME FLAW, FOUND HERE';
      s.rtxt(found, bx - 4, yB - 18, 9, s.dim, 800, '0.12em');
    }

    // Burn meters — the numbers pharma actually feels.
    if (t > T.start) {
      s.rtxt(money(burnA), x1, yA - 34, tight ? 15 : 19, burnA >= COST[0]! ? s.ink : s.dim, 800, '0.02em');
      const hot = burnB > COST[2]!;
      s.rtxt(money(burnB), x1, yB - 34, (tight ? 15 : 19) + (hot ? 4 : 0), hot ? s.acc : s.dim, 800, '0.02em');
    }

  });

  return {
    update(next) {
      applySettings(opts, next);
      // A zero or negative loop would divide the clock to a standstill or run
      // it backwards; fall back rather than freeze the panel.
      if (opts.loopSeconds <= 0) opts.loopSeconds = COMPANY_DEFAULTS.loopSeconds;
      if (opts.speed <= 0) opts.speed = COMPANY_DEFAULTS.speed;
    },

    destroy() {
      loop.destroy();
      handle.destroy();
    },
  };
}
