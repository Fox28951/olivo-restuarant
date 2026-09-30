import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Project root (one level above lib/)
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
