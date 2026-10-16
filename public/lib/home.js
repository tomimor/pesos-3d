import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { piezas, pathOf, buscadas } from './piezas.js';
import { rosette } from './guilloche.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const kindLabel = { billete: 'Billete', moneda: 'Moneda', ficha: 'Ficha' };
const mb = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB';
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------------------------------------------------------------- DOM

const coleccion = document.getElementById('coleccion');
coleccion.innerHTML = piezas.map((p, i) => {
  const long = p.numeral.length > 2;
  return `<section class="pieza" id="${p.slug}" data-slug="${p.slug}" style="--glow:${p.glow}" aria-labelledby="h-${p.slug}">
  <div class="pin">
    <div class="rosette" data-seed="${p.slug}"></div>
    <div class="copy">
      <h2 id="h-${p.slug}"><span class="numeral${long ? ' long' : ''}" style="view-transition-name:num-${p.slug}">${esc(p.numeral)}</span><span class="unit" style="view-transition-name:unit-${p.slug}">${esc(p.unit)}</span></h2>
      <p class="title" style="view-transition-name:title-${p.slug}">${esc(p.title)}</p>
      <dl class="facts"><dt>Tipo</dt><dd>${kindLabel[p.kind]}</dd>${p.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="actions">
        <a class="btn solid" href="${pathOf(p)}">Ver en detalle</a>
        <a class="btn" href="modelos/${p.slug}.glb" download>Descargar GLB <small>${mb(p.glb)}</small></a>
      </div>
    </div>
    <p class="counter">${String(i + 1).padStart(2, '0')} de ${String(piezas.length).padStart(2, '0')}</p>
  </div>
</section>`;
}).join('');

document.querySelector('.hilo').innerHTML = piezas
  .map((p) => `<a href="#${p.slug}"><span>${esc(p.numeral)} ${esc(p.unit)}</span></a>`).join('');

document.querySelector('[data-archivo]').innerHTML =
  piezas.map((p) => `<li><a href="${pathOf(p)}" style="--c:${p.glow}"><figure>
    <div class="ph"><img src="previews/${p.slug}.webp" alt="" width="600" height="400" loading="lazy"></div>
    <figcaption><b>${esc(p.label)}</b><span>${esc(p.title !== p.label ? p.title : p.facts[0][1])}</span></figcaption></figure></a></li>`).join('') +
  buscadas.map((b) => `<li class="buscada"><figure>
    <div class="ph">${rosette('buscada-' + b.title, { rings: 2 })}<strong>${esc(b.numeral)}</strong></div>
    <figcaption><b>${esc(b.numeral)} ${esc(b.unit)}</b><span>${esc(b.title)}. Se busca</span></figcaption></figure></li>`).join('');

for (const el of document.querySelectorAll('.rosette[data-seed]')) el.innerHTML = rosette(el.dataset.seed);
// pin the hero's colour so re-inking :root never repaints its rosette
document.querySelector('[data-hero]').style.setProperty('--glow', piezas.find((p) => p.slug === '1-peso').glow);

const sections = [...document.querySelectorAll('[data-slug]')].map((el) => ({
  el,
  pin: el.querySelector('.pin'),
  rosette: el.querySelector('.rosette'),
  slug: el.dataset.slug,
  hero: el.hasAttribute('data-hero'),
  mesa: el.hasAttribute('data-mesa'),
  piece: piezas.find((p) => p.slug === el.dataset.slug),
}));
const threadLinks = [...document.querySelectorAll('.hilo a')];

// ---------------------------------------------------------------- scene

const canvas = document.querySelector('.vitrina');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
const maxRatio = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(maxRatio);
// step the resolution down (never back up) while frames run slow, so phones keep scrolling smoothly
const perf = { ratio: maxRatio, last: 0, slow: 0, n: 0 };
function adapt(time) {
  const dt = time - perf.last;
  perf.last = time;
  if (dt > 200 || document.hidden) return; // tab switches and load stalls aren't steady-state cost
  perf.n++;
  if (dt > 22) perf.slow++;
  if (perf.n < 90) return;
  if (perf.slow > 30 && perf.ratio > 1) {
    perf.ratio = Math.max(1, perf.ratio - 0.25);
    renderer.setPixelRatio(perf.ratio);
    layout();
  }
  perf.n = perf.slow = 0;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
camera.position.set(0, 0, 8);

const key = new THREE.DirectionalLight(0xfff3dc, 2.4);
key.position.set(-3, 4, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xe9c766, 3.2);
rim.position.set(4, 1.5, -3);
scene.add(rim);
scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x1a1712, 0.5));

