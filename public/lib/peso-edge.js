// Procedural cupronickel edge for the 1 peso coin: colour, roughness and normal maps + a studio reflection env.
export function makePesoEdge(THREE, { tone, renderer, seed = 7, W = 8192, H = 256, tarnishAmt = 1, grimeAmt = 1 } = {}) {
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // wrap-around value noise (periodic in x so the band closes seamlessly)
  function noise(cells, rowsN, oct = 4) {
    const layers = [];
    for (let o = 0; o < oct; o++) { const cx = cells << o, cy = Math.max(2, rowsN << o), g = new Float32Array(cx * (cy + 1)); for (let i = 0; i < g.length; i++) g[i] = rnd(); layers.push({ cx, cy, g }); }
    return (x, y) => { let v = 0, a = 1, n = 0;
      for (const { cx, cy, g } of layers) { const fx = x / W * cx, fy = y / H * cy, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), X0 = x0 % cx, X1 = (x0 + 1) % cx, Y0 = Math.min(cy, y0), Y1 = Math.min(cy, y0 + 1);
        const p = g[Y0 * cx + X0] * (1 - sx) + g[Y0 * cx + X1] * sx, q = g[Y1 * cx + X0] * (1 - sx) + g[Y1 * cx + X1] * sx;
        v += (p * (1 - sy) + q * sy) * a; n += a; a *= 0.5; }
      return v / n; };
  }
  const N = W * H, h = new Float32Array(N), grime = new Float32Array(N), polish = new Float32Array(N);
  const tarn = noise(24, 1, 5), mottle = noise(160, 3, 3), streak = noise(40, 64, 2);

  // 1. die / lathe striations: long horizontal streaks of varying length and depth
  for (let y = 0; y < H; y++) { const base = (rnd() - 0.5) * 0.22; for (let x = 0; x < W; x++) h[y * W + x] = base * (0.4 + streak(x, y)); }
  for (let i = 0; i < 1400; i++) { const y = Math.floor(rnd() * H), x0 = rnd() * W, L = 150 + rnd() * 2500, d = (rnd() - 0.55) * 0.7;
    for (let x = 0; x < L; x++) { const xi = Math.floor(x0 + x) % W, e = Math.sin(Math.PI * x / L); h[y * W + xi] += d * e; } }
  // 1b. collar marks: faint striations across the thickness left by the minting collar
  for (let i = 0; i < 900; i++) { const x0 = rnd() * W, d = (rnd() - 0.5) * 0.4, wob = rnd() * 3, y0 = rnd() * H * 0.3, y1 = H - rnd() * H * 0.3;
    for (let y = Math.floor(y0); y < y1; y++) { const x = Math.floor(x0 + Math.sin(y / 40 + wob) * 1.5) % W, e = Math.sin(Math.PI * (y - y0) / (y1 - y0)); h[y * W + x] += d * e; h[y * W + (x + 1) % W] += d * 0.5 * e; } }
  // 2. micro pitting
  for (let i = 0; i < N; i++) h[i] += (rnd() - 0.5) * 0.35;
  // 3. scratches (mostly along the circumference, some oblique), groove + raised burr
  const scratch = (x0, y0, L, ang, dep, wid, g0 = rnd() < 0.55 ? 0.28 : -0.5) => { const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let t = 0; t < L; t += 0.5) { const e = Math.sin(Math.PI * t / L) ** 0.5, x = x0 + ca * t, y = y0 + sa * t;
      for (let o = -wid - 1; o <= wid + 1; o++) { const yy = Math.round(y + o * ca), xx = ((Math.round(x - o * sa) % W) + W) % W; if (yy < 0 || yy >= H) continue;
        const k = yy * W + xx, ao = Math.abs(o);
        if (ao <= wid) { h[k] -= dep * e * (1 - ao / (wid + 1)); if (dep > 0) grime[k] = Math.max(grime[k], g0 * e); else polish[k] = Math.max(polish[k], -g0 * e); } else if (o > 0) h[k] += dep * 0.35 * e; } } };
  for (let i = 0; i < 1800; i++) scratch(rnd() * W, rnd() * H, 8 + rnd() * 160, (rnd() - 0.5) * 0.12, 0.5 + rnd() * 1.5, rnd() < 0.85 ? 0 : 1);
  for (let i = 0; i < 260; i++) scratch(rnd() * W, rnd() * H, 6 + rnd() * 40, (rnd() - 0.5) * 2.4, 1 + rnd() * 2, rnd() < 0.6 ? 0 : 1);
  // 4. dents and dings (bag marks) with rolled lips; bigger chips cluster at the shoulders
  const dent = (cx, cy, r, dep, ex = 1.6 + rnd() * 2.2, gr = 0.25 + rnd() * 0.35) => { const R2 = r * 1.6 * ex;
    for (let y = Math.max(0, Math.floor(cy - R2)); y < Math.min(H, Math.ceil(cy + R2)); y++) for (let x = Math.floor(cx - R2 * 1.6); x < cx + R2 * 1.6; x++) {
      const dx = (x - cx) / ex, dy = (y - cy), d = Math.hypot(dx, dy) / r, k = y * W + ((x % W) + W) % W;
      if (d < 1) { h[k] -= dep * (1 - d * d); grime[k] = Math.max(grime[k], gr * (1 - d)); } else if (d < 1.6) h[k] += dep * 0.25 * Math.sin(Math.PI * (d - 1) / 0.6); } };
  // irregular nicks: clusters of 2-3 overlapping shallow elongated dents
  const nick = (x, y, r, dep) => { const n = 1 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) dent(x + (rnd() - 0.5) * r * 3, y + (rnd() - 0.5) * r, r * (0.5 + rnd() * 0.6), dep * (0.5 + rnd() * 0.5)); };
  for (let i = 0; i < 220; i++) nick(rnd() * W, rnd() * H, 0.8 + rnd() * 2.2, 0.6 + rnd() * 1.2);
  for (let i = 0; i < 22; i++) nick(rnd() * W, rnd() * H, 3 + rnd() * 4, 1 + rnd() * 1.5);
  for (let i = 0; i < 45; i++) { const top = rnd() < 0.5; nick(rnd() * W, top ? rnd() * 14 : H - rnd() * 14, 2.5 + rnd() * 5, 1.5 + rnd() * 2); }

  // soften the height field (separable [1 2 1] x2, wraps in x) so nothing aliases into stair-steps
  { const tmp = new Float32Array(N);
    for (let p = 0; p < 2; p++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; tmp[i] = (h[y * W + (x - 1 + W) % W] + 2 * h[i] + h[y * W + (x + 1) % W]) / 4; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; h[i] = (tmp[Math.max(0, y - 1) * W + x] + 2 * tmp[i] + tmp[Math.min(H - 1, y + 1) * W + x]) / 4; }
    } }
  // colour / roughness
  const lt = (tone[0] + tone[1] + tone[2]) / 3, lift = 170 / lt, cool = [0.975, 1, 0.995], base = tone.map((v, i) => Math.min(235, v * lift * cool[i]));
  const col = new Uint8ClampedArray(N * 4), rough = new Uint8ClampedArray(N * 4);
  for (let y = 0; y < H; y++) {
    const yn = y / (H - 1), shoulder = Math.max(0, 1 - Math.min(yn, 1 - yn) / 0.1); // grime packs into the shoulders
    for (let x = 0; x < W; x++) {
      const i = y * W + x, t = tarn(x, y), m = mottle(x, y);
      // handling polish: middle of the band + random worn stretches
      const pol = Math.max(0, (t - 0.55) * 2.2) * (1 - shoulder) + polish[i];
      const tarnish = (Math.max(0, (0.56 - t) * 2.6) * 0.9 + Math.max(0, (0.42 - m) * 1.2) * 0.35) * tarnishAmt + (shoulder * 0.55 + grime[i] * 0.9) * grimeAmt;
      const L = 1 + (m - 0.5) * 0.26 + pol * 0.2 - tarnish * 0.42 + h[i] * 0.018;
      const warm = tarnish * 0.07;                               // patina shifts warmer / yellower
      const k = i * 4;
      col[k] = base[0] * L * (1 + warm * 0.6); col[k + 1] = base[1] * L * (1 + warm * 0.25); col[k + 2] = base[2] * L * (1 - warm * 0.5); col[k + 3] = 255;
      const r = Math.max(0.22, Math.min(0.9, 0.46 + tarnish * 0.3 - pol * 0.18 + (m - 0.5) * 0.1 + grime[i] * 0.2));
      rough[k] = rough[k + 1] = rough[k + 2] = r * 255; rough[k + 3] = 255;
    }
  }
  // normals from height (Sobel, wraps in x)
  const nrm = new Uint8ClampedArray(N * 4), S = 0.4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xl = (x - 1 + W) % W, xr = (x + 1) % W, yu = Math.max(0, y - 1), yd = Math.min(H - 1, y + 1);
    const dx = (h[y * W + xr] - h[y * W + xl]) * S, dy = (h[yd * W + x] - h[yu * W + x]) * S, l = Math.hypot(dx, dy, 1), k = (y * W + x) * 4;
    nrm[k] = (-dx / l * 0.5 + 0.5) * 255; nrm[k + 1] = (dy / l * 0.5 + 0.5) * 255; nrm[k + 2] = (1 / l * 0.5 + 0.5) * 255; nrm[k + 3] = 255;
  }
  const tex = (data, name, srgb) => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(new ImageData(data, W, H), 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 16; t.name = name; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const map = tex(col, 'edge_color', true), roughnessMap = tex(rough, 'edge_roughness'), normalMap = tex(nrm, 'edge_normal');

  // studio reflection environment (soft boxes) so the metal reads as metal
  let envMap = null;
  if (renderer) {
    const ew = 1024, eh = 512, c = document.createElement('canvas'); c.width = ew; c.height = eh; const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, eh); bg.addColorStop(0, '#6d6f73'); bg.addColorStop(0.5, '#3a3b3e'); bg.addColorStop(0.55, '#2a2a2c'); bg.addColorStop(1, '#18181a');
    g.fillStyle = bg; g.fillRect(0, 0, ew, eh);
    const box = (x, y, w, hh, a) => { const gr = g.createLinearGradient(0, y, 0, y + hh); gr.addColorStop(0, `rgba(255,255,252,${a * 0.6})`); gr.addColorStop(0.5, `rgba(255,255,252,${a})`); gr.addColorStop(1, `rgba(255,255,252,${a * 0.6})`); g.fillStyle = gr; g.fillRect(x, y, w, hh); };
    box(80, 120, 260, 150, 1); box(600, 90, 220, 190, 0.8); box(0, 215, ew, 26, 0.55); box(420, 300, 120, 60, 0.35);
    const et = new THREE.CanvasTexture(c); et.mapping = THREE.EquirectangularReflectionMapping; et.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(renderer); envMap = pm.fromEquirectangular(et).texture; pm.dispose();
  }
  const material = new THREE.MeshStandardMaterial({ name: 'cupronickel_edge', map, roughnessMap, normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
    color: 0xffffff, metalness: 0.72, roughness: 1, envMap, envMapIntensity: 0.75 });
  return material;
}
