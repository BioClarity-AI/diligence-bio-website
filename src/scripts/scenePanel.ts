/**
 * The stage panel behind the Services and Science pages.
 *
 * Both pages are the same machine: a canvas that cycles a short list of drawn
 * scenes, one per section of the copy beside it. Hovering a section, using the
 * arrows, following a #svc-2 style deep link, or picking from the nav all
 * select a scene; the lock button holds the current one.
 *
 * A scene owns its own state and draws into the `Stage` it is handed, so the
 * two pages differ only in their scene lists and a few layout numbers.
 */

import { createStage, runLoop, type LayoutSpec, type Stage } from './canvasStage';

export type { Stage } from './canvasStage';

/** What a settings.json section can retune on a running panel. */
export interface ScenePanelOptions {
  /** Playback rate multiplier for the scenes. */
  speed: number;
  /** Ink-only rendering, no accent colour. */
  mono: boolean;
  /** Seconds each scene holds before the panel advances, in scene order. */
  durations: number[];
}

export interface Scene {
  /** Shown in the readout above the controls. */
  label: string;
  /** Seconds of screen time before the panel advances to the next scene. */
  duration: number;
  /** Called on entry and whenever the scene restarts its own loop. */
  reset(): void;
  draw(dt: number, s: Stage): void;
}

/** One competing build of a scene — a concept, not a variation in degree. */
export interface SceneVariant {
  /** Letter on the picker button. */
  id: string;
  /** Name of the concept, shown beside the buttons while it is picked. */
  label: string;
  /** One line on what it argues; the button's tooltip and accessible name. */
  title: string;
  scene: Scene;
}

/**
 * A slot holding several competing builds of the same section. The panel draws
 * the picked one and offers a chooser while the slot is on screen; adding a
 * concept is one more entry in `variants`.
 */
export interface SceneChoice {
  /** Shown in the readout — the section, not the concept. */
  label: string;
  variants: SceneVariant[];
}

/** A slot in the panel's list: one scene, or a choice between builds of it. */
export type SceneEntry = Scene | SceneChoice;

export function isChoice(entry: SceneEntry): entry is SceneChoice {
  return 'variants' in entry;
}

export interface ScenePanelConfig extends LayoutSpec {
  scenes: SceneEntry[];
  /** Attribute marking a section of copy: 'data-svc' or 'data-sci'. */
  sectionAttr: string;
  /** Attribute marking a section's heading, highlighted while its scene runs. */
  titleAttr: string;
  /** Deep-link prefix: 'svc' gives #svc-1. */
  hashPrefix: string;
  /** Event the nav dispatches to select a section without a page load. */
  pickEvent: string;
}

/** Seconds a cross-fade between two scenes takes. */
const FADE = 0.55;

export interface ScenePanelHandle {
  /** Retune a running panel. Omitted keys are left alone. */
  update(next: Partial<ScenePanelOptions>): void;
  destroy(): void;
}

