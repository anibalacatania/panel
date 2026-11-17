// =====================================================================
// Estadística del tablero: replica lo que hace run_board() de LibreSense-R
//   - Medias ajustadas de SensoMineR::decat(~Producto+Valuador)  (contrastes suma)
//   - FactoMineR::PCA(adjmean, scale.unit = FALSE)
//   - agricolae::LSD.test(aov(y ~ Producto), "Producto", p.adj = "bonferroni") + orderPvalue
//   - cajas de ggplot2 (cuantiles tipo 7, bigotes 1.5 * IQR)
//   - medianas por producto (radar)
// =====================================================================

// ---------------------------------------------------------- distribución t
function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function betacf(a, b, x) {
  const MAXIT = 300, EPS = 3e-16, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
// beta incompleta regularizada I_x(a, b)
export function ibeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}
// P(|T| > t) con df grados de libertad
export function pt2(t, df) {
  if (!isFinite(t)) return 0;
  return ibeta(df / (df + t * t), df / 2, 0.5);
}

// ---------------------------------------------------------- utilidades
const sum = a => a.reduce((s, x) => s + x, 0);
const mean = a => sum(a) / a.length;
export const ordenR = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: false, sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);
export function niveles(v) { return [...new Set(v)].sort(ordenR); }

// cuantil tipo 7 (el de R por defecto)
export function cuantil(x, p) {
  const s = [...x].sort((a, b) => a - b), n = s.length;
  if (!n) return NaN;
  const h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}
export const mediana = x => cuantil(x, 0.5);

// resuelve A x = b (A simétrica) con eliminación gaussiana y pivoteo; columnas alias -> 0 (como R)
function resolver(A, b) {
  const n = A.length, M = A.map((f, i) => [...f, b[i]]), piv = [];
  const usado = new Array(n).fill(false), x = new Array(n).fill(0);
  const escala = Math.max(1e-300, ...A.map((f, i) => Math.abs(f[i])));
  for (let k = 0; k < n; k++) {
    let p = -1, mx = 1e-9 * escala;
    for (let i = 0; i < n; i++) if (!usado[i] && Math.abs(M[i][k]) > mx) { mx = Math.abs(M[i][k]); p = i; }
    if (p < 0) { piv.push(null); continue; }
    usado[p] = true; piv.push(p);
    for (let i = 0; i < n; i++) {
      if (i === p) continue;
      const f = M[i][k] / M[p][k];
      if (f) for (let j = k; j <= n; j++) M[i][j] -= f * M[p][j];
    }
  }
  for (let k = 0; k < n; k++) if (piv[k] !== null) x[k] = M[piv[k]][n] / M[piv[k]][k];
  return x;
}

// Medias ajustadas de decat: modelo y ~ Producto + Valuador con contr.sum; adjmean = mu + alfa_i
export function mediasAjustadas(filas, atributos) {
  const prods = niveles(filas.map(f => f.Producto));
  const vals = niveles(filas.map(f => f.Valuador));
  const P = prods.length, V = vals.length;
  const ip = new Map(prods.map((p, i) => [p, i])), iv = new Map(vals.map((v, i) => [v, i]));
  const ncol = 1 + (P - 1) + (V - 1);
  const fila = f => {
    const x = new Array(ncol).fill(0);
    x[0] = 1;
    const a = ip.get(f.Producto), b = iv.get(f.Valuador);
    if (P > 1) { if (a < P - 1) x[1 + a] = 1; else for (let j = 0; j < P - 1; j++) x[1 + j] = -1; }
    if (V > 1) { if (b < V - 1) x[P + b] = 1; else for (let j = 0; j < V - 1; j++) x[P + j] = -1; }
    return x;
  };
  const res = {};
  for (const at of atributos) {
    const datos = filas.filter(f => typeof f[at] === 'number' && isFinite(f[at]));
    const XtX = Array.from({ length: ncol }, () => new Array(ncol).fill(0)), Xty = new Array(ncol).fill(0);
    for (const f of datos) {
      const x = fila(f), y = f[at];
      for (let i = 0; i < ncol; i++) { if (!x[i]) continue; Xty[i] += x[i] * y; for (let j = 0; j < ncol; j++) XtX[i][j] += x[i] * x[j]; }
    }
    const beta = resolver(XtX, Xty);
    const alfa = [];
    for (let i = 0; i < P - 1; i++) alfa.push(beta[1 + i]);
    alfa.push(-sum(alfa));
    res[at] = prods.map((p, i) => beta[0] + alfa[i]);
  }
  return { productos: prods, adjmean: res };
}

