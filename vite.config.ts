import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'website' ? [{
    name: 'hanpit-website-theme',
    transformIndexHtml: {
      order: 'pre',
      handler: html => html
        .replace('content="#142720"', 'content="#202a47"')
        .replace(/\s*<svg class="home-orbital"[\s\S]*?<\/svg>/, '')
        .replace('</head>', '<link rel="stylesheet" href="/src/web.css" />\n</head>'),
    },
  }] : [],
}));
