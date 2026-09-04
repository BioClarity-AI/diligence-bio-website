/**
 * The plumbing every drawn panel on the site shares: a canvas sized to its
 * parent at device resolution, the design tokens resolved once, a small text
 * and line vocabulary, and a frame loop that stops when nobody is looking.
 *
 * The drawings themselves live in services.ts, science.ts, company.ts and
 * requestAccess.ts. Nothing here knows what any of them depict.
 */

/** Everything a drawing draws with. Recomputed each frame before it runs. */
export interface Stage {
  ctx: CanvasRenderingContext2D;
  /** Panel size in CSS pixels. */
  w: number;
  h: number;

  /** Viewport classes the drawings shed detail by. */
  narrow: boolean;
  tight: boolean;

  /** The drawing box: left, right, top, bottom, and the vertical middle.
      Zero unless a `layout` was given to createStage. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  mid: number;

  /** Design tokens, resolved once from the page's CSS. */
  ink: string;
  dim: string;
  rule: string;
  bg: string;
  /** Lightest neutral — legible on top of a filled ink band. */
  n100: string;
  font: string;
  /** The accent as the design defines it, whatever `acc` is currently set to. */
  accent: string;
  /** The accent a drawing should use — ink instead, when it is running mono. */
  acc: string;

  ease(x: number): number;
  lerp(a: number, b: number, t: number): number;
  /** Clamped to 0..1. */
  clamp01(x: number): number;

  /** Text at `size` px in the heading face. `sp` is CSS letter-spacing. */
  txt(s: string, x: number, y: number, size: number, color: string, weight?: number, sp?: string): void;
  /** Right-aligned to `x`. */
  rtxt(s: string, x: number, y: number, size: number, color: string, weight?: number, sp?: string): void;
  /** Centred on `x`. */
  ctext(s: string, x: number, y: number, size: number, color: string, weight?: number, sp?: string): void;
  /** Width the same call to `txt` would occupy. */
  mText(s: string, size: number, weight?: number, sp?: string): number;

  line(x1: number, y1: number, x2: number, y2: number, color: string, lw?: number, dash?: number[]): void;
}

/** How a panel derives its drawing box from its size. */
export interface LayoutSpec {
  /** Left gutter, as [roomy, tight]. */
  gutter: [number, number];
  /** Right inset, as [roomy, tight]. */
  inset: [number, number];
  /** Distance from the panel floor to the bottom of the box. */
  bottom: number;
  /** Gap between the overlay and the top of the box. */
  topGap: number;
}

export interface StageHandle {
  stage: Stage;
  /** Recompute the box for the current panel size. Call once per frame. */
  measure(): void;
  destroy(): void;
}

