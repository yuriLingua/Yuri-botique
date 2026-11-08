import { build } from 'esbuild';
import { copyFile, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
await rm('dist', { recursive: true, force: true });
await mkdir('dist/client', { recursive: true });
await build({ entryPoints: ['client/app.js'], bundle: true, format: 'esm', target: 'es2022', minify: true, legalComments: 'none', outdir: 'dist/client', external: ['/assets/*'] });
await copyFile('client/index.html', 'dist/client/index.html');
await cp('public', 'dist/client', { recursive: true });
console.log('Build concluído: interface pronta em dist/client. Execute npm start para abrir a loja.');
