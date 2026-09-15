import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://douglasottodavila.github.io',
  integrations: [mdx(), react()],
  output: 'static',
  vite: {
    // Prebundle the graph renderer before an approved user opens the lazy Lab island.
    optimizeDeps: { include: ['d3'] },
    build: {
      cssMinify: 'lightningcss'
    }
  }
});
