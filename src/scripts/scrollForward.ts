/**
 * The right-hand stage is a fixed panel with nothing to scroll, so a gesture
 * over it would do nothing at all. Forward it to the left copy column instead.
 *
 * Both gestures need handling, because they are different events: a mouse
 * sends `wheel`, and a finger sends `touchmove` and no wheel at all — which is
 * why dragging the stage on a phone did nothing until this existed.
 *
 * Delegated on the document rather than bound to the panel, so it works no
 * matter when the panels mount and needs no teardown.
 */

const LINE_HEIGHT = 16;

function wheelAmount(e: WheelEvent): number {
  if (e.deltaMode === 1) return e.deltaY * LINE_HEIGHT; // lines
  if (e.deltaMode === 2) return e.deltaY * window.innerHeight; // pages
  return e.deltaY;
}

/**
 * The copy column, but only while it is the thing that scrolls.
 *
 * Stacked on a phone in portrait it is not: it renders `overflow: visible` and
 * the document scrolls instead. Forwarding there would hijack ordinary page
 * scrolling, so this returns null and the gesture is left alone.
 */
function scrollingCopy(): HTMLElement | null {
  const copy = document.querySelector<HTMLElement>('[data-page-copy]');
  if (!copy) return null;

  const overflow = getComputedStyle(copy).overflowY;
  if (overflow !== 'auto' && overflow !== 'scroll') return null;

  return copy.scrollHeight - copy.clientHeight > 1 ? copy : null;
}

/** Move the column by `delta` px. Returns whether it actually moved. */
function scrollBy(copy: HTMLElement, delta: number): boolean {
  const room = copy.scrollHeight - copy.clientHeight;
  const next = Math.max(0, Math.min(room, copy.scrollTop + delta));
  if (next === copy.scrollTop) return false;
  copy.scrollTop = next;
  return true;
}

const overStage = (target: EventTarget | null) => !!(target as Element | null)?.closest?.('[data-page-stage]');

let installed = false;

export function initScrollForward(): void {
  if (installed) return;
  installed = true;

  document.addEventListener(
    'wheel',
    (e) => {
      if (!overStage(e.target)) return;
      const copy = scrollingCopy();
      if (copy && scrollBy(copy, wheelAmount(e))) e.preventDefault();
    },
    { passive: false },
  );

  // Touch: track the finger and move the column by the same distance, so the
  // copy follows the drag one to one. No momentum — a fling stops when the
  // finger lifts, which reads as deliberate on a panel this size.
  let tracking = false;
  let lastY = 0;

  document.addEventListener(
    'touchstart',
    (e) => {
      const touch = e.touches[0];
      tracking = !!touch && overStage(e.target);
      if (touch) lastY = touch.clientY;
    },
    { passive: true },
  );

  document.addEventListener(
    'touchmove',
    (e) => {
      if (!tracking) return;
      const touch = e.touches[0];
      if (!touch) return;

      const copy = scrollingCopy();
      if (!copy) return;

      // Finger up is a scroll down, hence the subtraction in this order.
      const delta = lastY - touch.clientY;
      lastY = touch.clientY;
      if (scrollBy(copy, delta)) e.preventDefault();
    },
    { passive: false },
  );

  document.addEventListener(
    'touchend',
    () => {
      tracking = false;
    },
    { passive: true },
  );
}
