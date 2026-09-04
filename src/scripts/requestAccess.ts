/**
 * The Request access stage — one email's journey, on a nine second loop.
 *
 * It flies in, passes a very serious screening, lands in an inbox that has been
 * waiting all day, and is read by a human. The page asks for an email; this is
 * the page being honest about what happens to it, and enjoying itself.
 */

import { createStage, runLoop } from './canvasStage';
import { applySettings } from './settings';

/** Tunable from the `requestAccess` section of public/settings.json. */
export interface RequestAccessOptions {
  /** Playback rate multiplier. */
  speed: number;
  /** Ink-only rendering, no accent colour. */
  mono: boolean;
  /**
   * Seconds one journey takes at speed 1. The phase table below is authored
   * against LOOP and scaled to fit, so the beats keep their relative timing.
   */
  loopSeconds: number;
}

/**
 * Compiled-in fallbacks — the single source of truth for these values.
 * `public/settings.json` overrides them at runtime.
 */
export const REQUEST_ACCESS_DEFAULTS: RequestAccessOptions = {
  speed: 1,
  mono: false,
  loopSeconds: 9,
};

/** Seconds in one loop, as the phase table below is authored. */
const LOOP = 9;
/** Phase boundaries: fly in → gate scan → verdict → fly on → arrive → joy. */
const P = { fly1: 1.6, scan: 3.1, verd: 3.9, fly2: 5.2, eat: 5.8 };
const CHECKS = ['NICE HUMAN?', 'REAL SCIENCE?', 'SPAM?'];

interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  accent: boolean;
}

export interface RequestAccessHandle {
  update(next: Partial<RequestAccessOptions>): void;
  destroy(): void;
}

