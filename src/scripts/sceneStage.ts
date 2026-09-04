/**
 * One scene, drawn on its own page.
 *
 * The sibling of `scenePanel.ts`, for the pages that carry a single service or
 * science topic. Where the panel cycles a list of scenes and keeps them in step
 * with the copy sections beside it, this draws exactly one and never advances —
 * the page itself is the selection, so the arrows are links to the neighbouring
 * pages rather than in-panel controls.
 *
 * What it keeps from the panel: the same `Scene` contract, the same stage and
 * layout maths, and the same loop that stops when the tab is hidden or the
 * panel scrolls out of view.
 */
import { createStage, runLoop, type LayoutSpec, type LoopHandle } from './canvasStage';
import { isChoice, type Scene, type SceneEntry } from './scenePanel';

export interface SceneStageOptions {
  /** Playback rate multiplier. */
  speed: number;
  /** Ink-only rendering, no accent colour. */
  mono: boolean;
}

export interface SceneStageConfig extends LayoutSpec {
  /**
   * The scene to draw. A `SceneChoice` starts on its first variant and, if the
   * overlay carries `[data-variant]` buttons, lets the reader switch between
   * the competing builds in place.
   */
  scene: SceneEntry;
}

export interface SceneStageHandle {
  /** Retune a running stage. Omitted keys are left alone. */
  update(next: Partial<SceneStageOptions>): void;
  destroy(): void;
}

export function initSceneStage(root: HTMLElement, config: SceneStageConfig): SceneStageHandle {
  const noop: SceneStageHandle = { update() {}, destroy() {} };

  const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]');
  if (!canvas) return noop;

  const overlay = root.querySelector<HTMLElement>('[data-overlay]');
  const handle = createStage(canvas, { overlay, layout: config });
  if (!handle) return noop;

  const { stage, measure } = handle;
  const { ctx } = stage;
  const panel = canvas.parentElement as HTMLElement;

  // A choice keeps every build alive; only the picked one is drawn. Resetting
  // on pick means each concept is compared from its own opening beat rather
  // than joined halfway through.
  const variants = isChoice(config.scene) ? config.scene.variants : null;
  let picked = 0;
  const scene = (): Scene => (variants ? variants[picked]!.scene : (config.scene as Scene));

  const opts: SceneStageOptions = { speed: 1, mono: false };

  // Start paused under prefers-reduced-motion, and let the button opt back in —
  // the reduced-motion preference is about what plays unasked, not about what
  // the reader may choose to play.
  const reduce =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = reduce;

  const pauseBtn = root.querySelector<HTMLButtonElement>('[data-pause]');
  const pauseDot = root.querySelector<HTMLElement>('[data-pause-dot]');
  const pauseLabel = root.querySelector<HTMLElement>('[data-pause-label]');

  const paintPause = () => {
    if (pauseBtn) {
      pauseBtn.setAttribute('aria-pressed', String(paused));
      pauseBtn.title = paused ? 'Play this animation' : 'Pause this animation';
    }
    if (pauseDot) pauseDot.classList.toggle('is-on', paused);
    if (pauseLabel) pauseLabel.textContent = paused ? 'Paused' : 'Live';
  };

  pauseBtn?.addEventListener('click', () => {
    paused = !paused;
    paintPause();
  });
  paintPause();

  // The picker, when the overlay offers one.
  const pickBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-variant]')];
  const nameEl = root.querySelector<HTMLElement>('[data-variant-name]');

  const paintPicked = () => {
    pickBtns.forEach((btn, i) => {
      btn.classList.toggle('is-on', i === picked);
      btn.setAttribute('aria-pressed', String(i === picked));
    });
    if (nameEl) nameEl.textContent = variants?.[picked]?.label ?? '';
  };

  pickBtns.forEach((btn, i) =>
    btn.addEventListener('click', () => {
      if (!variants || i === picked || i >= variants.length) return;
      picked = i;
      scene().reset();
      paintPicked();
    }),
  );
  paintPicked();

  scene().reset();

  let loop: LoopHandle | null = runLoop(panel, (dt) => {
    measure();
    ctx.clearRect(0, 0, stage.w, stage.h);
    // Same swap the panel makes: mono means the drawings reach for ink
    // wherever they would have reached for the accent.
    stage.acc = opts.mono ? stage.ink : stage.accent;
    // A paused stage still redraws — the panel has to survive a resize, a
    // theme change or a scroll-back without going blank; it just does not
    // advance the scene's own clock.
    scene().draw(paused ? 0 : dt * opts.speed, stage);
  });

  return {
    update(next) {
      if (typeof next.speed === 'number') opts.speed = next.speed;
      if (typeof next.mono === 'boolean') opts.mono = next.mono;
    },
    destroy() {
      loop?.destroy();
      loop = null;
      handle.destroy();
    },
  };
}