// autovalores/vectores de una matriz simétrica (Jacobi)
function jacobi(S) {
  const n = S.length, A = S.map(f => [...f]), V = A.map((f, i) => f.map((_, j) => (i === j ? 1 : 0)));
  for (let it = 0; it < 100; it++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = A[k][p], akq = A[k][q];
        A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = A[p][k], aqk = A[q][k];
        A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const val = A.map((f, i) => f[i]);
  const idx = val.map((_, i) => i).sort((a, b) => val[b] - val[a]);
  return { valores: idx.map(i => val[i]), vectores: idx.map(i => V.map(f => f[i])) };
}

// FactoMineR::PCA(X, scale.unit = FALSE): pesos 1/n, centrado
export function acp(productos, adjmean, atributos) {
  const n = productos.length, p = atributos.length;
  const X = productos.map((_, i) => atributos.map(a => adjmean[a][i]));
  const mu = atributos.map((_, j) => mean(X.map(f => f[j])));
  const Xc = X.map(f => f.map((v, j) => v - mu[j]));
  const S = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => sum(Xc.map(f => f[i] * f[j])) / n));
  const { valores, vectores } = jacobi(S);
  const tot = sum(valores.filter(v => v > 0));
  const eig = valores.map(v => Math.max(0, v));
  // signo como el de la SVD de FactoMineR no es único; se fija para que la mayor carga sea positiva
  const vec = vectores.map(v => {
    const k = v.reduce((m, x, i) => (Math.abs(x) > Math.abs(v[m]) ? i : m), 0);
    return v[k] < 0 ? v.map(x => -x) : v;
  });
  const ind = Xc.map(f => vec.map(v => sum(f.map((x, j) => x * v[j]))));
  const varc = atributos.map((_, j) => vec.map((v, k) => v[j] * Math.sqrt(eig[k])));
  return { eig, pct: eig.map(v => (tot > 0 ? (100 * v) / tot : 0)), ind, var: varc, productos, atributos };
}

// agricolae::orderPvalue
export function letrasGrupos(trat, medias, alpha, Q) {
  const n = medias.length;
  const letras = [...'abcdefghijklmnopqrstuvwxyz', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'123456789', ...'.+-*/#$%&^[]:@;_?!=#'];
  const q = medias.map((_, i) => i).sort((a, b) => medias[b] - medias[a] || a - b);
  const M = new Array(n).fill('');
  const last = s => { const y = s.replace(/ +$/, ''); return y.slice(-1); };
  let k = 0, j = 0, cambio = n - 1, cambio1 = 0, chequeo = 0;
  M[0] = letras[k];
  while (j < n - 1) {
    chequeo++;
    if (chequeo > n) break;
    for (let i = j; i < n; i++) {
      const s = Q[q[i]][q[j]] > alpha;
      if (s) { if (last(M[i]) !== letras[k]) M[i] += letras[k]; }
      else {
        k++; cambio = i; cambio1 = 0; const ja = j;
        M[cambio] += letras[k];
        for (let v = ja; v <= cambio; v++) {
          if (Q[q[v]][q[cambio]] <= alpha) { j++; cambio1 = 1; } else break;
        }
        break;
      }
    }
    if (cambio1 === 0) j++;
  }
  return q.map((t, i) => ({ trat: trat[t], media: medias[t], grupo: M[i] }));
}

// LSD.test(aov(y ~ Producto), "Producto", p.adj = "bonferroni")$groups
export function lsdBonferroni(filas, at, alpha = 0.05) {
  const datos = filas.filter(f => typeof f[at] === 'number' && isFinite(f[at]));
  const trat = niveles(datos.map(f => f.Producto));
  const g = trat.map(t => datos.filter(f => f.Producto === t).map(f => f[at]));
  const medias = g.map(mean), nn = g.map(x => x.length);
  const N = datos.length, k = trat.length, df = N - k;
  const sce = sum(g.map((x, i) => sum(x.map(v => (v - medias[i]) ** 2))));
  const mse = sce / df;
  const npares = (k * (k - 1)) / 2;
  const Q = trat.map(() => new Array(k).fill(1));
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
    const sd = Math.sqrt(mse * (1 / nn[i] + 1 / nn[j]));
    let p = sd > 0 ? pt2(Math.abs(medias[i] - medias[j]) / sd, df) : (medias[i] === medias[j] ? 1 : 0);
    p = Math.min(1, p * npares);
    p = Math.round(p * 1e4) / 1e4;
    Q[i][j] = Q[j][i] = p;
  }
  return { grupos: letrasGrupos(trat, medias, alpha, Q), mse, df };
}

// estadísticos de geom_boxplot
export function caja(x) {
  const q1 = cuantil(x, 0.25), q2 = cuantil(x, 0.5), q3 = cuantil(x, 0.75), iqr = q3 - q1;
  const dentro = x.filter(v => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
  return {
    q1, q2, q3, min: Math.min(...dentro), max: Math.max(...dentro),
    atipicos: x.filter(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr),
  };
}
