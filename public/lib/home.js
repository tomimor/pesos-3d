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
  const long = p.numeral.length > 3;
  return `<section class="pieza" id="${p.slug}" data-slug="${p.slug}" style="--glow:${p.glow}" aria-labelledby="h-${p.slug}">
  <div class="pin">
    <div class="rosette" data-seed="${p.slug}"></div>
    <div class="copy">
      <h2 id="h-${p.slug}"><span class="numeral${long ? ' long' : ''}">${esc(p.numeral)}</span><span class="unit">${esc(p.unit)}</span></h2>
      <p class="title">${esc(p.title)}</p>
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

const sections = [...document.querySelectorAll('[data-slug]')].map((el) => ({
  el,
  pin: el.querySelector('.pin'),
  slug: el.dataset.slug,
  hero: el.hasAttribute('data-hero'),
  mesa: el.hasAttribute('data-mesa'),
  piece: piezas.find((p) => p.slug === el.dataset.slug),
}));
const threadLinks = [...document.querySelectorAll('.hilo a')];

// ---------------------------------------------------------------- scene

const canvas = document.querySelector('.vitrina');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
    h.ready = true;
    h.isBill = isBill;
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

function makeTable(section) {
  const outer = new THREE.Group(), spin = new THREE.Group(), deck = new THREE.Group();
  outer.add(spin);
  spin.add(deck);
  outer.visible = false;
  scene.add(outer);
  const h = { outer, spin, ready: false, appear: 0, section, isTable: true };
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
    });
    deck.add(ruler());
    const sphere = new THREE.Box3().setFromObject(deck).getBoundingSphere(new THREE.Sphere());
    deck.position.sub(sphere.center);
    deck.scale.setScalar(1);
    h.radius = sphere.radius;
    h.ready = true;
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

function frame(time) {
  const t = time / 1000;
  flutter.value = t;
  if (!reduced) tilt.lerp(pointer, 0.05);
  key.position.set(-3 + tilt.x * 6, 4 - tilt.y * 5, 5);

  let mixInk = new THREE.Color(0, 0, 0), mixGlow = new THREE.Color(0, 0, 0), wsum = 0, active = -1, best = 1e9;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i], h = holders[i];
    const r = s.el.getBoundingClientRect();
    const pinTop = s.pin.getBoundingClientRect().top; // 0 while pinned, ±vh while entering/leaving
    const enter = 1 - Math.min(1, Math.max(0, pinTop / vh)); // 0 → 1 as it slides in
    const dwell = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh))); // 0 → 1 while pinned
    const visible = pinTop < vh && pinTop > -vh;

    if (!s.hero) {
      s.el.style.setProperty('--e', ss(0.15, 0.85, enter).toFixed(3));
      s.el.style.setProperty('--draw', ss(0, 1, enter * 0.7 + dwell * 0.6).toFixed(3));
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
      h.outer.scale.setScalar((size * 1.18 * (0.86 + 0.14 * ss(0, 1, enter))) / h.radius);
      h.spin.rotation.set(1.25 - 0.55 * ss(0.1, 0.9, dwell) + tilt.y * 0.08, -0.25 + 0.5 * ss(0, 1, dwell) + tilt.x * 0.12, 0);
      continue;
    }
    if (s.hero) {
      heroPose(h, idle);
    } else if (h.isBill) {
      // a note turned side to side to show its back, swaying as if held
      h.spin.rotation.set(
        Math.sin(idle * 0.5) * 0.05 - (1 - enter) * 0.5 + tilt.y * 0.14,
        -0.35 + Math.PI * ss(0.3, 0.8, dwell) + (1 - enter) * -0.6 + Math.sin(idle * 0.37) * 0.06 + tilt.x * 0.2,
        -0.12 + Math.sin(idle * 0.31) * 0.035,
      );
    } else {
      // coins and tokens: obverse first, reverse as you keep scrolling
      h.spin.rotation.set(
        0.18 + Math.sin(idle * 0.6) * 0.05 + tilt.y * 0.18,
        -0.55 + Math.PI * ss(0.3, 0.8, dwell) + (1 - enter) * -1.4 + Math.sin(idle * 0.45) * 0.12 + tilt.x * 0.3,
        0.05,
      );
    }
  }

  // re-ink the page
  if (wsum > 0) { mixInk.multiplyScalar(1 / wsum); mixGlow.multiplyScalar(1 / wsum); } else { mixInk.copy(restInk); mixGlow.copy(restGlow); }
  const ink = '#' + mixInk.getHexString();
  if (ink !== lastInk) {
    lastInk = ink;
    root.style.setProperty('--ink', ink);
    root.style.setProperty('--glow', '#' + mixGlow.getHexString());
  }
  rim.color.copy(mixGlow);

  threadLinks.forEach((a, i) => a.setAttribute('aria-current', String(active - 1 === i)));
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
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
