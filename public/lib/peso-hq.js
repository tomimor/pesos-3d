// High-fidelity 1 peso builder: 2x super-sampled faces, multi-scale relief (mesh displacement + per-texel
// normal map), roughness from relief, modelled rim / seam / bevel profile, shared studio environment.
export async function buildPesoHQ(THREE, stage, o = {}) {
  const R = 0.0115, RC = 0.0085, T = 0.0022;
  const RIM_W = 0.00045, RIM_H = 0.00016, RELIEF = o.relief ?? 0.00012, BEV = 0.00022, RF = R - BEV, BASE = T / 2 - RIM_H;
  const UP = o.upscale ?? 2;
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------- environment + renderer ----------
  const renderer = stage._renderer, scene = stage._scene;
  renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = o.exposure ?? 1.2;
  {
    const ew = 2048, eh = 1024, c = mkCanvas(ew, eh), g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, eh);
    bg.addColorStop(0, '#a4a6aa'); bg.addColorStop(0.35, '#77797d'); bg.addColorStop(0.5, '#5d5e61'); bg.addColorStop(0.52, '#86817b'); bg.addColorStop(1, '#6a6660');
    g.fillStyle = bg; g.fillRect(0, 0, ew, eh);
    const box = (x, y, w, h, a, blur = 18) => { g.save(); g.filter = `blur(${blur}px)`; g.fillStyle = `rgba(255,253,248,${a})`; g.fillRect(x, y, w, h); g.restore(); };
    box(180, 180, 520, 300, 1);          // key softbox
    box(1250, 140, 380, 380, 0.75);      // fill softbox
    box(0, 440, ew, 40, 0.55, 10);       // horizon strip (gives the rim a clean highlight line)
    box(860, 60, 260, 120, 0.9);         // top light
    box(1700, 560, 300, 120, 0.35);      // floor kicker
    const et = new THREE.CanvasTexture(c); et.mapping = THREE.EquirectangularReflectionMapping; et.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(et).texture; pm.dispose();
    scene.environmentIntensity = o.envIntensity ?? 1.0;
    scene.traverse(n => { if (n.isHemisphereLight) n.intensity = 0.35; if (n.isDirectionalLight && n.castShadow) n.intensity = 1.6; });
  }

  // ---------- face processing ----------
  async function prepFace(src, bright = 1) {
    const img = await loadImg(src);
    const W = img.naturalWidth * UP, H = img.naturalHeight * UP;
    const c = mkCanvas(W, H), ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high'; ctx.filter = `brightness(${bright}) contrast(${1 + (bright - 1) * 0.4})`;
    ctx.drawImage(img, 0, 0, W, H); ctx.filter = 'none';
    const id = ctx.getImageData(0, 0, W, H), d = id.data;
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) { const k = (y * W + x) * 4, l = (d[k] + d[k + 1] + d[k + 2]) / 3;
      if (d[k + 3] > 128 && l < 235) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rad = Math.min(x1 - x0, y1 - y0) / 2;
    // rim colour → paint everything outside the disc (no white halo in mipmaps)
    let rr = 0, rg = 0, rb = 0, rn = 0;
    for (let k = 0; k < 1440; k++) { const a = k / 1440 * Math.PI * 2, x = Math.round(cx + rad * 0.975 * Math.cos(a)), y = Math.round(cy + rad * 0.975 * Math.sin(a)), i = (y * W + x) * 4; rr += d[i]; rg += d[i + 1]; rb += d[i + 2]; rn++; }
    rr /= rn; rg /= rn; rb /= rn;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dd = Math.hypot(x - cx, y - cy) / rad; if (dd > 0.995) { const i = (y * W + x) * 4, t = ss(0.995, 1.01, dd);
      d[i] += (rr - d[i]) * t; d[i + 1] += (rg - d[i + 1]) * t; d[i + 2] += (rb - d[i + 2]) * t; d[i + 3] = 255; } }
    ctx.putImageData(id, 0, 0);
    // grayscale + blurred pyramids (GPU canvas blur)
    const blurL = (r) => { const b = mkCanvas(W, H), g = b.getContext('2d', { willReadFrequently: true }); g.filter = `grayscale(1)${r ? ` blur(${r}px)` : ''}`; g.drawImage(c, 0, 0);
      const q = g.getImageData(0, 0, W, H).data, out = new Float32Array(W * H); for (let i = 0; i < W * H; i++) out[i] = q[i * 4]; return out; };
    const s = UP, b0 = blurL(0.8 * s), b1 = blurL(1.3 * s), b3 = blurL(3 * s), b12 = blurL(12 * s), b40 = blurL(40 * s);
    // albedo sharpening (unsharp mask against b3-scale detail, colour preserved)
    for (let i = 0, n = W * H; i < n; i++) { const k = i * 4, l = (d[k] + d[k + 1] + d[k + 2]) / 3 || 1, sh = (b0[i] - b3[i]) * 0.4, f = (l + sh) / l;
      d[k] = Math.min(255, d[k] * f); d[k + 1] = Math.min(255, d[k + 1] * f); d[k + 2] = Math.min(255, d[k + 2] * f); }
    ctx.putImageData(id, 0, 0);
    // multi-scale relief: fine lettering + medium form; plateau-shaped so struck tops read flat
    const hm = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      let fine = (b1[i] - b12[i]) / 55; const form = (b12[i] - b40[i]) / 70;
      const af = Math.abs(fine); fine = Math.sign(fine) * Math.max(0, af - 0.12) * (af > 0.12 ? af / (af - 0.06) : 0); // soft-core: suppress photo grain on the fields
      let v = 0.32 + fine * 0.75 + form * 0.35;
      v = Math.max(0, Math.min(1, v)); v = v * 0.55 + ss(0.3, 0.72, v) * 0.45;
      hm[i] = v;
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.name = src.split('/').pop();
    return { W, H, cx, cy, rad, hm, tex, canvas: c };
  }

  // profile & relief at a face position (metres)
  const profileZ = r => {
    const rim = RIM_H * ss(R - RIM_W - 0.00014, R - RIM_W + 0.00004, r);
    const seam = -0.000022 * Math.exp(-(((r - RC) / 0.00004) ** 2));
    const reliefMask = (1 - ss(R - RIM_W - 0.00016, R - RIM_W - 0.00002, r)) * Math.min(1, Math.abs(r - RC) / 0.00016);
    return { base: BASE + rim + seam, mask: reliefMask };
  };
  function sampler(f, arr) { return (px, py) => {
    const x = Math.max(0, Math.min(f.W - 2, px)), y = Math.max(0, Math.min(f.H - 2, py)), x0 = x | 0, y0 = y | 0, tx = x - x0, ty = y - y0, i = y0 * f.W + x0;
    return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - ty) + (arr[i + f.W] * (1 - tx) + arr[i + f.W + 1] * tx) * ty; }; }
  function boxBlur(f, src, r) { // separable box blur x2 ≈ gaussian
    const W = f.W, H = f.H, a = new Float32Array(src), b = new Float32Array(W * H);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) { let acc = 0; const o = y * W; for (let x = -r; x <= r; x++) acc += a[o + Math.max(0, Math.min(W - 1, x))];
        for (let x = 0; x < W; x++) { b[o + x] = acc / (2 * r + 1); acc += a[o + Math.min(W - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
      for (let x = 0; x < W; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += b[Math.max(0, Math.min(H - 1, y)) * W + x];
        for (let y = 0; y < H; y++) { a[y * W + x] = acc / (2 * r + 1); acc += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x]; } }
    }
    return a;
  }

  // per-texel maps: normal (high-frequency relief only — mesh carries the low band) + roughness
  function detailMaps(f, back) {
    const W = f.W, H = f.H, N = W * H, mpp = R / f.rad; // metres per texel
    const full = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, r = Math.hypot(x - f.cx, y - f.cy) * mpp; const p = profileZ(r); full[i] = p.base + f.hm[i] * RELIEF * p.mask; }
    const low = boxBlur(f, full, 2 * UP);
    f.low = low;
    const nrm = new Uint8ClampedArray(N * 4), rough = new Uint8ClampedArray(N * 4), ao = boxBlur(f, full, 10 * UP);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, xl = Math.max(0, x - 1), xr = Math.min(W - 1, x + 1), yu = Math.max(0, y - 1), yd = Math.min(H - 1, y + 1);
      const hi = j => full[j] - low[j];
      let dx = (hi(y * W + xr) - hi(y * W + xl)) / (2 * mpp), dy = (hi(yd * W + x) - hi(yu * W + x)) / (2 * mpp);
      if (back) dx = -dx; // back face UVs are mirrored in x
      const l = Math.hypot(dx, dy, 1), k = i * 4;
      nrm[k] = (-dx / l * 0.5 + 0.5) * 255; nrm[k + 1] = (dy / l * 0.5 + 0.5) * 255; nrm[k + 2] = (1 / l * 0.5 + 0.5) * 255; nrm[k + 3] = 255;
      const cav = Math.max(0, ao[i] - full[i]) / RELIEF, peak = Math.max(0, full[i] - ao[i]) / RELIEF;
      const rv = Math.max(0.16, Math.min(0.8, 0.36 + cav * 0.9 - peak * 0.55));
      rough[k] = rough[k + 1] = rough[k + 2] = rv * 255; rough[k + 3] = 255;
    }
    const tex = (data, name) => { const c = mkCanvas(W, H); c.getContext('2d').putImageData(new ImageData(data, W, H), 0, 0);
      const t = new THREE.CanvasTexture(c); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.name = name; return t; };
    return { normalMap: tex(nrm, (back ? 'reverse' : 'obverse') + '_normal'), roughnessMap: tex(rough, (back ? 'reverse' : 'obverse') + '_roughness') };
  }

  function faceGeo(f, back, NR, NS) {
    const sLow = sampler(f, f.low), z = back ? -1 : 1, row = NS + 1, nv = (NR + 1) * row;
    const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    for (let i = 0; i <= NR; i++) {
      const t = i / NR, r = RF * (1 - (1 - t) ** 1.35 * 0 - 0) * t; // uniform in r
      for (let j = 0; j <= NS; j++) {
        const a = j / NS * Math.PI * 2, x = r * Math.cos(a), y = r * Math.sin(a), v = i * row + j;
        const px = f.cx + (back ? -x : x) / R * f.rad, py = f.cy - y / R * f.rad;
        const zz = r > R - RIM_W + 0.00004 ? profileZ(r).base : sLow(px, py);
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z * zz; uv[v * 2] = px / f.W; uv[v * 2 + 1] = 1 - py / f.H;
      }
    }
    const idx = new Uint32Array(NR * NS * 6); let q = 0;
    for (let i = 0; i < NR; i++) for (let j = 0; j < NS; j++) { const a = i * row + j, b = a + row, c = a + 1, d = b + 1;
      if (back) { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = c; idx[q++] = d; idx[q++] = b; } else { idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = c; idx[q++] = b; idx[q++] = d; } }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals(); return g;
  }

  const [obv, rev] = await Promise.all([prepFace(o.obverse ?? '../fotos/1-peso-anverso.jpg', 1), prepFace(o.reverse ?? '../fotos/1-peso-reverso.jpg', 1.2)]);
  const mo = detailMaps(obv, false), mr = detailMaps(rev, true);
  const faceMat = (name, f, m) => new THREE.MeshStandardMaterial({ name, map: f.tex, normalMap: m.normalMap, normalScale: new THREE.Vector2(1, 1), roughnessMap: m.roughnessMap,
    roughness: 1, metalness: o.metalness ?? 0.6, color: new THREE.Color(o.faceTint ?? 0xffffff), envMapIntensity: 1 });

  const coin = new THREE.Group(); coin.name = 'argentina_1_peso';
  const add = (name, geo, m) => { const mesh = new THREE.Mesh(geo, m); mesh.name = name; mesh.castShadow = mesh.receiveShadow = true; coin.add(mesh); };
  const NR = o.rings ?? 380, NS = o.segments ?? 1600;
  add('obverse', faceGeo(obv, false, NR, NS), faceMat('obverse_bimetal', obv, mo));
  add('reverse', faceGeo(rev, true, NR, NS), faceMat('reverse_bimetal', rev, mr));

  // edge: rounded shoulders + procedural cupronickel (colour sampled from both rims)
  const ringTone = f => { const g = f.canvas.getContext('2d'), dd = g.getImageData(0, 0, f.W, f.H).data; let r = 0, gg = 0, b = 0, n = 0;
    for (let k = 0; k < 720; k++) { const a = k / 720 * Math.PI * 2, rr = f.rad * (0.955 + (k % 5) * 0.006), x = Math.round(f.cx + rr * Math.cos(a)), y = Math.round(f.cy + rr * Math.sin(a)), i = (y * f.W + x) * 4; r += dd[i]; gg += dd[i + 1]; b += dd[i + 2]; n++; }
    return [r / n, gg / n, b / n]; };
  const tone = ringTone(obv).map((v, i) => (v + ringTone(rev)[i]) / 2);
  const { makePesoEdge } = await import('./peso-edge.js');
  const edgeMat = makePesoEdge(THREE, { tone, tarnishAmt: 0.45, grimeAmt: 0.45 });
  edgeMat.envMapIntensity = 1; edgeMat.metalness = o.metalness ?? 0.6;
  const prof = [];
  prof.push(new THREE.Vector2(RF - 0.00002, -T / 2));
  for (let i = 0; i <= 14; i++) { const a = -Math.PI / 2 + i / 14 * Math.PI / 2; prof.push(new THREE.Vector2(R - BEV + BEV * Math.cos(a), -T / 2 + BEV + BEV * Math.sin(a))); }
  for (let i = 1; i < 10; i++) prof.push(new THREE.Vector2(R + 0.000004 * Math.sin(Math.PI * i / 10), -T / 2 + BEV + (T - 2 * BEV) * i / 10)); // faint barrel
  for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI / 2; prof.push(new THREE.Vector2(R - BEV + BEV * Math.cos(a), T / 2 - BEV + BEV * Math.sin(a))); }
  prof.push(new THREE.Vector2(RF - 0.00002, T / 2));
  const edge = new THREE.LatheGeometry(prof, 2400); edge.rotateX(Math.PI / 2);
  { const p = edge.attributes.position, uv = edge.attributes.uv; for (let i = 0; i < p.count; i++) uv.setY(i, Math.min(1, Math.max(0, (p.getZ(i) + T / 2) / T))); uv.needsUpdate = true; }
  add('edge', edge, edgeMat);
  coin.position.y = R;
  return coin;
}
