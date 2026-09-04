# DiligenceBio — diligencebio.ai

Marketing site for DiligenceBio. Built with [Astro](https://astro.build),
rendered to static HTML at build time, deployed to GitHub Pages on the apex
domain `diligencebio.ai`.

## Why Astro

SEO is the priority for this site, and the audience that matters most is not
only Google. Bing, LinkedIn, Slack unfurls, and the AI crawlers largely do not
execute JavaScript — a client-rendered app is an empty page to them. Astro ships
the full content as HTML and sends JavaScript only for the drawn panel on each
page (2–6KB gzipped per route). Every claim a canvas illustrates is also written
in the copy beside it, so the pages read correctly with the canvas removed.

## Run it

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # -> dist/
npm run preview    # serve dist/ locally
npm run check      # astro check — types and template diagnostics
```

Node 22+.

## Layout

```
public/            Copied verbatim to the site root
  fonts/           Archivo woff2 subsets, self-hosted (no third-party requests)
  images/          logo.png, og-default.png (1200x630 social card)
  settings.json    Runtime knobs for the hero simulation
  CNAME            Pins the custom domain on every deploy
  robots.txt       Points at the sitemap
src/
  layouts/
    Base.astro     Every page's <head>: title, description, canonical, OG,
                   Twitter card, Organization JSON-LD, font preload, and the
                   inline page-fade script
    PageShell.astro  The shell every page shares: one viewport tall, nav on
                   top, scrolling copy column beside a fixed stage panel
    Stub.astro     Plain centred page; only 404.astro uses it now
  components/
    SiteNav.astro  Header; Services and Science carry section menus
    Emergence.astro  The hero canvas, its overlay, and its controls
    ScenePanel.astro  Canvas + readout + controls for a multi-scene stage
  pages/           One file per route; 404.astro becomes GitHub Pages' 404
  scripts/
    canvasStage.ts   Shared plumbing: DPR-correct canvas, tokens, text and
                     line helpers, and a loop that pauses when unobserved
    scenePanel.ts    Scene cycling, arrows, hold, hover, deep-link select, and
                     the picker for a scene with competing builds
    emergence.ts     The hero particle simulation
    services.ts      Four service scenes
    science.ts       Two science scenes
    company.ts       The cost of finding a flaw late
    requestAccess.ts One email's journey
    scrollForward.ts Sends a wheel or a drag over the stage to the copy column
    settings.ts      Best-effort fetch of public/settings.json
  styles/
    global.css     Modernist design tokens and component classes
design/
  landing-bundle.html   The original design-tool export the site was ported
                        from. Reference only — never served.
```

## Pages

Each page is `PageShell` with two slots: `copy` on the left, `stage` on the
right. The stage is a canvas that argues the page's point rather than decorating
it, and it is `aria-hidden` — the copy carries every claim on its own.

| Route | Stage |
| --- | --- |
| `/` | The hero simulation: 340 particles through ten formations |
| `/services` | Four scenes, one per service, cycling and hover-selectable |
| `/science` | Two scenes: the measurement layer, and the generalizability frontier |
| `/company` | Two programs carrying the same flaw, found early and found late |
| `/request-access` | An email getting through screening, and being read |

`/services` and `/science` accept deep links — `#svc-3`, `#sci-2` — which scroll
the section into view and switch the stage to match. The nav menus use the same
hooks: from another page they are ordinary links, and on the page itself the
click is handed to the running panel instead of reloading.

## Retuning the animations

Every panel reads its timings from `public/settings.json` at runtime, one
section per panel. Edit that file and reload — no rebuild, no deploy.

| Section | Panel | Keys |
| --- | --- | --- |
| `emergence` | Landing hero | `speed`, `holdTime`, `linkStrength`, `mouseForce`, `mono` |
| `services` | Services | `speed`, `mono`, `adoptionSeconds`, `validationSeconds`, `productsSeconds`, `portfolioSeconds` |
| `science` | Science | `speed`, `mono`, `platformSeconds`, `generalizabilitySeconds` |
| `company` | Company | `speed`, `mono`, `loopSeconds` |
| `requestAccess` | Request access | `speed`, `mono`, `loopSeconds` |

`speed` multiplies playback. A `*Seconds` key on a multi-scene panel is how
long that scene holds before the panel advances; `loopSeconds` on a
single-animation panel is how long one full telling takes, with the beats
inside keeping their relative timing. `mono` drops the accent and draws in ink.

Each panel starts on the defaults compiled into its module and retunes in place
once the file lands, so nothing waits on a network round trip. Every key is
optional: a missing section, a missing key, or a malformed value leaves the
compiled-in default alone — a broken `settings.json` cannot take a page down.
The defaults themselves live beside the code they drive (`SERVICES_DEFAULTS`
and friends); `settings.json` should mirror them, not diverge silently.

The `_readme`, `_units` and `_note` keys in the file are documentation. The
merge is driven by each module's own option keys, so unknown keys are ignored.

### Adding a scene

Write a `Scene` (`label`, `duration`, `reset`, `draw`) in the page's script,
add it to the list passed to `initScenePanel`, and add a matching
`<section data-svc="N">` with a `data-svc-title="N"` heading. The panel wires up
hover, arrows, hold, the readout and the deep link from those two attributes.

### Competing builds of one scene

A slot in that list can be a `SceneChoice` instead of a `Scene`: several
`variants`, each a whole concept for the same section. The panel draws the
picked one and adds lettered buttons to the stage overlay while that slot is on
screen, so the concepts can be compared in place rather than in a branch. The
services page uses this for `AI & Data Products` — `A` fabrication, `C` a kit of
parts. Adding a concept is one more entry in `variants`.

The pick is a runtime affordance, not a setting: it resets to the first variant
on reload, and `settings.json` gives every variant of a slot the same duration
so switching concept does not switch pacing. Once the choice is settled, drop
the losing variant and the slot goes back to being a plain `Scene`.

## SEO checklist for new pages

1. Use `PageShell` (or `Base.astro` directly) and pass a **unique** `title` and
   `description`. Both are per-page ranking signals; duplicates waste them.
2. One `<h1>` per page, real `<h2>`/`<h3>` below it. Do not fake headings with
   styled divs.
3. Add the route to the nav in `SiteNav.astro` only once its page has content.
4. A page that is `noindex` must also be excluded from the sitemap — add a
   `filter` to `sitemap()` in `astro.config.mjs`. The two must tell the same
   story. Every current route is indexable, so there is no filter today.
5. Pass a custom `image` to `Base.astro` when a page deserves its own social
   card; otherwise `og-default.png` is used.

## Deploying

`.github/workflows/deploy.yml` builds and deploys on every push to `main`, and
can be run by hand from the Actions tab. Pages is configured with
`build_type: workflow`, so nothing is served from a branch directly.

The custom domain is set in the repository's Pages settings and pinned by
`public/CNAME`. If the domain is ever removed, set
`base: '/diligence-bio-website/'` in `astro.config.mjs` or every asset URL
will 404.

## The hero simulation

`src/scripts/emergence.ts` runs 340 particles through ten formations — two
separate populations (AI and biology) that converge, then resolve up the scales
of living systems from molecule to organism. It was ported from a React
component; the framework was never needed, since the simulation owns a canvas
and a rAF loop and touches the DOM only to update the readout.

It pauses when scrolled out of view or when the tab is hidden, and it holds a
single formation under `prefers-reduced-motion`. The canvas is `aria-hidden`:
every claim it illustrates is also in the copy beside it.

Its parameters come from `public/settings.json` at runtime, so they can be
retuned without a rebuild. A `data-*` prop on the component pins that one value
and opts it out of the settings file — use it for a one-off instance, not for
tuning the hero.

## Syncing from the design tool

The design lives in a separate tool and is exported as a zip of `.dc.html`
screens. Only the content matters: the markup, the copy, the drawing scripts and
`dbio-shell.css`. The tool's own scaffolding (`_ds/`, `support.js`, `uploads/`,
`.thumbnail`) is never imported.

The port is not mechanical. The exports are desktop-only, carry inline styles and
a React-shaped component wrapper, and repeat the same shell on every screen. In
this repo that becomes `PageShell` plus scoped styles, the drawing logic becomes
plain TypeScript modules over `canvasStage.ts`, and the hover-only nav menus gain
`:focus-within` so they work from a keyboard. The stacking breakpoint at 900px is
ours — the design source has none.
