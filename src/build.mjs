// Genera index.html + app.js a partir de src/.
//
// Uso (desde la carpeta del repositorio):
//   npm i -D esbuild firebase react@18 react-dom@18 tailwindcss@3
//   node src/build.mjs            -> versión real (Firebase)
//   node src/build.mjs --prueba   -> versión de prueba con datos en memoria (no publicar)
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(process.cwd(), 'package.json'));
const esbuild = require('esbuild');
const SRC = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(SRC, '..');
const prueba = process.argv.includes('--prueba');
const salida = prueba ? join(tmpdir(), 'panel-firebase-prueba') : RAIZ;

// 1) JS: app + React + Firebase en un solo archivo minimizado
// formato ESM con división de código: el módulo de inicio de sesión se descarga solo en #admin
execFileSync('rm', ['-rf', join(salida, 'js')]);
const r = await esbuild.build({
  entryPoints: [join(SRC, 'app.jsx')],
  bundle: true, minify: true, write: false, format: 'esm', splitting: true, target: 'es2020',
  outdir: join(salida, 'js'), entryNames: 'app-[hash]', chunkNames: 'parte-[hash]',
  alias: { datos: join(SRC, prueba ? 'datos-falso.js' : 'datos.js') },
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [join(process.cwd(), 'node_modules')],
  legalComments: 'none',
});
execFileSync('mkdir', ['-p', join(salida, 'js')]);
let entrada = '', total = 0;
for (const f of r.outputFiles) {
  writeFileSync(f.path, f.contents);
  total += f.contents.length;
  if (/app-[^/]+\.js$/.test(f.path)) entrada = 'js/' + f.path.split('/').pop();
}

// 2) CSS: solo las clases de Tailwind que usa la app
const tmp = mkdtempSync(join(tmpdir(), 'tw-'));
const cfg = join(tmp, 'tailwind.config.cjs');
writeFileSync(cfg, `module.exports = { content: [${JSON.stringify(join(SRC, 'app.jsx'))}, ${JSON.stringify(join(SRC, 'plantilla.html'))}] };`);
const salidaCss = join(tmp, 'out.css');
execFileSync(require.resolve('tailwindcss/lib/cli.js'), ['-c', cfg, '-i', join(SRC, 'estilos.css'), '-o', salidaCss, '--minify'], { stdio: 'ignore' });
const css = readFileSync(salidaCss, 'utf8');

// 3) Archivos finales (app.js con "?v=hash" para que el navegador no use una copia vieja)
execFileSync('mkdir', ['-p', salida]);
const html = readFileSync(join(SRC, 'plantilla.html'), 'utf8')
  .replace('/*CSS*/', () => css)
  .replace('/*JS*/', () => entrada);
writeFileSync(join(salida, 'index.html'), html);
const tam = r.outputFiles.map(f => `${f.path.split('/').pop()} ${(f.contents.length / 1024).toFixed(0)} KB`).join(', ');
console.log(`${prueba ? '[PRUEBA] ' : ''}generado en ${salida}: index.html ${(html.length / 1024).toFixed(0)} KB | ${tam}`);
