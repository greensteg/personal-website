import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.wentongzhang.com',
  output: 'static',
  trailingSlash: 'always',
  markdown: {
    syntaxHighlight: false
  }
});