export function createStage(
  canvas: HTMLCanvasElement,
  options: { overlay?: HTMLElement | null; layout?: LayoutSpec } = {},
): StageHandle | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const panel = canvas.parentElement as HTMLElement;
  let w = 0;
  let h = 0;

  const fit = () => {
    const r = panel.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(panel);

  // Read the tokens off the canvas once — they do not change at runtime, and
  // getComputedStyle in a rAF loop is a layout read on every frame.
  const cs = getComputedStyle(canvas);
  const token = (name: string, fallback: string) => (cs.getPropertyValue(name) || '').trim() || fallback;

  const setFont = (size: number, weight?: number, sp?: string) => {
    ctx.font = `${weight || 400} ${size}px ${token('--font-heading', 'Archivo, system-ui, sans-serif')}`;
    // letterSpacing is not in every engine; the drawings read fine without it.
    if ('letterSpacing' in ctx) ctx.letterSpacing = sp || '0em';
  };

  const write = (
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    weight: number | undefined,
    sp: string | undefined,
    align: CanvasTextAlign,
  ) => {
    ctx.save();
    setFont(size, weight, sp);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
    ctx.restore();
  };

  const stage: Stage = {
    ctx,
    w: 0,
    h: 0,
    narrow: false,
    tight: false,
    x0: 0,
    x1: 0,
    y0: 0,
    y1: 0,
    mid: 0,
    ink: token('--color-text', '#201e1d'),
    dim: token('--color-neutral-600', '#7d7979'),
    rule: token('--color-divider', '#201e1d'),
    bg: token('--color-bg', '#f3f2f2'),
    n100: token('--color-neutral-100', '#f8f4f4'),
    font: token('--font-heading', 'Archivo, system-ui, sans-serif'),
    accent: token('--color-accent', '#ec3013'),
    acc: token('--color-accent', '#ec3013'),
    ease: (x) => x * x * (3 - 2 * x),
    lerp: (a, b, t) => a + (b - a) * t,
    clamp01: (x) => Math.max(0, Math.min(1, x)),
    txt: (s, x, y, size, color, weight, sp) => write(s, x, y, size, color, weight, sp, 'left'),
    rtxt: (s, x, y, size, color, weight, sp) => write(s, x, y, size, color, weight, sp, 'right'),
    ctext: (s, x, y, size, color, weight, sp) => write(s, x, y, size, color, weight, sp, 'center'),
    mText: (s, size, weight, sp) => {
      ctx.save();
      setFont(size, weight, sp);
      const m = ctx.measureText(s).width;
      ctx.restore();
      return m;
    },
    line: (x1, y1, x2, y2, color, lw, dash) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lw || 1;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    },
  };

  const { overlay, layout } = options;

  return {
    stage,
    measure() {
      stage.w = w;
      stage.h = h;
      stage.narrow = w < 660;
      stage.tight = w < 480;
      if (!layout) return;
      stage.x0 = stage.tight ? layout.gutter[1] : layout.gutter[0];
      stage.x1 = w - (stage.tight ? layout.inset[1] : layout.inset[0]);

      // A phone held sideways leaves the panel about 250px tall. The reserves
      // above and below are sized for a desktop panel — held at full size they
      // consume the whole box and the scenes draw on top of each other, so
      // they shrink with the room available.
      const short = h < 420;
      const bottom = short ? Math.max(38, layout.bottom * 0.45) : layout.bottom;
      stage.y1 = h - bottom;

      const overlayBottom = (short ? 10 : 28) + (overlay ? overlay.offsetHeight : 104);
      // 34, not the gap itself: the scenes caption the box from 22px above its
      // top edge, so the box has to start clear of the overlay by that plus
      // the height of the caption.
      const clear = overlayBottom + (short ? 34 : layout.topGap);
      // On a roomy panel the second term caps how far down the box may start,
      // so a tall overlay cannot eat the whole stage. That cap is wrong when
      // short: it lands above the overlay, and the scenes label their own top
      // edge, so they print into the readout. There the overlay wins and the
      // box takes what is left — which the scenes are built to handle.
      stage.y0 = short ? clear : Math.min(clear, Math.max(96, stage.y1 - 150));
      stage.mid = (stage.y0 + stage.y1) / 2;
    },
    destroy() {
      ro.disconnect();
    },
  };
}

export interface LoopHandle {
  destroy(): void;
}

/**
 * Drive `frame` from requestAnimationFrame, and stop entirely when the tab is
 * hidden or the panel has scrolled out of view. `dt` is capped so a long pause
 * cannot teleport an animation on the frame after it resumes.
 *
 * One scheduler on purpose: a hidden document never delivers the first frame,
 * so every wake path has to be able to re-arm the loop.
 */
export function runLoop(panel: HTMLElement, frame: (dt: number) => void): LoopHandle {
  let last = performance.now();
  let raf: number | null = null;
  let running = !document.hidden;

  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt);
    raf = null;
    if (running) arm();
  };

  const arm = () => {
    if (raf == null) raf = requestAnimationFrame(tick);
  };
  arm();

  const setRunning = (next: boolean) => {
    if (next === running) return;
    running = next;
    if (running) {
      last = performance.now();
      arm();
    } else if (raf != null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  };

  const onVisibility = () => setRunning(!document.hidden);
  document.addEventListener('visibilitychange', onVisibility);

  // Stacked on a phone the panel can scroll away entirely — stop drawing.
  const io = new IntersectionObserver(([entry]) => setRunning(!!entry?.isIntersecting && !document.hidden), {
    threshold: 0,
  });
  io.observe(panel);

  return {
    destroy() {
      running = false;
      if (raf != null) cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
