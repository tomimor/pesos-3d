// Renders every exported GLB face-on, on a transparent background, for the archive album:
// public/album/<slug>.webp. Run after `npm run export`.
// Usage: npm run album
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../public');
const slugs = fs.readdirSync(path.join(root, 'modelos')).filter((f) => f.endsWith('.glb') && !f.endsWith('-hq.glb')).map((f) => f.slice(0, -4));
if (!slugs.length) throw new Error('No models in public/modelos: run npm run export first');

const page = `<!doctype html><script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.184.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.184.0/examples/jsm/"}}</script>
<canvas width="1200" height="1200"></canvas>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;
const key = new THREE.DirectionalLight(0xfff3dc, 2.2);
key.position.set(-2, 3, 5);
scene.add(key);
const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('https://unpkg.com/three@0.184.0/examples/jsm/libs/draco/gltf/'));
window.render = async (slug) => {
  const gltf = await loader.loadAsync('/modelos/' + slug + '.glb');
  const model = gltf.scene;
  const size0 = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  if (size0.y < size0.z) model.rotation.x = Math.PI / 2; // bills lie flat facing +Y: stand them up
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const s = box.getSize(new THREE.Vector3());
  const w = s.x / 2 * 1.04, h = s.y / 2 * 1.04;
  renderer.setSize(Math.round(1200 * Math.min(1, w / h)), Math.round(1200 * Math.min(1, h / w)), false);
  const camera = new THREE.OrthographicCamera(-w, w, h, -h, 0.001, 10);
  camera.position.set(0, 0, 1);
  scene.add(model);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  scene.remove(model);
  return renderer.domElement.toDataURL('image/png');
};
window.ready = true;
</script>`;

const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }).end(page); return; }
  const file = path.join(root, url);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0);

fs.mkdirSync(path.join(root, 'album'), { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.goto(`http://localhost:${server.address().port}/`);
  await tab.waitForFunction(() => window.ready);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pesos-album-'));
  for (const slug of slugs) {
    const png = path.join(tmp, `${slug}.png`);
    const data = await tab.evaluate((s) => window.render(s), slug);
    fs.writeFileSync(png, Buffer.from(data.split(',')[1], 'base64'));
    const out = path.join(root, 'album', `${slug}.webp`);
    execFileSync('cwebp', ['-quiet', '-q', '84', '-alpha_q', '90', '-resize', '900', '0', png, '-o', out]);
    console.log(slug, Math.round(fs.statSync(out).size / 1024), 'KB');
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
  server.close();
}
