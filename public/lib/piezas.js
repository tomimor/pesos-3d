// Single source of truth for the collection: gallery, detail pages and the vitrina read from here.
// `ink` is the dominant printing-ink colour of the piece; the page re-tints itself with it.
export const piezas = [
  {
    slug: '50-pesos', label: '50 pesos', kind: 'billete', numeral: '50', unit: 'pesos', title: 'Islas Malvinas',
    ink: '#123c52', glow: '#7fc4dc', glb: 3.3,
    facts: [['Emisión', '2015'], ['Emisor', 'Banco Central'], ['Medidas', '155 × 65 mm'], ['Detalle', 'Sol con tinta que cambia de color']],
  },
  {
    slug: '5-pesos', label: '5 pesos', kind: 'billete', numeral: '5', unit: 'pesos', title: 'San Martín',
    ink: '#2e2440', glow: '#b89ad6', glb: 2.5,
    facts: [['Serie', 'Peso convertible'], ['Emisor', 'Banco Central'], ['Medidas', '155 × 65 mm']],
  },
  {
    slug: '1000000-pesos', label: '1.000.000 de pesos', kind: 'billete', numeral: '1.000.000', unit: 'pesos', title: 'Un millón de pesos',
    ink: '#3a2232', glow: '#e3a1b8', glb: 1.7,
    facts: [['Serie', 'Peso ley 18.188'], ['Emisor', 'Banco Central'], ['Estado', 'Usado, con esquinas gastadas']],
  },
  {
    slug: '2-pesos-1888', label: '2 pesos', kind: 'billete', numeral: '2', unit: 'pesos', title: 'El Banco Nacional',
    ink: '#3b2a12', glow: '#e0b465', glb: 1.0,
    facts: [['Año', '1888'], ['Emisor', 'El Banco Nacional'], ['Medidas', '176 × 72 mm']],
  },
  {
    slug: '1-peso', label: '1 peso', kind: 'moneda', numeral: '1', unit: 'peso', title: 'Primera moneda patria',
    ink: '#2b2a20', glow: '#e9c766', glb: 1.5, hq: '1-peso-hq',
    facts: [['Acuñación', '1994 a 2016'], ['Metal', 'Bimetálica'], ['Diámetro', '23 mm'], ['Peso', '6,4 g']],
  },
  {
    slug: '25-centavos-1994', label: '25 centavos', kind: 'moneda', numeral: '25', unit: 'centavos', title: 'El Cabildo',
    ink: '#24282b', glow: '#c9d3d8', glb: 1.7,
    facts: [['Año', '1994'], ['Metal', 'Cuproníquel'], ['Diámetro', '24,2 mm'], ['Canto', 'Estriado']],
  },
  {
    slug: 'token-patrio-2026', label: 'Token Patrio', kind: 'moneda', numeral: '2026', unit: 'token', title: 'Primer Token Patrio',
    ink: '#1f2a2a', glow: '#8fe0c8', glb: 1.4,
    facts: [['Año', '2026'], ['Origen', 'Ficción sobre el peso de 1994'], ['Técnica', 'Leyenda re-acuñada con letras de la propia moneda']],
  },
  {
    slug: 'cospel-subte', label: 'Cospel de subte', kind: 'ficha', numeral: '1', unit: 'viaje', title: 'Cospel de subte',
    ink: '#22282f', glow: '#aebfd0', glb: 1.7,
    facts: [['Uso', '1962 a 1994'], ['Emisor', 'Subterráneos de Buenos Aires'], ['Metal', 'Aluminio']],
  },
  {
    slug: 'ficha-telefono', label: 'Ficha de teléfono', kind: 'ficha', numeral: '467', unit: 'ficha', title: 'Ficha de teléfono',
    ink: '#2f2614', glow: '#d9b45a', glb: 2.0,
    facts: [['Emisor', 'ENTel'], ['Metal', 'Bronce'], ['Uso', 'Teléfonos públicos']],
  },
];

export const pathOf = (p) => `${p.kind === 'billete' ? 'billetes' : 'monedas'}/${p.slug}/`;

// Pieces people have asked for; shown as empty slots to invite contributions.
export const buscadas = [
  { numeral: '100', unit: 'pesos', title: 'Evita' },
  { numeral: '1', unit: 'austral', title: 'Austral, 1985' },
  { numeral: '10', unit: 'centavos', title: 'Cabildo, 1992' },
  { numeral: '1', unit: 'centavo', title: 'Peso moneda nacional, 1890' },
];
