/**
 * Settings for the site header.
 *
 * The only chrome section in settings.json — every other section belongs to a
 * drawn panel. It lives here rather than in `SiteNav.astro` so `settings.ts`
 * can name the type without importing a component.
 */

export interface NavOptions {
  /**
   * Whether the Services and Platform & Science labels open their menu of sub-pages on
   * hover or keyboard focus.
   *
   * Off by default, and the CSS is written so that "on" has to be switched on
   * rather than "off" switched off: the panels open only under
   * `[data-menus='on']`, which this sets once the setting has been read. With
   * no JavaScript, an unreachable settings.json, or the key absent, the menus
   * stay shut — and their links stay out of the tab order — instead of the
   * page briefly behaving as though they were enabled.
   *
   * Nothing is unreachable while they are off: each label is itself a link to
   * the index page that lists those sub-pages as cards.
   */
  hoverMenus: boolean;
}

export const NAV_DEFAULTS: NavOptions = {
  hoverMenus: false,
};
