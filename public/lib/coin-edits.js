// Re-strikes ring legends by re-arranging real glyphs sampled from the photographs
// (polar remap around the coin centre, so every letter keeps its original pixels, relief and wear).
(function () {
  const D = Math.PI / 180;
  function sampler(src, W, H) {
    return (x, y) => {
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const i = (y0 * W + x0) * 4, j = i + 4, k = i + W * 4, l = k + 4, o = [0, 0, 0];
      for (let c = 0; c < 3; c++) o[c] = (src[i + c] * (1 - fx) + src[j + c] * fx) * (1 - fy) + (src[k + c] * (1 - fx) + src[l + c] * fx) * fy;
      return o;
    };
  }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  // items: [{ src:[sA,sB] } | { w, fn:(u, rn, at)=>rgb }] laid out in reading order (decreasing angle) from `start`
  function remap(ctx, f, items, { start, lo, hi, r0 = 0.772, r1 = 0.962, feather = 0.3 }) {
    const { W, H, cx, cy, rad } = f;
    const img = ctx.getImageData(0, 0, W, H), d = img.data, src = new Uint8ClampedArray(d);
    const smp = sampler(src, W, H);
    const raw = (thDeg, rn) => smp(cx + rn * rad * Math.cos(thDeg * D), cy + rn * rad * Math.sin(thDeg * D));
    // low-pass background level (field only, letters excluded) so moved glyphs take on the lighting of where they land
    const TB = 360, RB = 26, bg = new Float32Array(TB * RB);
    { const acc = Array.from({ length: TB * RB }, () => []);
      for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
        const dx = x - cx, dy = y - cy, rn = Math.hypot(dx, dy) / rad; if (rn < r0 || rn > r1) continue;
        let t = Math.atan2(dy, dx) / D; if (t < 0) t += 360;
        const k = (y * W + x) * 4, l = (src[k] + src[k + 1] + src[k + 2]) / 3; if (l < 45 || l > 165) continue;
        acc[Math.min(RB - 1, Math.floor((rn - r0) / (r1 - r0) * RB)) * TB + Math.floor(t) % TB].push(l);
      }
      const med = new Float32Array(TB * RB);
      for (let i = 0; i < TB * RB; i++) { const a = acc[i].sort((p, q) => p - q); med[i] = a.length ? a[a.length >> 1] : 0; }
      for (let rb = 0; rb < RB; rb++) for (let t = 0; t < TB; t++) { let sm = 0, n = 0;
        for (let q = -4; q <= 4; q++) { const v = med[rb * TB + (t + q + TB) % TB]; if (v) { sm += v; n++; } }
        bg[rb * TB + t] = n ? sm / n : 100; }
    }
    const bgAt = (t, rn) => { t = ((t % 360) + 360) % 360; const rb = Math.max(0, Math.min(RB - 1, Math.floor((rn - r0) / (r1 - r0) * RB)));
      const t0 = Math.floor(t), f = t - t0; return bg[rb * TB + t0 % TB] * (1 - f) + bg[rb * TB + (t0 + 1) % TB] * f; };
    let dest = 0;
    const at = (thDeg, rn) => { const c = raw(thDeg, rn), g = bgAt(dest, rn) / bgAt(thDeg, rn); return [c[0] * g, c[1] * g, c[2] * g]; };
    let a = start; const lay = [];
    for (const it of items) { const w = it.w ?? (it.src[0] - it.src[1]); lay.push({ ...it, dA: a, w }); a -= w; }
    const end = a;
    lay.unshift({ identity: true, dA: 360, w: 360 - start });
    lay.push({ identity: true, dA: end, w: end + 360 });
    const col = (it, th, rn) => {
      if (it.identity) return raw(th, rn);
      dest = th;
      const u = it.dA - th;
      if (it.fn) return it.fn(u, rn, at, bgAt(th, rn));
      const s = (it.src[0] - it.src[1]) / it.w;
      return at(it.src[0] - u * s, rn);
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy, rn = Math.hypot(dx, dy) / rad;
      if (rn < r0 || rn > r1) continue;
      const th = Math.atan2(dy, dx) / D;
      if (th < lo || th > hi) continue;
      let i = 1; while (i < lay.length - 1 && th < lay[i].dA - lay[i].w) i++;
      if (th > lay[1].dA) i = 0;
      const it = lay[i]; let c = col(it, th, rn);
      const dTop = it.dA - th, dBot = th - (it.dA - it.w);
      if (dTop < feather && i > 0) c = mix(col(lay[i - 1], th, rn), c, 0.5 + dTop / feather / 2);
      else if (dBot < feather && i < lay.length - 1) c = mix(col(lay[i + 1], th, rn), c, 0.5 + dBot / feather / 2);
      const k = (y * W + x) * 4;
      // soften the radial band edges into the untouched ring
      const e = Math.min(ss(r0, r0 + 0.012, rn), 1 - ss(r1 - 0.012, r1, rn));
      for (let ch = 0; ch < 3; ch++) d[k + ch] = src[k + ch] + (c[ch] - src[k + ch]) * e;
    }
    ctx.putImageData(img, 0, 0);
    return { start, end };
  }

  // K assembled from MONEDA's N (same lighting, same stroke weight). Each stroke is transplanted as a
  // relief delta over clean field texture, so there are no pasted blocks or seams.
  //  stem : N's left stem                       leg "\\" : lower half of N's diagonal
  //  arm "/" : upper half of the same diagonal, mirrored about the letter's mid-line
  const K = {
    w: 5.3,
    fn(u, rn, at, fieldL) {
      const MID = 0.876, lum = c => (c[0] + c[1] + c[2]) / 3;
      const base = at(116.6 - ((u + 0.3) % 5.8), rn);             // letter-free field (word space)
      const box = (x, a0, a1, f) => ss(a0 - f, a0 + f, x) * (1 - ss(a1 - f, a1 + f, x));
      const strokes = [];
      // stem (cut just before the diagonal leaves N's stem near the top)
      const stemR = rn < 0.862 ? 1.72 : 1.95;
      strokes.push([at(90.9 - u, rn), box(u, 0.05, stemR, 0.12) * box(rn, 0.818, 0.944, 0.004)]);
      // leg: lower half of the diagonal, shifted to meet the stem at mid-height
      const sd = 87.45 - (u - 1.7) / 1.25;
      if (rn > MID - 0.012) strokes.push([at(sd, rn), box(u, 1.55, 4.6, 0.16) * ss(MID - 0.012, MID + 0.004, rn) * (1 - ss(0.938, 0.946, rn))]);
      // arm: mirrored diagonal
      if (rn < MID + 0.012) { const rr = 2 * MID - rn;
        strokes.push([at(sd, rr), box(u, 1.55, 4.55, 0.16) * (1 - ss(MID - 0.004, MID + 0.012, rn)) * ss(0.81, 0.818, rn)]); }
      let out = base.slice(), best = 0;
      for (const [c, m] of strokes) {
        if (m <= 0) continue;
        const dl = (lum(c) - fieldL) * m;
        if (Math.abs(dl) > Math.abs(best)) best = dl;
      }
      return [out[0] + best * 1.02, out[1] + best, out[2] + best * 0.95];
    },
  };

  window.CoinEdits = {
    obverse(ctx, f) {
      // PRIMER · TOKEN · PATRIO, centred on the bottom axis like the original legend
      const body = [
        { src: [165.3, 123.6] },             // PRIMER (original)
        { src: [116.8, 110.2] },             // word space
        { src: [41.8, 34.0] },               // T  (from PATRIA)
        { src: [99.6, 91.4] },               // O  (from MONEDA)
        K,                                   // K  (assembled)
        { src: [83.0, 74.6] },               // E  (from MONEDA)
        { src: [91.4, 83.0] },               // N  (from MONEDA)
        { src: [60.4, 53.9] },               // word space
        { src: [53.9, 22.9] },               // PATRI (original)
        { src: [99.6, 91.4] },               // O
      ];
      const w = body.reduce((s, it) => s + (it.w ?? it.src[0] - it.src[1]), 0);
      const start = 90 + w / 2;
      const items = [{ src: [116.8, 110.4], w: 4.8 }, { src: [116.6, 111.0], w: 4.9 }, ...body, { src: [16.0, 6.5] }, { src: [16.0, 9.0] }];
      remap(ctx, f, items, { start: start + 9.7, lo: 4.5, hi: 176 });
    },
    reverse(ctx, f) {
      // 2006 → 2026: the first "2" re-struck in the third position
      remap(ctx, f, [{ src: [107.2, 97.9], w: 9.3 }], { start: 88.95, lo: 79.0, hi: 89.9 });
    },
  };
})();
