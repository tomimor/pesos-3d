// Renders every model page headlessly and writes public/modelos/<slug>.glb
// (Draco geometry + WebP textures via glTF-Transform) plus a gallery preview
// public/previews/<slug>.webp.
// Usage: npm run export [-- <slug> ...]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../public');
const pages = ['billetes', 'monedas'].flatMap((kind) =>
  fs.readdirSync(path.join(root, kind), { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, kind, d.name, 'index.html')))
    .map((d) => ({ kind, slug: d.name })));
const only = process.argv.slice(2);
const todo = only.length ? pages.filter((p) => only.includes(p.slug)) : pages;
if (only.length && todo.length !== only.length) throw new Error(`Unknown slug in: ${only.join(', ')}`);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const server = createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;

fs.mkdirSync(path.join(root, 'modelos'), { recursive: true });
fs.mkdirSync(path.join(root, 'previews'), { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const failures = [];
try {
  for (const { kind, slug } of todo) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${base}/${kind}/${slug}/`);
    await page.waitForFunction(() => document.querySelector('three-d-stage')?._object, null, { timeout: 180_000 });
    const glb = await page.evaluate(async () => {
      const buf = await document.querySelector('three-d-stage').toGlb();
      const url = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(new Blob([buf])); });
      return url.slice(url.indexOf(',') + 1);
    }).then((b64) => Buffer.from(b64, 'base64'));
    const raw = path.join(os.tmpdir(), `pesos-3d-${slug}.glb`), out = path.join(root, 'modelos', `${slug}.glb`);
    fs.writeFileSync(raw, glb);
    execFileSync(path.resolve(import.meta.dirname, '../node_modules/.bin/gltf-transform'),
      ['optimize', raw, out, '--compress', 'draco', '--texture-compress', 'webp', '--texture-size', '4096'], { stdio: 'ignore' });
    fs.rmSync(raw);
    // hide the HUD and toolbar so the preview is just the object
    await page.addStyleTag({ content: '.hud{display:none}' });
    await page.evaluate(() => {
      const s = document.querySelector('three-d-stage');
      s._controls.autoRotate = false;
      for (const el of s.shadowRoot.querySelectorAll('.toolbar,.note')) el.style.display = 'none';
    });
    await page.waitForTimeout(500);
    const png = path.join(root, 'previews', `${slug}.png`);
    await page.screenshot({ path: png });
    execFileSync('cwebp', ['-quiet', '-q', '80', '-resize', '600', '0', png, '-o', png.replace(/\.png$/, '.webp')]);
    fs.rmSync(png);
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log(`${slug}: ${kb} KB${errors.length ? ` — ${errors.length} error(s)` : ''}`);
    if (errors.length) failures.push(`${slug}:\n  ${errors.join('\n  ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (failures.length) throw new Error(`Console errors:\n${failures.join('\n')}`);
