// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// GitHub Pages project site: https://mizutani-140.github.io/shiki-atlas/
// `site` + `base` make every internal link and the Pages deploy resolve under
// the /shiki-atlas/ subpath.
export default defineConfig({
  site: 'https://mizutani-140.github.io',
  base: '/shiki-atlas',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Shiki Atlas',
      defaultLocale: 'root',
      locales: {
        root: { label: '日本語', lang: 'ja' },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/mizutani-140/shiki-atlas',
        },
      ],
      sidebar: [
        { label: 'はじめに', link: '/' },
        {
          label: 'GitHub の主要機能',
          items: [{ label: 'GitHub: Pull Request', link: '/github/pull-request/' }],
        },
        {
          label: 'Shiki',
          items: [{ label: 'Shiki 内部フロー', link: '/shiki/internal-flow/' }],
        },
      ],
    }),
  ],
});