const draco = new DRACOLoader().setDecoderPath('https://unpkg.com/three@0.184.0/examples/jsm/libs/draco/gltf/');
const loader = new GLTFLoader().setDRACOLoader(draco);
const glbCache = new Map();
const loadGlb = (slug) => {
  if (!glbCache.has(slug)) glbCache.set(slug, loader.loadAsync(`modelos/${slug}.glb`));
  return glbCache.get(slug);
};

const flutter = { value: 0 };
// paper never sits still: a slow travelling wave along the note's length
function addFlutter(material) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = flutter;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float edge = smoothstep(0.0, 0.07, abs(position.x));
        transformed.y += (sin(position.x * 38.0 - uTime * 1.3) * 0.0016 + sin(position.z * 55.0 + uTime * 0.9) * 0.0007) * (0.35 + edge);`);
  };
  material.customProgramCacheKey = () => 'flutter';
}

// One holder per section: outer = screen placement, spin = scroll-driven turn, model = normalised GLB
function makeHolder(section) {
  const outer = new THREE.Group();
  const spin = new THREE.Group();
  outer.add(spin);
  outer.visible = false;
  scene.add(outer);
  const h = { outer, spin, ready: false, appear: 0, toss: null, section };
  h.load = () => loadGlb(section.slug).then((gltf) => {
    const model = section.hero ? gltf.scene.clone(true) : gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    model.position.sub(sphere.center);
    const pivot = new THREE.Group();
    pivot.add(model);
    const isBill = section.piece?.kind === 'billete';
    pivot.scale.setScalar((isBill ? 1 : 0.86) / sphere.radius);
    if (isBill) {
      pivot.rotation.x = Math.PI / 2 - 0.42;
      model.traverse((o) => { if (o.isMesh && !reduced) for (const m of [o.material].flat()) addFlutter(m); });
    }
    model.traverse((o) => { if (o.isMesh) for (const m of [o.material].flat()) { if (m.map) m.map.anisotropy = renderer.capabilities.getMaxAnisotropy(); } });
    spin.add(pivot);
    h.isBill = isBill;
    const lupa = section.piece?.lupa;
    if (lupa && !section.hero) {
      // bills lie in XZ facing +Y, coins in XY facing +Z
      h.focus = surfaceAt(model, lupa, isBill ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
      pivot.updateMatrix();
      h.focus.applyMatrix4(pivot.matrix);
      h.zoom = lupa.zoom;
    }
    // compile shaders and upload textures now, off the scroll path, instead of on first appearance
    return renderer.compileAsync(pivot, camera, scene).then(() => { warmTextures(pivot); h.ready = true; });
  });
  return h;
}

// Every piece at true size on one table: bills fanned out, coins dropped on top.
const table = [
  ['2-pesos-1888', 0.055, 0.000, -0.045, 0.32],
  ['1000000-pesos', -0.065, 0.0015, -0.03, -0.1],
  ['5-pesos', 0.035, 0.003, 0.035, -0.22],
  ['50-pesos', -0.045, 0.0045, 0.045, 0.14],
  ['1-peso', -0.1, 0.012, 0.1, 0],
  ['25-centavos-1994', -0.055, 0.012, 0.118, 0],
  ['token-patrio-2026', -0.005, 0.012, 0.108, 0],
  ['cospel-subte', 0.05, 0.012, 0.112, 0],
  ['ficha-telefono', 0.098, 0.012, 0.09, 0],
];
// a 20 cm boxwood ruler in front of the coins, so "escala real" reads at a glance
function ruler() {
  const W = 2400, H = 220, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2a2318';
  const mm = (W - 80) / 200;
  for (let i = 0; i <= 200; i++) {
    const x = 40 + i * mm, len = i % 10 === 0 ? 90 : i % 5 === 0 ? 60 : 36;
    g.fillRect(x - 1.5, 0, 3, len);
    if (i % 10 === 0) { g.font = '600 54px Archivo, sans-serif'; g.textAlign = 'center'; g.fillText(String(i / 10), x, 160); }
  }
  g.font = 'italic 40px "Bodoni Moda", serif'; g.textAlign = 'right'; g.fillText('cm', W - 40, 200);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const L = 0.2 + 80 / mm / 1000, mesh = new THREE.Mesh(
    new THREE.BoxGeometry(L, 0.002, L * H / W),
    [null, null, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), null, null, null].map((m) => m ?? new THREE.MeshStandardMaterial({ color: 0xc9b98f, roughness: 0.8 })),
  );
  mesh.position.set(0, -0.001, 0.155);
  return mesh;
}

// The point on the textured front face whose UV is (u, v): found on the actual mesh, so curled
// paper and textures that don't fill the face still land the detail exactly under the lens.
function surfaceAt(model, { u, v }, front) {
  model.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  // getBarycoord works on Vector3s: UVs go in with z = 0
  const ta = new THREE.Vector3(), tb = new THREE.Vector3(), tc = new THREE.Vector3(), bary = new THREE.Vector3();
  const target = new THREE.Vector3(u, 1 - v, 0); // the exported UVs run bottom-up
  let hit = null, best = -Infinity;
  model.traverse((o) => {
    if (!o.isMesh || !o.material.map) return;
    const pos = o.geometry.attributes.position, uv = o.geometry.attributes.uv, idx = o.geometry.index;
    // only the face mesh itself: its normals point forward on average (edges and backs don't)
    const nrm = o.geometry.attributes.normal;
    let avg = 0;
    for (let i = 0; i < nrm.count; i++) avg += n.fromBufferAttribute(nrm, i).transformDirection(o.matrixWorld).dot(front);
    if (avg / nrm.count < 0.5) return;
    const tris = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < tris; t++) {
      const [i, j, k] = idx ? [idx.getX(3 * t), idx.getX(3 * t + 1), idx.getX(3 * t + 2)] : [3 * t, 3 * t + 1, 3 * t + 2];
      ta.set(uv.getX(i), uv.getY(i), 0); tb.set(uv.getX(j), uv.getY(j), 0); tc.set(uv.getX(k), uv.getY(k), 0);
      if (!THREE.Triangle.getBarycoord(target, ta, tb, tc, bary)) continue;
      if (bary.x < 0 || bary.y < 0 || bary.z < 0) continue;
      a.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, j).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld);
      THREE.Triangle.getNormal(a, b, c, n);
      const facing = n.dot(front);
      if (facing > best) { best = facing; hit = a.clone().multiplyScalar(bary.x).addScaledVector(b, bary.y).addScaledVector(c, bary.z); }
    }
  });
  if (!hit) throw new Error(`lupa: no front-facing surface at uv (${u}, ${v})`);
  return hit;
}

function warmTextures(root) {
  root.traverse((o) => {
    for (const m of [o.material].flat()) {
      if (m) for (const v of Object.values(m)) if (v?.isTexture) renderer.initTexture(v);
    }
  });
}

function makeTable(section) {
  const outer = new THREE.Group(), spin = new THREE.Group(), deck = new THREE.Group();
  outer.add(spin);
  spin.add(deck);
  outer.visible = false;
  scene.add(outer);
  const h = { outer, spin, deck, items: [], ready: false, appear: 0, section, isTable: true };
  h.load = () => Promise.all(table.map(([slug]) => loadGlb(slug))).then((gltfs) => {
    gltfs.forEach((gltf, i) => {
      const [slug, x, y, z, ry] = table[i];
      const model = gltf.scene.clone(true);
      const box = new THREE.Box3().setFromObject(model);
      model.position.sub(box.getCenter(new THREE.Vector3()));
      const piece = new THREE.Group();
      piece.add(model);
      if (piezas.find((p) => p.slug === slug).kind === 'billete') {
        model.traverse((o) => { if (o.isMesh && !reduced) for (const m of [o.material].flat()) addFlutter(m); });
      } else {
        piece.rotation.x = -Math.PI / 2; // lay the coin flat, obverse up
      }
      piece.position.set(x, y, z);
      piece.rotation.y = ry;
      deck.add(piece);
      // an invisible stand-in for picking: raycasting the real meshes would mean millions of triangles,
      // and coins get a wider one so a fingertip can catch them
      const isBill = piece.rotation.x === 0, sz = box.getSize(new THREE.Vector3());
      const proxy = new THREE.Mesh(
        isBill ? new THREE.BoxGeometry(sz.x, sz.y + 0.004, sz.z) : new THREE.CylinderGeometry(sz.x * 0.8, sz.x * 0.8, sz.z + 0.004, 24),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      if (!isBill) proxy.rotation.x = Math.PI / 2;
      piece.add(proxy);
      const item = { obj: piece, proxy, isBill, r: sz.x / 2, base: y, lift: 0, vel: new THREE.Vector2(), spin: 0 };
      proxy.userData.item = item;
      h.items.push(item);
    });
    deck.add(ruler());
    const sphere = new THREE.Box3().setFromObject(deck).getBoundingSphere(new THREE.Sphere());
    deck.position.sub(sphere.center);
    deck.scale.setScalar(1);
    h.radius = sphere.radius;
    return renderer.compileAsync(deck, camera, scene).then(() => { warmTextures(deck); h.ready = true; });
  });
  return h;
}

const holders = sections.map((s) => (s.mesa ? makeTable(s) : makeHolder(s)));

// ---------------------------------------------------------------- layout

let vw = innerWidth, vh = innerHeight, halfH = 1, halfW = 1, anchor = new THREE.Vector2(), size = 1, narrow = false;
function layout() {
  vw = innerWidth;
  vh = innerHeight;
  renderer.setSize(vw, vh, false);
  camera.aspect = vw / vh;
  camera.updateProjectionMatrix();
  halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  halfW = halfH * camera.aspect;
  narrow = vw <= 760 || vw / vh <= 0.8;
  if (narrow) {
    anchor.set(0, halfH * 0.36);
    size = Math.min(halfW * 0.86, halfH * 0.42);
  } else {
    anchor.set(halfW * 0.36, 0.02 * halfH);
    size = Math.min(halfH * 0.7, halfW * 0.5);
  }
  // rosette: same centre as the object, a bit larger
  const px = (v, half, dim) => (v / half) * (dim / 2) + dim / 2;
  root.style.setProperty('--ax', px(anchor.x, halfW, vw) + 'px');
  root.style.setProperty('--ay', (vh - px(anchor.y, halfH, vh)) + 'px');
  root.style.setProperty('--as', (size / halfH) * vh * 1.55 + 'px');
}
layout();
addEventListener('resize', layout);

// ---------------------------------------------------------------- scroll state

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const inkA = new THREE.Color(), inkB = new THREE.Color(), glowC = new THREE.Color();
const restInk = new THREE.Color('#16202e'), restGlow = new THREE.Color('#e9c766');
let lastInk = '';

// the pointer tilts the piece a little and drags the key light, so metal and ink catch it
const pointer = new THREE.Vector2(), tilt = new THREE.Vector2();
addEventListener('pointermove', (e) => pointer.set((e.clientX / vw) * 2 - 1, (e.clientY / vh) * 2 - 1), { passive: true });

let lastActive = -2, drewLast = true;
const lens = new THREE.Vector3();
const lupaEl = document.querySelector('.lupa'), lupaText = lupaEl.querySelector('p');
let lastLupa = '', lastLupaPiece = null;
let prevTime = 0;
function frame(time) {
  const t = time / 1000;
  const dt = Math.min(0.05, (time - prevTime) / 1000);
  prevTime = time;
  flutter.value = t;
  if (!reduced && !grab) tilt.lerp(pointer, 0.05); // hold the table still while a piece is in hand
  key.position.set(-3 + tilt.x * 6, 4 - tilt.y * 5, 5);

  let lupaZ = 0, lupaPiece = null;
  let mixInk = new THREE.Color(0, 0, 0), mixGlow = new THREE.Color(0, 0, 0), wsum = 0, active = -1, best = 1e9;
  // read every box before writing any style, so the loop never forces a synchronous layout
  const rects = sections.map((s) => s.el.getBoundingClientRect());
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i], h = holders[i];
    const r = rects[i];
    // where the sticky pin sits: 0 while pinned, ±vh while entering/leaving (derived from the section
    // box so it stays valid when content-visibility skips rendering offscreen sections)
    const pinTop = r.top > 0 ? r.top : r.bottom < vh ? r.bottom - vh : 0;
    const enter = 1 - Math.min(1, Math.max(0, pinTop / vh)); // 0 → 1 as it slides in
    const dwell = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh))); // 0 → 1 while pinned
    const visible = pinTop < vh && pinTop > -vh;

    if (!s.hero && pinTop < vh * 1.2 && pinTop > -vh * 1.2) {
      const e = ss(0.15, 0.85, enter).toFixed(3), d = ss(0, 1, enter * 0.7 + dwell * 0.6).toFixed(3);
      if (e !== s.e) s.el.style.setProperty('--e', (s.e = e));
      if (s.rosette && d !== s.d) s.rosette.style.setProperty('--draw', (s.d = d));
    }

    // colour weight: how centred this pin is
    const w = Math.max(0, 1 - Math.abs(pinTop) / vh);
    if (w > 0) {
      const p = s.piece ?? { ink: '#16202e', glow: '#e9c766' };
      mixInk.add(inkA.set(p.ink).multiplyScalar(w));
      mixGlow.add(glowC.set(p.glow).multiplyScalar(w));
      wsum += w;
    }
    if (!s.hero && !s.mesa && Math.abs(pinTop) < best && r.top < vh * 0.5 && r.bottom > vh * 0.5) { best = Math.abs(pinTop); active = i; }

    if (!h.requested && pinTop < vh * 2.5 && pinTop > -vh * 2) { h.requested = true; h.load(); }
    h.outer.visible = visible && h.ready;
    if (!h.ready || !visible) continue;
    h.appear += (1 - h.appear) * (reduced ? 1 : 0.06);

    // follow the pinned container exactly so the DOM rosette and the object stay together
    const y = anchor.y - (pinTop / vh) * 2 * halfH;
    h.outer.position.set(anchor.x, y, 0);
    const scale = size * (0.82 + 0.18 * h.appear) * (0.86 + 0.14 * ss(0, 1, enter));
    h.outer.scale.setScalar(scale);

    const idle = reduced ? 0 : t;
    if (h.isTable) {
      // seen from above, then the camera lowers toward table height as you scroll
      h.outer.scale.setScalar((size * (narrow ? 1.08 : 1.42) * (0.86 + 0.14 * ss(0, 1, enter))) / h.radius);
      h.spin.rotation.set(1.25 - 0.55 * ss(0.1, 0.9, dwell) + tilt.y * 0.08, -0.25 + 0.5 * ss(0, 1, dwell) + tilt.x * 0.12, 0);
      slide(h, dt);
      continue;
    }
    if (s.hero) {
      heroPose(h, idle);
    } else {
      // the loupe: settle face-on, magnify one detail, let go, then turn the piece over
      const z = reduced ? 0 : ss(0.1, 0.3, dwell) * (1 - ss(0.5, 0.64, dwell));
      const calm = 1 - z * 0.92, flip = Math.PI * ss(0.68, 0.94, dwell);
      if (h.isBill) {
        // a note held up and swaying, turned at the end to show its back
        h.spin.rotation.set(
          (Math.sin(idle * 0.5) * 0.05 + tilt.y * 0.14) * calm - (1 - enter) * 0.5,
          (-0.35 + Math.sin(idle * 0.37) * 0.06 + tilt.x * 0.2) * calm + flip + (1 - enter) * -0.6,
          (-0.12 + Math.sin(idle * 0.31) * 0.035) * calm,
        );
      } else {
        h.spin.rotation.set(
          (0.18 + Math.sin(idle * 0.6) * 0.05 + tilt.y * 0.18) * calm,
          (-0.55 + Math.sin(idle * 0.45) * 0.12 + tilt.x * 0.3) * calm + flip + (1 - enter) * -1.4,
          0.05 * calm,
        );
      }
      if (h.focus && z > 0) {
        // enlarge, then slide so the detail sits exactly in the middle of the lens
        const k = 1 + z * (h.zoom - 1);
        h.outer.scale.multiplyScalar(k);
        lens.copy(h.focus).applyEuler(h.spin.rotation).multiplyScalar(h.outer.scale.x * z);
        h.outer.position.x -= lens.x;
        h.outer.position.y -= lens.y;
        h.outer.position.z -= lens.z;
      }
      if (z > lupaZ) { lupaZ = z; lupaPiece = s.piece; }
    }
  }

  // the loupe lives above the canvas, so it is one fixed layer shared by every piece
  const lz = lupaZ.toFixed(3);
  if (lz !== lastLupa) { lastLupa = lz; root.style.setProperty('--z', lz); lupaEl.classList.toggle('on', lupaZ > 0); }
  if (lupaPiece && lupaPiece !== lastLupaPiece) { lastLupaPiece = lupaPiece; lupaText.textContent = lupaPiece.lupa.caption; }

  // re-ink the page
  if (wsum > 0) { mixInk.multiplyScalar(1 / wsum); mixGlow.multiplyScalar(1 / wsum); } else { mixInk.copy(restInk); mixGlow.copy(restGlow); }
  const ink = '#' + mixInk.getHexString();
  if (ink !== lastInk) {
    lastInk = ink;
    root.style.setProperty('--ink', ink);
    root.style.setProperty('--glow', '#' + mixGlow.getHexString());
  }
  rim.color.copy(mixGlow);

  if (active !== lastActive) {
    lastActive = active;
    threadLinks.forEach((a, i) => a.setAttribute('aria-current', String(active - 1 === i)));
  }
  // nothing on stage (archive, footer): clear once, then stop drawing
  const showing = holders.some((h) => h.outer.visible);
  if (showing || drewLast) { renderer.render(scene, camera); adapt(time); }
  drewLast = showing;
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- the table can be touched

const tableHolder = holders.find((h) => h.isTable);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), inv = new THREE.Matrix4(), onDeck = new THREE.Vector3();
const deckRay = new THREE.Ray(), deckPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let grab = null;

function aimAt(x, y) {
  ndc.set((x / vw) * 2 - 1, -(y / vh) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function itemAt(x, y) {
  if (!tableHolder.ready || !tableHolder.outer.visible) return null;
  aimAt(x, y);
  const hit = ray.intersectObjects(tableHolder.items.map((i) => i.proxy), false)[0];
  return hit ? hit.object.userData.item : null;
}
// where the pointer meets the table, in deck coordinates, at the height a held piece floats
function deckPointer(x, y, height) {
  aimAt(x, y);
  inv.copy(tableHolder.deck.matrixWorld).invert();
  deckRay.copy(ray.ray).applyMatrix4(inv);
  deckPlane.constant = -height;
  return deckRay.intersectPlane(deckPlane, onDeck);
}

addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('a, button')) return;
  const item = itemAt(e.clientX, e.clientY);
  if (!item) return;
  const p = deckPointer(e.clientX, e.clientY, item.base);
  if (!p) return;
  e.preventDefault();
  grab = { item, id: e.pointerId, dx: item.obj.position.x - p.x, dz: item.obj.position.z - p.z, t: performance.now() };
  item.vel.set(0, 0);
  item.spin = 0;
  document.body.classList.add('agarrando');
});
addEventListener('pointermove', (e) => {
  if (!grab) {
    if (e.pointerType === 'mouse') document.body.classList.toggle('agarrable', !!itemAt(e.clientX, e.clientY));
    return;
  }
  if (e.pointerId !== grab.id) return;
  const p = deckPointer(e.clientX, e.clientY, grab.item.base);
  if (!p) return;
  const now = performance.now(), it = grab.item, step = Math.max(1, now - grab.t) / 1000;
  const nx = p.x + grab.dx, nz = p.z + grab.dz;
  // keep a smoothed hand velocity so a flick carries on after release
  it.vel.lerp(new THREE.Vector2((nx - it.obj.position.x) / step, (nz - it.obj.position.z) / step), 0.5);
  it.obj.position.x = nx;
  it.obj.position.z = nz;
  grab.t = now;
});
function letGo(e) {
  if (!grab || e.pointerId !== grab.id) return;
  const it = grab.item;
  // flicked off-centre, a piece turns as it slides
  it.spin = THREE.MathUtils.clamp((grab.dx * it.vel.y - grab.dz * it.vel.x) * 900, -14, 14) * (it.isBill ? 0.4 : 1);
  if (it.vel.length() > 1.2) it.vel.setLength(1.2);
  grab = null;
  document.body.classList.remove('agarrando');
}
addEventListener('pointerup', letGo);
addEventListener('pointercancel', letGo);
// on touch screens a drag that starts on a piece moves the piece, anywhere else it scrolls the page
addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  if (e.touches.length === 1 && !e.target.closest('a, button') && itemAt(t.clientX, t.clientY)) e.preventDefault();
}, { passive: false });

const bounds = { x: 0.2, z: 0.16 };
function slide(h, dt) {
  for (const it of h.items) {
    const held = grab?.item === it;
    it.lift += ((held ? 0.025 : 0) - it.lift) * Math.min(1, dt * 14);
    it.obj.position.y = it.base + it.lift;
    if (held) continue;
    const p = it.obj.position;
    p.x += it.vel.x * dt;
    p.z += it.vel.y * dt;
    // paper drags on the cloth sooner than metal does
    it.vel.multiplyScalar(Math.exp(-dt * (it.isBill ? 5 : 2.4)));
    if (it.isBill) it.obj.rotation.y += it.spin * dt;
    else it.obj.rotation.z += it.spin * dt;
    it.spin *= Math.exp(-dt * 2.2);
    for (const [k, v] of [['x', 'x'], ['z', 'y']]) {
      if (Math.abs(p[k]) > bounds[k]) { p[k] = Math.sign(p[k]) * bounds[k]; it.vel[v] *= -0.45; }
    }
  }
  // coins knock into each other: equal masses swap their velocity along the line between centres
  const coins = h.items.filter((i) => !i.isBill);
  for (let i = 0; i < coins.length; i++) for (let j = i + 1; j < coins.length; j++) {
    const a = coins[i], b = coins[j];
    const dx = b.obj.position.x - a.obj.position.x, dz = b.obj.position.z - a.obj.position.z, d = Math.hypot(dx, dz), min = a.r + b.r;
    if (d >= min || d === 0 || Math.abs(a.lift - b.lift) > 0.01) continue;
    const nx = dx / d, nz = dz / d, push = (min - d) / 2;
    a.obj.position.x -= nx * push; a.obj.position.z -= nz * push;
    b.obj.position.x += nx * push; b.obj.position.z += nz * push;
    const rel = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * nz;
    if (rel < 0) { a.vel.x += rel * nx; a.vel.y += rel * nz; b.vel.x -= rel * nx; b.vel.y -= rel * nz; }
  }
}

// ---------------------------------------------------------------- cara o ceca

const heroHolder = holders[0];
const result = document.querySelector('.toss-result');
function heroPose(h, idle) {
  const base = { x: 0.16 + Math.sin(idle * 0.7) * 0.04, y: -0.5 + Math.sin(idle * 0.4) * 0.25, lift: 0 };
  if (h.toss) {
    const k = Math.min(1, (performance.now() - h.toss.start) / h.toss.dur);
    const e = 1 - Math.pow(1 - k, 3);
    base.x = h.toss.from + (h.toss.to - h.toss.from) * e;
    base.y = -0.5 + (1 - e) * 0.6;
    base.lift = Math.sin(Math.PI * Math.min(1, k * 1.08)) * 0.55;
    if (k >= 1) {
      h.toss.rest = h.toss.to;
      result.textContent = h.toss.cara ? 'Salió cara.' : 'Salió ceca.';
      h.tossRest = h.toss.to;
      h.toss = null;
    }
  } else if (h.tossRest !== undefined) {
    base.x = h.tossRest + Math.sin(idle * 0.7) * 0.04;
  }
  h.spin.rotation.set(base.x + tilt.y * 0.18, base.y + tilt.x * 0.3, 0.04);
  h.spin.position.y = base.lift;
}
document.querySelector('[data-toss]').addEventListener('click', () => {
  const h = heroHolder;
  if (!h.ready || h.toss) return;
  const cara = Math.random() < 0.5;
  const from = h.tossRest ?? 0.16;
  // whole flips, then land on the chosen face; facing the camera = cara
  const turns = 5 + Math.floor(Math.random() * 3);
  const to = Math.round(from / (2 * Math.PI)) * 2 * Math.PI + turns * 2 * Math.PI + (cara ? 0.16 : Math.PI + 0.16);
  result.textContent = '';
  h.toss = { start: performance.now(), dur: reduced ? 1 : 1500, from, to, cara };
});

requestAnimationFrame(frame);
