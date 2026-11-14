// Análisis rápido en el navegador: medias por vino, frecuencia de citación (RATA),
// ANOVA orientativa (vino + panelista) y PCA estandarizado (como FactoMineR::PCA con scale.unit = TRUE).

// ---------------------------------------------------------------- estadística básica
function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015; for (const ci of c) s += ci / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}
function betacf(a, b, x) {
  const MAX = 300, EPS = 3e-12, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
  for (let m = 1; m <= MAX; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function betai(a, b, x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
export function pF(F, d1, d2) { // P(F > f)
  if (!(F > 0) || d1 <= 0 || d2 <= 0) return 1;
  return betai(d2 / 2, d1 / 2, d2 / (d2 + d1 * F));
}

// Jacobi: autovalores/autovectores de una matriz simétrica chica
function jacobi(A0) {
  const n = A0.length, A = A0.map(r => [...r]);
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let barrido = 0; barrido < 100; barrido++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const orden = A.map((r, i) => i).sort((a, b) => A[b][b] - A[a][a]);
  return { valores: orden.map(i => A[i][i]), vectores: orden.map(i => V.map(r => r[i])) };
}

// ---------------------------------------------------------------- análisis
// filas: [{ NombreProducto, Valuador, <atributo>: número, ... }]
export function analizar(filas, atributos, { rata = false } = {}) {
  const vinos = [...new Set(filas.map(f => f.NombreProducto).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }));
  const n = {}, suma = {}, cit = {};
  vinos.forEach(v => { n[v] = 0; suma[v] = {}; cit[v] = {}; atributos.forEach(a => { suma[v][a] = 0; cit[v][a] = 0; }); });
  for (const f of filas) {
    const v = f.NombreProducto; if (!(v in n)) continue; n[v]++;
    atributos.forEach(a => { const x = Number(f[a]) || 0; suma[v][a] += x; if (x > 0) cit[v][a]++; });
  }
  const medias = {}, frec = {};
  vinos.forEach(v => { medias[v] = {}; frec[v] = {}; atributos.forEach(a => {
    medias[v][a] = n[v] ? suma[v][a] / n[v] : 0; frec[v][a] = n[v] ? cit[v][a] / n[v] : 0; }); });

  // ANOVA orientativa por atributo: vino, quitando el efecto panelista (centrado por panelista)
  const pans = [...new Set(filas.map(f => f.Valuador))];
  const anova = {};
  const N = filas.filter(f => f.NombreProducto in n).length;
  for (const a of atributos) {
    const mp = {}, cp = {};
    filas.forEach(f => { if (!(f.NombreProducto in n)) return; mp[f.Valuador] = (mp[f.Valuador] || 0) + (Number(f[a]) || 0); cp[f.Valuador] = (cp[f.Valuador] || 0) + 1; });
    const ys = {}; let tot = 0, cnt = 0;
    filas.forEach(f => { if (!(f.NombreProducto in n)) return;
      const y = (Number(f[a]) || 0) - mp[f.Valuador] / cp[f.Valuador];
      (ys[f.NombreProducto] = ys[f.NombreProducto] || []).push(y); tot += y; cnt++; });
    const gm = cnt ? tot / cnt : 0; let ssB = 0, ssW = 0;
    Object.values(ys).forEach(arr => { const m = arr.reduce((s, x) => s + x, 0) / arr.length;
      ssB += arr.length * (m - gm) ** 2; arr.forEach(x => { ssW += (x - m) ** 2; }); });
    const k = Object.keys(ys).length, d1 = k - 1, d2 = N - k - (pans.length - 1);
    const F = d1 > 0 && d2 > 0 ? (ssW > 0 ? (ssB / d1) / (ssW / d2) : (ssB > 0 ? Infinity : 0)) : 0;
    anova[a] = { F, p: d1 > 0 && d2 > 0 ? (ssW > 0 ? pF(F, d1, d2) : (ssB > 0 ? 0 : 1)) : null };
  }

  return { vinos, n, medias, frec, anova, pca: pca(vinos, atributos, medias) };
}

// PCA estandarizado sobre la matriz de medias (vinos × atributos)
export function pca(vinos, atributos, medias) {
  const nv = vinos.length;
  if (nv < 3) return null;
  const cols = [];
  for (const a of atributos) {
    const x = vinos.map(v => medias[v][a]);
    const m = x.reduce((s, y) => s + y, 0) / nv;
    const sd = Math.sqrt(x.reduce((s, y) => s + (y - m) ** 2, 0) / nv);
    if (sd > 1e-9) cols.push({ a, z: x.map(y => (y - m) / sd) });
  }
  if (cols.length < 2) return null;
  const G = Array.from({ length: nv }, (_, i) => Array.from({ length: nv }, (_, j) => cols.reduce((s, c) => s + c.z[i] * c.z[j], 0) / nv));
  const { valores, vectores } = jacobi(G);
  const total = cols.length;
  const dims = [0, 1].filter(d => valores[d] > 1e-10);
  if (dims.length < 2) return null;
  const ind = vinos.map((v, i) => ({ v, x: Math.sqrt(nv * valores[0]) * vectores[0][i], y: Math.sqrt(nv * valores[1]) * vectores[1][i] }));
  const vars = cols.map(c => ({
    a: c.a,
    x: c.z.reduce((s, z, i) => s + z * vectores[0][i], 0) / Math.sqrt(nv),
    y: c.z.reduce((s, z, i) => s + z * vectores[1][i], 0) / Math.sqrt(nv),
  }));
  return { ind, vars, pct: [100 * valores[0] / total, 100 * valores[1] / total], excluidos: atributos.filter(a => !cols.some(c => c.a === a)) };
}

// Análisis Factorial Múltiple (como FactoMineR::MFA con todos los grupos type = "s"):
// bloques = [{ nombre, cols: [{ a, x: [valor por fila] }] }]  (filas = productos)
// Cada variable se estandariza; cada bloque se pondera por 1/λ1 del bloque; ACP global sin re-estandarizar.
export function afm(filasNombres, bloques) {
  const n = filasNombres.length;
  if (n < 3) return null;
  const est = x => { const m = x.reduce((s, y) => s + y, 0) / n; const sd = Math.sqrt(x.reduce((s, y) => s + (y - m) ** 2, 0) / n); return sd > 1e-9 ? x.map(y => (y - m) / sd) : null; };
  const cols = [], grupos = [];
  for (const b of bloques) {
    const zs = b.cols.map(c => ({ a: c.a, z: est(c.x) })).filter(c => c.z);
    if (!zs.length) continue;
    const G = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => zs.reduce((s, c) => s + c.z[i] * c.z[j], 0) / n));
    const l1 = jacobi(G).valores[0];
    if (!(l1 > 1e-10)) continue;
    const w = 1 / Math.sqrt(l1);
    zs.forEach(c => cols.push({ a: c.a, grupo: b.nombre, z: c.z, w }));
    grupos.push({ nombre: b.nombre, n: zs.length, W: G });
  }
  if (grupos.length < 1 || cols.length < 2) return null;
  const G = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => cols.reduce((s, c) => s + c.w * c.w * c.z[i] * c.z[j], 0) / n));
  const { valores, vectores } = jacobi(G);
  const total = valores.reduce((s, v) => s + Math.max(0, v), 0);
  if (!(valores[1] > 1e-10)) return null;
  // RV de cada panelista con el consenso (como res$group$RV[, "MFA"] de FactoMineR): 1 = misma configuración
  const tr = (A, B) => { let t = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) t += A[i][j] * B[j][i]; return t; };
  const tGG = tr(G, G);
  grupos.forEach(g => { g.rv = tr(g.W, G) / Math.sqrt(tr(g.W, g.W) * tGG); delete g.W; });
  const ind = filasNombres.map((v, i) => ({ v, x: Math.sqrt(n * valores[0]) * vectores[0][i], y: Math.sqrt(n * valores[1]) * vectores[1][i] }));
  const vars = cols.map(c => ({ a: c.a, grupo: c.grupo,
    x: c.z.reduce((s, z, i) => s + z * vectores[0][i], 0) / Math.sqrt(n),
    y: c.z.reduce((s, z, i) => s + z * vectores[1][i], 0) / Math.sqrt(n) }));
  return { ind, vars, pct: [100 * valores[0] / total, 100 * valores[1] / total], grupos, excluidos: [] };
}
