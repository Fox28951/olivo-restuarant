// Regenerates index.html from data/content.json without starting the server: npm run build
import { loadContent, sanitizeContent } from '../lib/content.js';
import { buildIndex } from '../lib/render.js';

buildIndex(sanitizeContent(loadContent()));
console.log('index.html rebuilt from data/content.json');
