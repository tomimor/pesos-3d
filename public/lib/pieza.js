// Chrome for a single-piece page: ink colour, rosette, title block, facts and prev/next.
import { piezas, pathOf } from './piezas.js';
import { rosette } from './guilloche.js';

const slugInPath = location.pathname.split('/').filter(Boolean).pop();
const hq = slugInPath === '1-peso-hq';
const slug = hq ? '1-peso' : slugInPath;
const i = piezas.findIndex((p) => p.slug === slug);
if (i < 0) throw new Error(`pieza.js: unknown piece "${slugInPath}"`);
const p = piezas[i];
const prev = piezas[(i - 1 + piezas.length) % piezas.length];
const next = piezas[(i + 1) % piezas.length];
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const kindLabel = { billete: 'Billete', moneda: 'Moneda', ficha: 'Ficha' };

const root = document.documentElement;
root.style.setProperty('--ink', p.ink);
root.style.setProperty('--glow', p.glow);
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.ink);

const variant = p.hq
  ? (hq ? `<a class="variant" href="../${p.slug}/">Ver versión liviana</a>` : `<a class="variant" href="../${p.hq}/">Ver en alta definición</a>`)
  : '';

document.body.insertAdjacentHTML('afterbegin', `
<div class="vignette"></div>
<div class="rosette pieza-rosette">${rosette(p.slug)}</div>
<header class="pieza-top">
  <a class="wordmark" href="../../">pesos<sup>3D</sup></a>
  <a class="volver" href="../../#${p.slug}">Colección</a>
</header>
<section class="pieza-info" aria-labelledby="pieza-h">
  <h1 id="pieza-h"><span class="numeral${p.numeral.length > 3 ? ' long' : ''}">${esc(p.numeral)}</span><span class="unit">${esc(p.unit)}</span><span class="title">${esc(p.title)}${hq ? ', alta definición' : ''}</span></h1>
  <dl class="facts"><dt>Tipo</dt><dd>${kindLabel[p.kind]}</dd>${p.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  ${variant}
</section>
<nav class="pieza-nav" aria-label="Otras piezas">
  <a href="../../${pathOf(prev)}" rel="prev"><small>Anterior</small>${esc(prev.label)}</a>
  <a href="../../${pathOf(next)}" rel="next"><small>Siguiente</small>${esc(next.label)}</a>
</nav>
<div class="grain" aria-hidden="true"></div>`);

document.title = `${p.label}${hq ? ', alta definición' : ''} — pesos-3d`;

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowLeft') location.href = `../../${pathOf(prev)}`;
  if (e.key === 'ArrowRight') location.href = `../../${pathOf(next)}`;
});

// the rosette draws itself while the model is being built, then settles
const stage = document.querySelector('three-d-stage');
stage.addEventListener('object-ready', () => document.body.classList.add('listo'), { once: true });
