// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// `site` is required for canonical URLs, sitemap.xml, and absolute OG image
// URLs. The custom domain is configured on the repository's Pages settings
// (diligencebio.ai) and pinned by public/CNAME.
//
// `base` stays '/' because this deploys to an apex domain, not to
// user.github.io/repo. If the custom domain is ever removed, set
// base: '/diligence-bio-website/' or every asset URL 404s.
export default defineConfig({
  site: 'https://diligencebio.ai',
  base: '/',
  trailingSlash: 'ignore',
  integrations: [
    // Every route now carries real content and is indexable, so nothing is
    // filtered out. Add a filter entry here if a page is ever set noindex —
    // the sitemap and the robots meta tag must tell the same story.
    sitemap(),
  ],
  build: {
    // Emit /about/index.html rather than /about.html so Pages serves clean
    // URLs without a redirect.
    format: 'directory',
    inlineStylesheets: 'auto',
  },
});
