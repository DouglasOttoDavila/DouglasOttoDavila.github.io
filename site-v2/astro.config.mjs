import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://douglasottodavila.github.io',
  integrations: [mdx(), react()],
  output: 'static',
  vite: {
    build: {
      cssMinify: 'lightningcss'
    }
  }
});
