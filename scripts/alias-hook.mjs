// Node ESM resolve hook that maps the project's "@/..." import alias (which Vite
// provides at build time) onto the real files under ./src, so the source modules
// can be imported and tested directly with plain `node`. Run scripts from the
// project root so `./src` resolves correctly.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = pathToFileURL(path.resolve('./src')).href;

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    let target = SRC + '/' + specifier.slice(2);
    if (!/\.(js|jsx|json)$/.test(target)) target += '.js';
    return next(target, context);
  }
  return next(specifier, context);
}