export function initScenePanel(root: HTMLElement, config: ScenePanelConfig): ScenePanelHandle {
  const noop: ScenePanelHandle = { update() {}, destroy() {} };
  const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]');
  if (!canvas) return noop;

  const overlay = root.querySelector<HTMLElement>('[data-overlay]');
  const handle = createStage(canvas, { overlay, layout: config });
  if (!handle) return noop;

  const { stage, measure } = handle;
  const { ctx } = stage;
  const { scenes } = config;
  const panel = canvas.parentElement as HTMLElement;
  const readout = root.querySelector<HTMLElement>('[data-readout]');
  const lockBtn = root.querySelector<HTMLButtonElement>('[data-lock]');
  const lockDot = root.querySelector<HTMLElement>('[data-lock-dot]');
  const lockLabel = root.querySelector<HTMLElement>('[data-lock-label]');
  const variantBox = root.querySelector<HTMLElement>('[data-variants]');
  const variantSep = root.querySelector<HTMLElement>('[data-variant-sep]');
  const copy = document.querySelector<HTMLElement>('[data-page-copy]');

  /** Which build is picked in each slot; slots without a choice stay at 0. */
  const picks = scenes.map(() => 0);
  /** Every scene a slot can draw — one, or all of its competing builds. */
  const buildsOf = (entry: SceneEntry): Scene[] => (isChoice(entry) ? entry.variants.map((v) => v.scene) : [entry]);
  /** The scene a slot is drawing right now. */
  const sceneAt = (i: number): Scene => {
    const entry = scenes[i]!;
    return isChoice(entry) ? entry.variants[picks[i]!]!.scene : entry;
  };

  const titles = copy ? Array.from(copy.querySelectorAll<HTMLElement>(`[${config.titleAttr}]`)) : [];

  // Retunable at runtime from settings.json; the scene list supplies the
  // starting durations, so a section that omits them keeps the authored pacing.
  let speed = 1;
  let mono = false;

  // Reduced motion: hold one scene rather than cycling through them.
  let held = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let idx = 0;
  let age = 0;
  let shown = -1;
  let trans: { to: number; p: number } | null = null;

  /**
   * The concept picker, drawn only while a slot that has one is on screen.
   * Rebuilt on entry rather than kept around: it belongs to the slot, and the
   * buttons are as many as that slot has builds.
   */
  let variantBtns: HTMLButtonElement[] = [];
  let variantName: HTMLElement | null = null;

  const pickVariant = (i: number) => {
    const entry = scenes[idx]!;
    if (!isChoice(entry) || i === picks[idx]) return;
    picks[idx] = i;
    entry.variants[i]!.scene.reset();
    // Restart the clock too: a concept picked late in the slot's run would
    // otherwise be cut off before it has made its case.
    age = 0;
    variantBtns.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    if (variantName) variantName.textContent = entry.variants[i]!.label;
  };

  const paintPicker = () => {
    if (!variantBox) return;
    const entry = scenes[idx]!;
    const choice = isChoice(entry) && entry.variants.length > 1 ? entry : null;
    variantBox.hidden = !choice;
    if (variantSep) variantSep.hidden = !choice;
    if (!choice) {
      variantBox.replaceChildren();
      variantBtns = [];
      variantName = null;
      return;
    }

    const picked = picks[idx]!;
    const list = document.createElement('span');
    list.className = 'variant-picks';
    variantBtns = choice.variants.map((v, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = v.id;
      button.title = `${v.label} — ${v.title}`;
      button.setAttribute('aria-label', `${v.label} — ${v.title}`);
      button.setAttribute('aria-pressed', String(i === picked));
      button.addEventListener('click', () => pickVariant(i));
      list.append(button);
      return button;
    });

    variantName = document.createElement('span');
    variantName.className = 'variant-name';
    variantName.textContent = choice.variants[picked]!.label;
    variantBox.replaceChildren(list, variantName);
  };

  const show = (k: number) => {
    if (k === shown) return;
    shown = k;
    if (readout) readout.textContent = scenes[k]!.label;
    titles.forEach((el, j) => {
      el.style.color = j === k ? 'var(--color-accent)' : '';
    });
    paintPicker();
  };

  const paintLock = () => {
    if (lockLabel) lockLabel.textContent = held ? 'Held' : 'Auto';
    if (lockDot) lockDot.style.background = held ? 'currentColor' : 'transparent';
    if (lockBtn) {
      lockBtn.style.color = held ? 'var(--color-accent)' : 'var(--color-neutral-600)';
      lockBtn.setAttribute('aria-pressed', String(held));
    }
  };

  const nav = (d: number) => {
    const n = scenes.length;
    if (!trans) trans = { to: (((idx + d) % n) + n) % n, p: 0 };
  };

  /** `force` marks a deliberate pick — nav, arrows, deep link. A hover is not. */
  const go = (k: number, force = false) => {
    if (held && !force) return; // held: a stray hover must not switch
    if (!trans && k !== idx) trans = { to: k, p: 0 };
  };

  scenes.forEach((entry) => buildsOf(entry).forEach((s) => s.reset()));
  show(0);
  paintLock();

  const loop = runLoop(panel, (raw) => {
    measure();
    stage.acc = mono ? stage.ink : stage.accent;
    // The cross-fade runs at its own pace: it is a transition between scenes,
    // not part of one, so `speed` must not stretch it.
    const dt = raw * speed;

    let alpha = 1;
    if (trans) {
      trans.p += raw / FADE;
      // Swap at the midpoint of the fade, when the panel is at its darkest.
      if (trans.p >= 0.5 && idx !== trans.to) {
        idx = trans.to;
        age = 0;
        sceneAt(idx).reset();
        show(idx);
      }
      alpha = Math.abs(1 - 2 * Math.min(1, trans.p));
      if (trans.p >= 1) trans = null;
    } else {
      age += dt;
      if (!held && age > sceneAt(idx).duration) trans = { to: (idx + 1) % scenes.length, p: 0 };
    }

    ctx.clearRect(0, 0, stage.w, stage.h);
    ctx.save();
    ctx.globalAlpha = Math.max(0.02, alpha);
    sceneAt(idx).draw(dt, stage);
    ctx.restore();
  });

  const onPrev = () => nav(-1);
  const onNext = () => nav(1);
  const onLock = () => {
    held = !held;
    paintLock();
  };
  const prevBtn = root.querySelector<HTMLElement>('[data-prev]');
  const nextBtn = root.querySelector<HTMLElement>('[data-next]');
  prevBtn?.addEventListener('click', onPrev);
  nextBtn?.addEventListener('click', onNext);
  lockBtn?.addEventListener('click', onLock);

  // Hovering a section of the copy selects its scene.
  const sections = copy ? Array.from(copy.querySelectorAll<HTMLElement>(`[${config.sectionAttr}]`)) : [];
  const hovers = sections.map((el, i) => {
    const handler = () => go(i);
    el.addEventListener('mouseenter', handler);
    return { el, handler };
  });

  /** Scroll a section into view and switch to its scene. 1-based, as in the hash. */
  const select = (k: number, smooth: boolean) => {
    if (!k || k < 1 || k > scenes.length) return;
    go(k - 1, true);
    const el = copy?.querySelector<HTMLElement>(`[${config.sectionAttr}="${k}"]`);
    if (!el || !copy) return;
    // Land above the heading, clear of the section's top rule.
    copy.scrollTo({ top: Math.max(0, el.offsetTop - 54), behavior: smooth ? 'smooth' : 'auto' });
    // Flash it, so the jump is visible when the page does not reload.
    el.style.animation = 'none';
    requestAnimationFrame(() => {
      el.style.animation = 'bc-flash 2.2s ease-out';
    });
  };

  const fromHash = (smooth: boolean) =>
    select(Number.parseInt((location.hash || '').replace(`#${config.hashPrefix}-`, ''), 10), smooth);
  requestAnimationFrame(() => fromHash(false));

  const onHash = () => fromHash(true);
  window.addEventListener('hashchange', onHash);
  const onPick = (e: Event) => select((e as CustomEvent<number>).detail, true);
  window.addEventListener(config.pickEvent, onPick);

  return {
    update(next) {
      if (typeof next.speed === 'number' && Number.isFinite(next.speed) && next.speed > 0) speed = next.speed;
      if (typeof next.mono === 'boolean') mono = next.mono;
      if (Array.isArray(next.durations)) {
        next.durations.forEach((seconds, i) => {
          const entry = scenes[i];
          if (entry && typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
            // Every build of a slot gets the tuned time, so switching concept
            // does not switch pacing.
            buildsOf(entry).forEach((scene) => {
              scene.duration = seconds;
            });
          }
        });
      }
    },

    destroy() {
      loop.destroy();
      handle.destroy();
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener(config.pickEvent, onPick);
      prevBtn?.removeEventListener('click', onPrev);
      nextBtn?.removeEventListener('click', onNext);
      lockBtn?.removeEventListener('click', onLock);
      hovers.forEach(({ el, handler }) => el.removeEventListener('mouseenter', handler));
      variantBox?.replaceChildren();
    },
  };
}
