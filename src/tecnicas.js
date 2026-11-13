// Técnicas sensoriales y lista de descriptores (con grupos opcionales)
import { rng, barajar } from './diseno.js';

export const TECNICAS = {
  descriptiva: { nombre: 'Análisis Descriptivo Cuantitativo', corto: 'ADC', color: 'bg-indigo-100 text-indigo-700' },
  rata: { nombre: 'RATA (Rate-All-That-Apply)', corto: 'RATA', color: 'bg-pink-100 text-pink-700' },
  flash: { nombre: 'Perfil Flash', corto: 'Flash', color: 'bg-amber-100 text-amber-800' },
};
export const nombreTecnica = t => (TECNICAS[t] || TECNICAS.descriptiva).nombre;

export const ESCALAS_RATA = {
  3: ['Bajo', 'Medio', 'Alto'],
  5: ['1', '2', '3', '4', '5'],
};
export const etiquetasRata = n => ESCALAS_RATA[n] || ESCALAS_RATA[3];

// Texto → estructura.
//   "# Aroma"      título de modalidad (nivel 1)
//   "## Cítricos"  subgrupo / macrocategoría (nivel 2)
//   "Limón"        descriptor
// Si un descriptor se repite en distintos grupos (ej. "Limón" en Aroma y en Sabor),
// la columna de resultados se llama "Aroma: Limón" / "Sabor: Limón".
export function parsearDescriptores(txt) {
  const items = [];
  let g1 = '', g2 = '';
  for (const cruda of String(txt || '').split(/\r?\n/)) {
    const l = cruda.replace(/\s+/g, ' ').trim();
    if (!l) continue;
    const m = l.match(/^(#{1,2})\s*(.*)$/);
    if (m) {
      const n = m[2].trim(); if (!n) continue;
      if (m[1] === '#') { g1 = n; g2 = ''; items.push({ t: 'g1', n }); }
      else { g2 = n; items.push({ t: 'g2', n }); }
      continue;
    }
    for (const parte of l.split(/\t|;/)) {
      const n = parte.trim(); if (n) items.push({ t: 'a', n, g1, g2 });
    }
  }
  const attrs = items.filter(i => i.t === 'a');
  const cuenta = {}; attrs.forEach(a => { cuenta[a.n] = (cuenta[a.n] || 0) + 1; });
  attrs.forEach(a => { a.k = cuenta[a.n] > 1 ? `${a.g1 || a.g2 || 'Grupo'}: ${a.n}` : a.n; });
  const claves = attrs.map(a => a.k);
  const dup = [...new Set(claves.filter((k, i) => claves.indexOf(k) !== i))];
  const malos = claves.filter(k => /[|]/.test(k) || k.length > 120);
  const hayGrupos = items.some(i => i.t !== 'a');
  return {
    claves, dup, malos, hayGrupos,
    estructura: hayGrupos || attrs.some(a => a.k !== a.n) ? items.map(({ t, n, k }) => (t === 'a' ? { t, n, k } : { t, n })) : null,
  };
}

// Estructura guardada → bloques para mostrar: [{ g1, g2, attrs:[{k,n}] }]
// Con ordenAzar, los descriptores se mezclan dentro de cada bloque (los grupos quedan en su lugar),
// de forma distinta pero fija para cada panelista.
export function bloquesDe(est, semillaTxt) {
  const items = est.estructura || est.atributos.map(k => ({ t: 'a', n: k, k }));
  const bloques = [];
  let g1 = '', g2 = '', act = null;
  const nuevo = () => { act = { g1, g2, attrs: [] }; bloques.push(act); };
  for (const it of items) {
    if (it.t === 'g1') { g1 = it.n; g2 = ''; act = null; }
    else if (it.t === 'g2') { g2 = it.n; act = null; }
    else { if (!act) nuevo(); act.attrs.push({ k: it.k, n: it.n }); }
  }
  if (est.ordenAzar && semillaTxt) {
    let h = 2166136261; for (const c of semillaTxt) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    const r = rng(h >>> 0);
    bloques.forEach(b => { b.attrs = barajar(b.attrs, r); });
  }
  // marcar cuándo mostrar cada título (solo al cambiar)
  let ult1 = null;
  bloques.forEach(b => { b.mostrarG1 = b.g1 && b.g1 !== ult1; ult1 = b.g1; });
  return bloques;
}

// Texto para volver a editar (de estructura a texto)
export function estructuraATexto(est) {
  if (!est.estructura) return est.atributos.join('\n');
  return est.estructura.map(i => (i.t === 'g1' ? '\n# ' + i.n : i.t === 'g2' ? '## ' + i.n : i.n)).join('\n').trim();
}

// Perfil Flash: de las posiciones elegidas por el panelista (1 = menos intenso; números repetidos = empate)
// a rangos 1..n, con empates promediados (rango medio), como se analiza habitualmente.
export function rangosDesdePosiciones(pos) {
  const ks = Object.keys(pos).sort((a, b) => pos[a] - pos[b]);
  const out = {};
  let i = 0;
  while (i < ks.length) {
    let j = i; while (j + 1 < ks.length && pos[ks[j + 1]] === pos[ks[i]]) j++;
    const r = (i + 1 + j + 1) / 2;
    for (let t = i; t <= j; t++) out[ks[t]] = r;
    i = j + 1;
  }
  return out;
}
