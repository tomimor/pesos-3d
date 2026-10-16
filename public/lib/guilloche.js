// Guilloché rosettes: the interlaced spirograph line-work printed on banknotes as an anti-counterfeit
// device. Each piece gets its own deterministic rosette from a seed.

function rng(seed) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Hypotrochoid wrapped around a base radius, modulated so loops breathe in and out.
function trace({ R, lobes, amp, wobble, wobbleN, phase, steps }) {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = R + amp * Math.cos(lobes * t + phase) + wobble * Math.sin(wobbleN * t);
    const x = r * Math.cos(t), y = r * Math.sin(t);
    d += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  return d + 'Z';
}

/** SVG markup for a rosette in a 1000×1000 viewBox centred on 0,0. Strokes use currentColor. */
export function rosette(seed, { rings = 3 } = {}) {
  const rand = rng(seed);
  const paths = [];
  const lobes = 26 + Math.floor(rand() * 20);
  for (let ring = 0; ring < rings; ring++) {
    const R = 190 + ring * 95 + rand() * 20;
    const amp = 16 + rand() * 16 + ring * 4;
    const strands = 22 + Math.floor(rand() * 10);
    const ringLobes = lobes + ring * (4 + Math.floor(rand() * 6));
    const wobble = 4 + rand() * 6;
    for (let k = 0; k < strands; k++) {
      paths.push({
        d: trace({ R: R + (k - strands / 2) * 0.9, lobes: ringLobes, amp, wobble, wobbleN: ringLobes * 3 + 1, phase: (k / strands) * Math.PI * 2 / ringLobes, steps: 1600 }),
        o: 0.35 + 0.65 * (1 - Math.abs(k / (strands - 1) - 0.5) * 2),
        ring,
      });
    }
  }
  // fine outer border band, like the frame around a banknote rosette
  const band = 470;
  for (let k = 0; k < 6; k++) {
    paths.push({ d: trace({ R: band - k * 3.2, lobes: 120, amp: 4, wobble: 0, wobbleN: 1, phase: k * 0.6, steps: 2400 }), o: 0.6, ring: rings });
  }
  return `<svg viewBox="-500 -500 1000 1000" aria-hidden="true" focusable="false">${paths
    .map((p) => `<path pathLength="1" d="${p.d}" style="--o:${p.o.toFixed(2)};--ring:${p.ring}"/>`)
    .join('')}</svg>`;
}