export function initRequestAccess(root: HTMLElement): RequestAccessHandle {
  const noop: RequestAccessHandle = { update() {}, destroy() {} };
  const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]');
  if (!canvas) return noop;

  const handle = createStage(canvas);
  if (!handle) return noop;

  const { stage: s, measure } = handle;
  const { ctx } = s;
  const panel = canvas.parentElement as HTMLElement;
  const opts: RequestAccessOptions = { ...REQUEST_ACCESS_DEFAULTS };

  let t = 0;
  let burst = false;
  const confetti: Confetto[] = [];

  const envelope = (x: number, y: number, size: number, wob: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(wob);
    ctx.fillStyle = s.bg;
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = 2;
    ctx.fillRect(-size, -size * 0.62, size * 2, size * 1.24);
    ctx.strokeRect(-size, -size * 0.62, size * 2, size * 1.24);
    ctx.beginPath();
    ctx.moveTo(-size, -size * 0.62);
    ctx.lineTo(0, size * 0.14);
    ctx.lineTo(size, -size * 0.62);
    ctx.stroke();
    ctx.fillStyle = s.acc;
    ctx.fillRect(size * 0.45, -size * 0.42, size * 0.34, size * 0.34); // stamp
    ctx.restore();
  };

  const loop = runLoop(panel, (raw) => {
    measure();
    s.acc = opts.mono ? s.ink : s.accent;
    // Advance in the phase table's own units, so P.* stay authored constants.
    const dt = raw * opts.speed * (LOOP / opts.loopSeconds);
    t += dt;
    if (t > LOOP) {
      t = 0;
      burst = false;
      confetti.length = 0;
    }

    ctx.clearRect(0, 0, s.w, s.h);
    const tight = s.w < 520;
    // A phone held sideways: the panel is ~250px tall, where a gate standing
    // 90px off a mid-line placed at 48% of the height runs its label through
    // the title and its checklist through the caption.
    const short = s.h < 430;
    const x0 = tight ? 24 : 48;
    const x1 = s.w - (tight ? 24 : 48);
    const gateX = x0 + (x1 - x0) * 0.44;
    const boxX = x1 - (tight ? 54 : 78);
    const boxW = tight ? 44 : 64;
    const boxH = tight ? 34 : 46;
    const es = short ? 13 : tight ? 15 : 20;

    // The scene lives between the title and the caption. When short it is
    // centred in that gap and the gate scales to it, rather than standing a
    // fixed distance off a fraction of the panel height.
    const titleY = short ? 18 : tight ? 54 : 64;
    const capY = s.h - (short ? 22 : tight ? 94 : 106);
    const top = titleY + (short ? 12 : 20);
    const midY = short ? (top + capY - 24) / 2 : s.h * 0.48;
    const gateH = short ? Math.max(40, Math.min(90, (capY - 24 - top) / 2 - 20)) : 90;
    /* The rule the whole scene stands on. Everything below it hangs off this. */
    const baselineY = midY + boxH / 2 + 6;

    s.txt('YOUR EMAIL — LIVE SIMULATION', x0, titleY, short ? 9 : 11, s.dim, 800, '0.18em');

    // The gate.
    ctx.save();
    ctx.strokeStyle = s.acc;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(gateX, midY - gateH);
    ctx.lineTo(gateX, midY + gateH);
    ctx.stroke();
    ctx.restore();
    s.ctext('VERY SERIOUS', gateX, midY - gateH - 14, 9, s.acc, 800, '0.16em');
    s.ctext('SCREENING', gateX, midY - gateH - 2, 9, s.acc, 800, '0.16em');

    // The inbox: an open box with eyes — it has been waiting all day.
    const happy = t > P.eat;
    const blink = Math.sin(t * 2.1) > 0.97;
    ctx.save();
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX - boxW / 2, midY - boxH / 2 + 6, boxW, boxH);
    ctx.fillStyle = s.ink;
    const eyeY = midY - boxH / 2 - 12;
    if (happy) {
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(boxX + d * 10, eyeY + 2, 5, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    } else if (blink) {
      for (const d of [-1, 1]) ctx.fillRect(boxX + d * 10 - 3.5, eyeY, 7, 2);
    } else {
      // Eyes track the envelope.
      const ex = t < P.fly2 ? -2 : 0;
      for (const d of [-1, 1]) ctx.fillRect(boxX + d * 10 - 2.5 + ex, eyeY - 2.5, 5, 5);
    }
    ctx.restore();
    s.ctext('US', boxX, baselineY + 18, 10, s.ink, 800, '0.18em');
    s.txt('YOU', x0, baselineY + 18, 10, s.dim, 800, '0.18em');

    // The envelope's path.
    let caption = 'IT TRAVELS AT THE SPEED OF SINCERITY';
    if (t < P.fly1) {
      const p = s.ease(s.clamp01(t / P.fly1));
      envelope(s.lerp(x0 + es, gateX - 34, p), midY - Math.sin(p * Math.PI) * 34, es, Math.sin(t * 9) * 0.05);
    } else if (t < P.scan) {
      envelope(gateX - 34, midY, es, 0);
      const k = Math.min(CHECKS.length - 1, Math.floor((t - P.fly1) / 0.5));
      const done = (t - P.fly1) / 0.5;
      CHECKS.forEach((c, i) => {
        if (i > k) return;
        // Hang the list off the baseline, not the midline: at midY + 34 the
        // first row's glyphs straddled the rule. The extra drop clears the
        // YOU / US captions, which sit on their own row just under it.
        const y = baselineY + (short ? 24 : 34) + i * (short ? 13 : 16);
        s.txt(c, gateX + 12, y, 9, s.dim, 800, '0.12em');
        if (done > i + 0.7 || i < k) {
          const answer = i === 2 ? 'NO' : 'YES';
          s.txt(answer, gateX + 12 + s.mText(c, 9, 800, '0.12em') + 8, y, 9, i === 2 ? s.dim : s.acc, 800, '0.12em');
        }
      });
      caption = 'RIGOROUS. SCIENTIFIC. TAKES 0.8 SECONDS.';
      ctx.save();
      ctx.strokeStyle = s.acc;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(gateX - 34 - es - 8, midY - es - 8, es * 2 + 16, es * 2 + 16);
      ctx.restore();
    } else if (t < P.verd) {
      envelope(gateX - 34, midY, es, 0);
      const pop = 0.7 + 0.3 * s.ease(s.clamp01((t - P.scan) / 0.25));
      ctx.save();
      ctx.translate(gateX - 34, midY - es - 26);
      ctx.scale(pop, pop);
      ctx.fillStyle = s.acc;
      const vw = s.mText('PASS', 11, 800, '0.16em') + 16;
      ctx.fillRect(-vw / 2, -11, vw, 18);
      s.ctext('PASS', 0, 3, 11, s.bg, 800, '0.16em');
      ctx.restore();
      caption = 'OBVIOUSLY.';
    } else if (t < P.fly2) {
      const p = s.ease(s.clamp01((t - P.verd) / (P.fly2 - P.verd)));
      envelope(
        s.lerp(gateX - 34, boxX, p),
        midY - Math.sin(p * Math.PI) * 46 * (1 - p * 0.4),
        es * (1 - p * 0.25),
        Math.sin(t * 10) * 0.06,
      );
      caption = 'INCOMING HAPPINESS';
    } else if (t < P.eat) {
      const p = s.clamp01((t - P.fly2) / (P.eat - P.fly2));
      envelope(boxX, midY + p * 8, es * (1 - p), 0);
      caption = 'NOM.';
    } else {
      if (!burst) {
        burst = true;
        for (let i = 0; i < 26; i++) {
          confetti.push({
            x: boxX,
            y: midY - boxH / 2,
            vx: (Math.random() - 0.5) * 220,
            vy: -(90 + Math.random() * 190),
            a: 1,
            accent: Math.random() < 0.4,
          });
        }
      }
      const since = t - P.eat;
      caption = since < 1.6 ? 'A HUMAN READS IT. THE SAME DAY.' : 'P(REPLY) = 1.00';
      if (since > 0.3) {
        const pop = 0.7 + 0.3 * s.ease(s.clamp01((since - 0.3) / 0.3));
        ctx.save();
        ctx.translate(boxX, midY - boxH - 34);
        ctx.rotate(-0.06);
        ctx.scale(pop, pop);
        ctx.strokeStyle = s.acc;
        ctx.lineWidth = 2;
        const rw = s.mText('RECEIVED', 10, 800, '0.16em') + 18;
        ctx.strokeRect(-rw / 2, -12, rw, 20);
        s.ctext('RECEIVED', 0, 3, 10, s.acc, 800, '0.16em');
        ctx.restore();
      }
    }

    // Confetti.
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i]!;
      c.vy += 320 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.a -= dt * 0.55;
      if (c.a <= 0) {
        confetti.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, c.a);
      ctx.fillStyle = c.accent ? s.acc : s.ink;
      ctx.fillRect(c.x - 2.5, c.y - 2.5, 5, 5);
      ctx.restore();
    }

    // Baseline + caption.
    s.line(x0, baselineY, x1, baselineY, s.ink, 2);
    const capFs = s.mText(caption, 12, 800, '0.14em') < x1 - x0 ? 12 : 10;
    s.txt(caption, x0, capY, capFs, s.ink, 800, '0.14em');
  });

  return {
    update(next) {
      applySettings(opts, next);
      // A zero or negative loop would divide the clock to a standstill or run
      // it backwards; fall back rather than freeze the panel.
      if (opts.loopSeconds <= 0) opts.loopSeconds = REQUEST_ACCESS_DEFAULTS.loopSeconds;
      if (opts.speed <= 0) opts.speed = REQUEST_ACCESS_DEFAULTS.speed;
    },

    destroy() {
      loop.destroy();
      handle.destroy();
    },
  };
}
