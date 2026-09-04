/**
 * Runtime settings, read from `public/settings.json`.
 *
 * Values live in a JSON file rather than in source so they can be retuned by
 * editing one file. The fetch is best-effort by design: on any failure — 404,
 * offline, malformed JSON, a request that hangs — this resolves to an empty
 * object and each consumer keeps its own compiled-in defaults. A missing or
 * broken settings file can never take a page down.
 *
 * Add new sections as sibling keys of `emergence`; nothing here is specific to
 * the hero.
 */

import type { EmergenceOptions } from './emergence';
import type { ServicesOptions } from './services';
import type { ScienceOptions } from './science';
import type { CompanyOptions } from './company';
import type { RequestAccessOptions } from './requestAccess';
import type { NavOptions } from './nav';

/**
 * One section per drawn panel on the site, plus `nav` for the header. Every
 * key is optional at every level: a section that is missing, or a value inside
 * it that is malformed, leaves the compiled-in default in place.
 */
export interface Settings {
  nav?: Partial<NavOptions>;
  emergence?: Partial<EmergenceOptions>;
  services?: Partial<ServicesOptions>;
  science?: Partial<ScienceOptions>;
  company?: Partial<CompanyOptions>;
  requestAccess?: Partial<RequestAccessOptions>;
}

/**
 * Copy the well-formed values of `next` over `target`, in place.
 *
 * Only keys already present on `target` are considered, and only when the
 * incoming value has the same type and — for numbers — is finite. Everything
 * else is ignored, which is what keeps a hand-edited settings.json from being
 * able to break a panel: the worst a bad value can do is nothing.
 */
export function applySettings<T extends object>(target: T, next: Partial<T> | undefined): void {
  if (!next || typeof next !== 'object') return;

  // The whole point of this helper is to copy values whose types are only
  // known at runtime, which no generic signature can express — so the two
  // casts are the unsoundness, contained here and guarded by the typeof
  // checks below rather than spread across five callers.
  const into = target as Record<string, unknown>;
  const from = next as Record<string, unknown>;

  // Driven by the target's keys, so a stray key in settings.json — the
  // "_note" annotations, or a typo — is ignored rather than copied in.
  for (const key of Object.keys(into)) {
    const current = into[key];
    const value = from[key];
    if (typeof current === 'number') {
      if (typeof value === 'number' && Number.isFinite(value)) into[key] = value;
    } else if (typeof current === 'boolean') {
      if (typeof value === 'boolean') into[key] = value;
    }
  }
}

/**
 * Cap on how long a hanging request is allowed to stay outstanding. Nothing
 * waits on this promise to render, so the timeout only bounds the retune.
 */
const TIMEOUT_MS = 4000;

let pending: Promise<Settings> | undefined;

/** Fetched at most once per page load and shared by every caller. */
export function loadSettings(): Promise<Settings> {
  pending ??= fetchSettings();
  return pending;
}

async function fetchSettings(): Promise<Settings> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}settings.json`, {
      // Revalidate instead of trusting a cached copy, so an edited file takes
      // effect on the next load rather than after the CDN TTL expires. A
      // revalidation that finds no change costs one 304, not a re-download.
      cache: 'no-cache',
      signal: controller.signal,
    });
    if (!response.ok) return {};

    const parsed: unknown = await response.json();
    return parsed !== null && typeof parsed === 'object' ? (parsed as Settings) : {};
  } catch {
    return {};
  } finally {
    window.clearTimeout(timer);
  }
}
