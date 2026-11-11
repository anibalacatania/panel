// Generador de diseño: repeticiones repartidas en sesiones + cuadrado de Williams por sesión.
// (Mismo algoritmo que la app "panel", verificado con 2.496 combinaciones.)

export function ordenNatural(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true }); }

export function rng(seed) { // mulberry32: aleatorio reproducible con semilla
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function barajar(arr, r) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Cuadrado de Williams (igual que crossdes::williams): n filas si n es par, 2n si es impar
export function williams(n) {
  if (n === 1) return [[0]];
  const primera = [0];
  let lo = 1, hi = n - 1, t = true;
  while (primera.length < n) { primera.push(t ? lo++ : hi--); t = !t; }
  const filas = [];
  for (let i = 0; i < n; i++) filas.push(primera.map(x => (x + i) % n));
  return n % 2 ? filas.concat(filas.map(f => [...f].reverse())) : filas;
}

// Repetición = cuántas veces pasa cada vino por el panel (8 vinos × 3 rep = 24 muestras).
// Sesión = cada reunión: las muestras se reparten de a "porSesion" (24 de a 6 = 4 sesiones;
// de a 7 = 7+7+7+3). Un mismo vino nunca se repite dentro de una sesión.
// Dentro de cada sesión el orden por panelista sigue un cuadrado de Williams.
export function tamaniosSesiones(total, porSesion, parejo) {
  const n = Math.ceil(total / porSesion);
  if (parejo) {
    const base = Math.floor(total / n), extra = total % n;
    return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
  }
  return Array.from({ length: n }, (_, i) => Math.min(porSesion, total - i * porSesion));
}

export function generarDiseno({ vinos, porSesion, reps, nPanelistas, parejo, semilla }) {
  const r = rng(semilla);
  const tam = tamaniosSesiones(vinos.length * reps, porSesion, parejo);

  // Repartir las copias: en cada sesión se eligen vinos distintos, priorizando los que
  // tienen más repeticiones pendientes (así nunca queda un vino "atascado" al final).
  const restan = {}; vinos.forEach(v => { restan[v] = reps; });
  const usadas = {}; vinos.forEach(v => { usadas[v] = 0; });
  const contenidos = tam.map(t => {
    const orden = barajar(vinos, r).filter(v => restan[v] > 0).sort((a, b) => restan[b] - restan[a]);
    const elegidos = orden.slice(0, t);
    return barajar(elegidos, r).map(v => { restan[v]--; usadas[v]++; return { vino: v, rep: usadas[v] }; });
  });

  // códigos de 3 dígitos únicos en todo el estudio
  const codigos = barajar(Array.from({ length: 900 }, (_, i) => String(100 + i)), r);
  let ic = 0;

  const panelistas = Array.from({ length: nPanelistas }, (_, i) => 'V' + (i + 1));
  const sesiones = [], diseno = [];
  contenidos.forEach((muestras, si) => {
    const sesion = 'S' + (si + 1);
    muestras.forEach(m => { m.codigo = codigos[ic++]; });
    const W = williams(muestras.length);
    const mapeos = {}; // un orden aleatorio de muestras por cada bloque de panelistas
    panelistas.forEach((v, pi) => {
      const bloque = Math.floor(pi / W.length), fila = pi % W.length;
      if (!mapeos[bloque]) mapeos[bloque] = barajar(muestras, r);
      W[fila].forEach((pos, k) => {
        const m = mapeos[bloque][pos];
        diseno.push({ Sesion: sesion, Valuador: v, Orden: k + 1, NombreProducto: m.vino, Rep: m.rep, CodigoProducto: m.codigo });
      });
    });
    const ordenadas = [...muestras].sort((a, b) => ordenNatural(a.vino, b.vino));
    sesiones.push({
      Sesion: sesion, NMuestras: muestras.length,
      Vinos: ordenadas.map(m => `${m.vino} (r${m.rep}, ${m.codigo})`).join(' | '),
      muestras: ordenadas, filasWilliams: W.length,
    });
  });
  return { sesiones, diseno, totalMuestras: vinos.length * reps };
}

