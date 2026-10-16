// Shared coin builder: photo-mapped relief faces, profiled edge (plain / reeded / photo-textured), optional grooves.
export async function buildCoin(THREE, cfg) {
  const R = cfg.D / 2000, T = cfg.T / 1000;
  const RIM_W = (cfg.rimW ?? 0.45) / 1000, RIM_H = (cfg.rimH ?? 0.16) / 1000, RELIEF = (cfg.relief ?? 0.13) / 1000;
  const BEV = (cfg.bevel ?? 0.2) / 1000, BASE = T / 2 - RIM_H, RF = R - BEV;
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  async function prepFace(src, bright = 1) {
    const img = await loadImg(src);
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.filter = `brightness(${bright})`; ctx.drawImage(img, 0, 0); ctx.filter = 'none';
    const d = new Uint8ClampedArray(ctx.getImageData(0, 0, W, H).data);
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const k = (y * W + x) * 4, l = (d[k] + d[k + 1] + d[k + 2]) / 3;
      if (l < 238) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rad = Math.max(x1 - x0, y1 - y0) / 2;
    // paint the white background inside the disc footprint (groove notches) with the rim colour
    { let r = 0, g = 0, b = 0, n = 0;
      for (let k = 0; k < 720; k++) { const a = k / 720 * Math.PI * 2, x = Math.round(cx + rad * 0.93 * Math.cos(a)), y = Math.round(cy + rad * 0.93 * Math.sin(a)), i = (y * W + x) * 4;
        if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 235) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } }
      const id = ctx.getImageData(0, 0, W, H), q = id.data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
        if ((q[i] + q[i + 1] + q[i + 2]) / 3 > 238 && Math.hypot(x - cx, y - cy) < rad * 1.02) { q[i] = r / n; q[i + 1] = g / n; q[i + 2] = b / n; } }
      ctx.putImageData(id, 0, 0); for (let i = 0; i < q.length; i++) d[i] = q[i]; }
    const blur = r => { const b = document.createElement('canvas'); b.width = W; b.height = H; const g = b.getContext('2d', { willReadFrequently: true }); g.filter = `grayscale(1) blur(${r}px)`; g.drawImage(c, 0, 0); return g.getImageData(0, 0, W, H).data; };
    const s = rad / 530, fine = blur(1.2 * s), coarse = blur(cfg.coarse ?? 14 * s);
    const hm = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) hm[i] = Math.max(0, Math.min(1, (fine[i * 4] - coarse[i * 4]) / 60 + 0.15));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.name = src.split('/').pop();
    return { W, H, cx, cy, rad, hm, tex, d };
  }

  // height of a face point (x,y in metres, y up) incl. rim + optional grooves (y measured on the photo: down = +)
  function faceZ(f, x, y, back, grooves) {
    const r = Math.hypot(x, y);
    const px = f.cx + (back ? -x : x) / R * f.rad, py = f.cy - y / R * f.rad;
    let h;
    if (r > R - RIM_W) h = RIM_H;
    else {
      const hx = Math.min(f.W - 1, Math.max(0, Math.round(px))), hy = Math.min(f.H - 1, Math.max(0, Math.round(py)));
      h = f.hm[hy * f.W + hx] * RELIEF;
      if (RIM_H > 0) h *= Math.min(1, (R - RIM_W - r) / 0.0002);
    }
    if (grooves) { const yn = -y / R; for (const g of grooves) h += grooveH(yn, g); }
    return { z: BASE + h, u: px / f.W, v: 1 - py / f.H };
  }
  // groove profile: vertical wall at g.wall, flat floor, then ramp back up to the surface
  function grooveH(yn, g) {
    const t = yn - g.wall; if (t < 0 || t > g.floor + g.ramp) return 0;
    const dep = g.depth / 1000;
    if (t < 0.006) return -dep * t / 0.006;
    if (t < g.floor) return -dep;
    const k = (t - g.floor) / g.ramp; return -dep * (1 - k * k * (3 - 2 * k));
  }

  function faceGeo(f, back, grooves, nr, ns) {
    const pos = [], uv = [], idx = [], z = back ? -1 : 1;
    for (let i = 0; i <= nr; i++) {
      const r = RF * i / nr;
      for (let j = 0; j <= ns; j++) {
        const a = j / ns * Math.PI * 2, x = r * Math.cos(a), y = r * Math.sin(a);
        const p = faceZ(f, x, y, back, grooves);
        pos.push(x, y, z * p.z); uv.push(p.u, p.v);
      }
    }
    const row = ns + 1;
    for (let i = 0; i < nr; i++) for (let j = 0; j < ns; j++) {
      const a = i * row + j, b = a + row, c = a + 1, d = b + 1;
      if (back) idx.push(a, c, b, c, d, b); else idx.push(a, b, c, c, b, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }

  function edgeGeo(obv, rev, ns, reeds, repeat) {
    const prof = []; // [inset, t]
    const bt = BEV / T;
    for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; prof.push([BEV * (1 - Math.sin(a)), bt * (1 - Math.cos(a))]); }
    for (let i = 1; i < 12; i++) prof.push([0, bt + (1 - 2 * bt) * i / 12]);
    for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; prof.push([BEV * (1 - Math.cos(a)), 1 - bt + bt * Math.sin(a)]); }
    const pos = [], uv = [], idx = [], row = prof.length;
    for (let j = 0; j <= ns; j++) {
      const a = j / ns * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const zt = faceZ(obv.f, RF * ca, RF * sa, false, obv.grooves).z, zb = -faceZ(rev.f, RF * ca, RF * sa, true, rev.grooves).z;
      let rd = 0;
      if (reeds) { const s = Math.abs(Math.sin(a * reeds.count / 2)), k = Math.max(0, Math.min(1, (s - 0.12) / 0.5)); rd = reeds.depth / 1000 * (1 - k * k * (3 - 2 * k)); }
      for (let k = 0; k < row; k++) {
        const [ins, t] = prof[k], edgeW = Math.min(1, Math.min(t, 1 - t) / bt);
        const r = R - ins - rd * edgeW;
        // pin first/last row to the face outline (follows rim and grooves); clamp the rest between them
        let z = -T / 2 + t * T;
        if (k === 0) z = zb; else if (k === row - 1) z = zt; else z = Math.max(Math.min(z, zt - 1e-6), zb + 1e-6);
        pos.push(r * ca, r * sa, z); uv.push(j / ns * repeat, t);
      }
    }
    for (let j = 0; j < ns; j++) for (let k = 0; k < row - 1; k++) {
      const a = j * row + k, b = a + row, c = a + 1, d = b + 1; idx.push(a, b, c, c, b, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }

  function ringTone(f) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let k = 0; k < 720; k++) {
      const a = k / 720 * Math.PI * 2, rr = f.rad * 0.965;
      const x = Math.round(f.cx + rr * Math.cos(a)), y = Math.round(f.cy + rr * Math.sin(a)), i = (y * f.W + x) * 4;
      const l = (f.d[i] + f.d[i + 1] + f.d[i + 2]) / 3; if (l > 235) continue;
      r += f.d[i]; g += f.d[i + 1]; b += f.d[i + 2]; n++;
    }
    return [r / n, g / n, b / n];
  }

  // unwrap the outer band of a face photo into a strip indexed by coin angle (same patina/wear as the face)
  function ringStrip(f, back, W, H, r0, r1, rot = 0) {
    const out = new Uint8ClampedArray(W * H * 4);
    for (let x = 0; x < W; x++) {
      const a = x / W * Math.PI * 2 + rot, ca = Math.cos(a), sa = Math.sin(a);
      for (let y = 0; y < H; y++) {
        const rr = f.rad * (r0 + (r1 - r0) * y / (H - 1));
        const px = f.cx + (back ? -ca : ca) * rr, py = f.cy - sa * rr;
        const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0, i = (y0 * f.W + x0) * 4, o = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) out[o + c] = (f.d[i + c] * (1 - fx) + f.d[i + 4 + c] * fx) * (1 - fy) + (f.d[i + f.W * 4 + c] * (1 - fx) + f.d[i + f.W * 4 + 4 + c] * fx) * fy;
        out[o + 3] = 255;
      }
    }
    return out;
  }
  function detail(g, W, H, n, alpha) {
    for (let y = 0; y < H; y++) { const k = (Math.random() - 0.5) * 26 * alpha; g.fillStyle = k > 0 ? `rgba(255,255,255,${k / 255})` : `rgba(30,25,15,${-k / 255})`; g.fillRect(0, y, W, 1); }
    for (let i = 0; i < n; i++) { const x = Math.random() * W, y = Math.random() * H, l = 3 + Math.random() * 60;
      g.strokeStyle = Math.random() < 0.45 ? `rgba(255,250,235,${0.16 * alpha})` : `rgba(35,28,14,${0.26 * alpha})`; g.lineWidth = 0.5 + Math.random() * 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (Math.random() - 0.5) * 5); g.stroke(); }
    for (let i = 0; i < n / 10; i++) { const x = Math.random() * W, y = Math.random() * H, r = 0.8 + Math.random() * 2.2;
      g.fillStyle = `rgba(35,26,12,${0.4 * alpha})`; g.beginPath(); g.ellipse(x, y, r * 1.5, r, 0, 0, 7); g.fill();
      g.fillStyle = `rgba(255,248,230,${0.22 * alpha})`; g.beginPath(); g.ellipse(x + 0.8, y - r * 0.7, r, r * 0.4, 0, 0, 7); g.fill(); }
    const v = g.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(45,35,18,0.45)'); v.addColorStop(0.16, 'rgba(45,35,18,0)'); v.addColorStop(0.84, 'rgba(45,35,18,0)'); v.addColorStop(1, 'rgba(45,35,18,0.45)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
  async function edgeTexture(tone) {
    let c;
    const mode = cfg.edge?.mode;
    if (mode === 'faceRing') {
      // wraps the faces' own outer band around the side: top half from the obverse rim, bottom half from the reverse rim
      const W = 4096, H = Math.round(W * T / (2 * Math.PI * R)) * 2;
      c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      const src = cfg.edge.source === 'reverse' ? [fr, true] : [fo, false];
      const top = ringStrip(...src, W, H, 0.9, 0.975, 0.0), bot = ringStrip(fr, true, W, H, 0.975, 0.9, 2.1);
      const id = g.createImageData(W, H);
      for (let y = 0; y < H; y++) { const w = Math.max(0, Math.min(1, (y / H - 0.35) / 0.3));
        for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; for (let k = 0; k < 3; k++) id.data[o + k] = top[o + k] * (1 - w) + bot[o + k] * w; id.data[o + 3] = 255; } }
      g.putImageData(id, 0, 0);
      detail(g, W, H, 3000, 0.8);
    } else if (mode === 'reeded') {
      // high-res reeding: grime packed in the valleys, crests polished by handling, per-reed variation
      const n = cfg.reeds.count, W = n * 32, H = 256;
      c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      const ring = ringStrip(fr, true, W, H, 0.975, 0.93, 0);
      const id = g.createImageData(W, H), d = id.data, [tr, tg, tb] = tone;
      const reedVar = Array.from({ length: n }, () => (Math.random() - 0.5) * 22);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = (x / W * n) % 1, ri = Math.floor(x / W * n), sv = Math.abs(Math.sin(p * Math.PI));
        const valley = 1 - Math.min(1, sv / 0.35), crest = Math.pow(sv, 6);
        const o = (y * W + x) * 4, lum = (ring[o] + ring[o + 1] + ring[o + 2]) / 3, lt = (tr + tg + tb) / 3;
        const k = 0.55 + 0.45 * lum / lt;
        const shade = k * (1 - 0.55 * valley) + 0.28 * crest + reedVar[ri] / 255;
        d[o] = tr * shade + 6 * crest; d[o + 1] = tg * shade + 4 * crest; d[o + 2] = tb * shade; d[o + 3] = 255;
      }
      g.putImageData(id, 0, 0);
      detail(g, W, H, 5000, 0.7);
      for (let i = 0; i < 70; i++) { const x = Math.random() * W, w = 40 + Math.random() * 300;
        const grd = g.createLinearGradient(x - w, 0, x + w, 0); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.5, `rgba(${cfg.edge.patina ?? '70,55,35'},${0.12 + Math.random() * 0.2})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.fillRect(x - w, 0, w * 2, H); }
    } else if (cfg.edge?.src) {
      const img = await loadImg(cfg.edge.src), [x, y, w, h] = cfg.edge.crop;
      c = document.createElement('canvas'); c.width = w * 2; c.height = h;
      const g = c.getContext('2d'); g.drawImage(img, x, y, w, h, 0, 0, w, h);
      g.save(); g.translate(w * 2, 0); g.scale(-1, 1); g.drawImage(img, x, y, w, h, 0, 0, w, h); g.restore(); // seamless mirror tile
      if (cfg.edge.bright) { g.globalCompositeOperation = 'source-over'; g.filter = `brightness(${cfg.edge.bright})`; g.drawImage(c, 0, 0); g.filter = 'none'; }
    } else {
      const W = 4096, H = 256; c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'), [r, gr, b] = tone;
      g.fillStyle = `rgb(${r},${gr},${b})`; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 60; i++) { const x = Math.random() * W, w = 80 + Math.random() * 400, k = (Math.random() - 0.62) * 80;
        const grd = g.createLinearGradient(x - w, 0, x + w, 0); const col = k > 0 ? `rgba(255,245,215,${k / 255})` : `rgba(60,45,20,${-k / 255})`;
        grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.5, col); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - w, 0, w * 2, H); }
      for (let y = 0; y < H; y++) { const k = (Math.random() - 0.5) * 34; g.fillStyle = k > 0 ? `rgba(255,255,255,${k / 255})` : `rgba(30,25,15,${-k / 255})`; g.fillRect(0, y, W, 1); }
      for (let i = 0; i < 2200; i++) { const x = Math.random() * W, y = Math.random() * H, l = 4 + Math.random() * 90;
        g.strokeStyle = Math.random() < 0.45 ? 'rgba(255,250,235,0.2)' : 'rgba(40,30,15,0.3)'; g.lineWidth = 0.6 + Math.random();
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (Math.random() - 0.5) * 8); g.stroke(); }
      for (let i = 0; i < 50; i++) { const x = Math.random() * W, y = Math.random() * H, s = 30 + Math.random() * 160;
        const rg = g.createRadialGradient(x, y, 0, x, y, s); rg.addColorStop(0, `rgba(${cfg.edge?.patina ?? '95,70,35'},${0.14 + Math.random() * 0.2})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg; g.fillRect(x - s, y - s, s * 2, s * 2); }
      const v = g.createLinearGradient(0, 0, 0, H);
      v.addColorStop(0, 'rgba(50,40,20,0.5)'); v.addColorStop(0.2, 'rgba(50,40,20,0)'); v.addColorStop(0.8, 'rgba(50,40,20,0)'); v.addColorStop(1, 'rgba(50,40,20,0.5)');
      g.fillStyle = v; g.fillRect(0, 0, W, H);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; t.name = 'edge';
    return { t, aspect: c.width / c.height };
  }

  const [fo, fr] = await Promise.all([prepFace(cfg.obverse, cfg.bright?.[0]), prepFace(cfg.reverse, cfg.bright?.[1])]);
  const tone = ringTone(fo).map((v, i) => (v + ringTone(fr)[i]) / 2);
  const { t: eTex, aspect } = await edgeTexture(tone);
  const repeat = cfg.edge?.src && !cfg.edge.mode ? Math.max(1, Math.round((2 * Math.PI * R) / (T * aspect))) : 1;

  const M = cfg.metal ?? {}, mk = (name, map) => new THREE.MeshStandardMaterial({ name, map, color: 0xffffff, metalness: M.metalness ?? 0.3, roughness: M.roughness ?? 0.4 });
  const coin = new THREE.Group(); coin.name = cfg.name;
  const add = (name, geo, m) => { const mesh = new THREE.Mesh(geo, m); mesh.name = name; mesh.castShadow = mesh.receiveShadow = true; coin.add(mesh); };
  const NS = 720, NR = cfg.grooves ? 300 : 220;
  add('obverse', faceGeo(fo, false, cfg.grooves, NR, NS), mk('obverse', fo.tex));
  add('reverse', faceGeo(fr, true, null, NR, NS), mk('reverse', fr.tex));
  const em = new THREE.MeshStandardMaterial({ name: 'edge', map: eTex, bumpMap: eTex, bumpScale: cfg.edge?.mode === 'reeded' ? 0.35 : 0.8, color: 0xffffff, metalness: M.metalness ?? 0.3, roughness: (M.roughness ?? 0.4) + 0.06 });
  add('edge', edgeGeo({ f: fo, grooves: cfg.grooves }, { f: fr, grooves: null }, cfg.reeds ? cfg.reeds.count * 20 : 1440, cfg.reeds, repeat), em);
  coin.position.y = R;
  return coin;
}
