// =====================================================================
// Gráficos en SVG con el aspecto de los de run_board() (ggplot2 / R base)
// =====================================================================
import { caja, ordenR } from './estadistica.js';

const FUENTE = 'Helvetica, Arial, sans-serif';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = v => Math.round(v * 100) / 100;

// ---------------------------------------------------------- colores: scales::hue_pal()
function hcl(h, c, l) {
  const WX = 95.047, WY = 100, WZ = 108.883;
  const hr = (h * Math.PI) / 180, U = c * Math.cos(hr), V = c * Math.sin(hr);
  if (l <= 0 && U === 0 && V === 0) return '#000000';
  const Y = WY * (l > 7.999592 ? Math.pow((l + 16) / 116, 3) : l / 903.3);
  const t = WX + WY + WZ, x = WX / t, y = WY / t;
  const uN = (2 * x) / (6 * y - x + 1.5), vN = (4.5 * y) / (6 * y - x + 1.5);
  const u = U / (13 * l) + uN, v = V / (13 * l) + vN;
  const X = (9 * Y * u) / (4 * v), Z = -X / 3 - 5 * Y + (3 * Y) / v;
  const g = t2 => { t2 /= 100; const s = t2 > 0.00304 ? 1.055 * Math.pow(t2, 1 / 2.4) - 0.055 : 12.92 * t2; return Math.round(255 * Math.min(1, Math.max(0, s))); };
  const R = g(3.240479 * X - 1.53715 * Y - 0.498535 * Z), G = g(-0.969256 * X + 1.875992 * Y + 0.041556 * Z), B = g(0.055648 * X - 0.204043 * Y + 1.057311 * Z);
  return '#' + [R, G, B].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function paletaHue(n) {
  if (n <= 0) return [];
  const h0 = 15, h1 = 375, hs = [];
  for (let i = 0; i < n; i++) hs.push(h0 + ((h1 - h0) * i) / n);
  return hs.map(h => hcl(h % 360, 100, 65));
}

// ---------------------------------------------------------- cortes "lindos" (labeling::extended simplificado)
export function cortes(min, max, m = 5) {
  if (!(max > min)) { const d = Math.abs(min) || 1; min -= d / 2; max += d / 2; }
  const Q = [1, 5, 2, 2.5, 4, 3], w = [0.25, 0.2, 0.5, 0.05];
  let mejor = null, mejorS = -Infinity;
  const rango = max - min;
  for (let qi = 0; qi < Q.length; qi++) {
    const q = Q[qi];
    for (let k = 2; k <= 9; k++) {
      const delta = rango / (k - 1);
      const z = Math.ceil(Math.log10(delta));
      for (let zz = z - 1; zz <= z + 1; zz++) {
        const paso = q * Math.pow(10, zz);
        const ini = Math.floor(min / paso) * paso, fin = Math.ceil(max / paso) * paso;
        const n = Math.round((fin - ini) / paso) + 1;
        if (n < 2 || n > 12) continue;
        // solo cortes dentro del rango
        const b = [];
        for (let i = 0; i < n; i++) { const v = ini + i * paso; if (v >= min - 1e-9 * paso && v <= max + 1e-9 * paso) b.push(Math.round(v / paso) * paso); }
        if (b.length < 2) continue;
        const simp = 1 - qi / (Q.length - 1) - 0 + (b.some(v => Math.abs(v) < 1e-12) ? 1 : 0);
        const cob = 1 - 0.5 * (((max - b[b.length - 1]) ** 2 + (min - b[0]) ** 2) / (0.1 * rango) ** 2);
        const dens = 2 - Math.max(b.length / m, m / b.length);
        const s = w[0] * simp + w[1] * cob + w[2] * dens + w[3];
        if (s > mejorS) { mejorS = s; mejor = b; }
      }
    }
  }
  return mejor || [min, max];
}
function etiquetas(b) {
  const paso = b.length > 1 ? Math.abs(b[1] - b[0]) : 1;
  const dec = Math.max(0, -Math.floor(Math.log10(paso) + 1e-9) + (Math.abs(paso / Math.pow(10, Math.floor(Math.log10(paso)))) % 1 ? 1 : 0));
  return b.map(v => (Math.abs(v) < 1e-12 ? 0 : v).toFixed(Math.min(dec, 6)));
}

// ancho aproximado de un texto (Helvetica) en px
function anchoTexto(s, px) {
  let w = 0;
  for (const ch of String(s)) w += /[ilI.,:;'|!]/.test(ch) ? 0.28 : /[mwMW]/.test(ch) ? 0.85 : /[A-Z]/.test(ch) ? 0.67 : /[0-9]/.test(ch) ? 0.556 : 0.52;
  return w * px;
}

// ---------------------------------------------------------- marco ggplot (theme_bw / theme_light)
// devuelve funciones de escala y el SVG de fondo, grilla y ejes
function marco({ x, y, w, h, xr, yr, xcortes, ycortes, xetq, yetq, tema = 'bw', xMinor = true, yMinor = true, xTitulo = '', yTitulo = '', titulo = '', tituloBold = false, ejeBold = false, ejeAlinear = 0.5 }) {
  const ink = tema === 'light' ? { borde: '#B3B3B3', grilla: '#DEDEDE', menor: '#EFEFEF', texto: '#4D4D4D', bordeW: 1.07 } : { borde: '#333333', grilla: '#EBEBEB', menor: '#F5F5F5', texto: '#4D4D4D', bordeW: 1.07 };
  const sx = v => x + ((v - xr[0]) / (xr[1] - xr[0])) * w;
  const sy = v => y + h - ((v - yr[0]) / (yr[1] - yr[0])) * h;
  let s = `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="#FFFFFF"/>`;
  const menores = c => { const o = []; for (let i = 0; i < c.length - 1; i++) o.push((c[i] + c[i + 1]) / 2); if (c.length > 1) { const d = c[1] - c[0]; o.unshift(c[0] - d / 2); o.push(c[c.length - 1] + d / 2); } return o; };
  if (xMinor && xcortes) for (const v of menores(xcortes)) if (v > xr[0] && v < xr[1]) s += `<line x1="${r2(sx(v))}" x2="${r2(sx(v))}" y1="${r2(y)}" y2="${r2(y + h)}" stroke="${ink.menor}" stroke-width="0.53"/>`;
  if (yMinor && ycortes) for (const v of menores(ycortes)) if (v > yr[0] && v < yr[1]) s += `<line y1="${r2(sy(v))}" y2="${r2(sy(v))}" x1="${r2(x)}" x2="${r2(x + w)}" stroke="${ink.menor}" stroke-width="0.53"/>`;
  for (const v of xcortes || []) s += `<line x1="${r2(sx(v))}" x2="${r2(sx(v))}" y1="${r2(y)}" y2="${r2(y + h)}" stroke="${ink.grilla}" stroke-width="1.07"/>`;
  for (const v of ycortes || []) s += `<line y1="${r2(sy(v))}" y2="${r2(sy(v))}" x1="${r2(x)}" x2="${r2(x + w)}" stroke="${ink.grilla}" stroke-width="1.07"/>`;
  const ejes = () => {
    let e = `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="none" stroke="${ink.borde}" stroke-width="${ink.bordeW}"/>`;
    (xcortes || []).forEach((v, i) => {
      e += `<line x1="${r2(sx(v))}" x2="${r2(sx(v))}" y1="${r2(y + h)}" y2="${r2(y + h + 2.74)}" stroke="#333333" stroke-width="1.07"/>`;
      e += `<text x="${r2(sx(v))}" y="${r2(y + h + 2.74 + 2.2 + 8.8 * 0.8)}" font-size="8.8" fill="${ink.texto}" text-anchor="middle">${esc(xetq[i])}</text>`;
    });
    (ycortes || []).forEach((v, i) => {
      e += `<line x1="${r2(x - 2.74)}" x2="${r2(x)}" y1="${r2(sy(v))}" y2="${r2(sy(v))}" stroke="#333333" stroke-width="1.07"/>`;
      e += `<text x="${r2(x - 2.74 - 2.2)}" y="${r2(sy(v) + 3.1)}" font-size="8.8" fill="${ink.texto}" text-anchor="end">${esc(yetq[i])}</text>`;
    });
    const fw = ejeBold ? ' font-weight="bold"' : '';
    const fs = ejeBold ? 10 : 11;
    if (xTitulo) {
      const ax = ejeAlinear === 1 ? x + w : x + w / 2, an = ejeAlinear === 1 ? 'end' : 'middle';
      e += `<text x="${r2(ax)}" y="${r2(y + h + 2.74 + 2.2 + 8.8 + 2.75 + fs * 0.8)}" font-size="${fs}"${fw} fill="#000000" text-anchor="${an}">${esc(xTitulo)}</text>`;
    }
    if (yTitulo) {
      const anchoY = Math.max(...(yetq || ['']).map(t => anchoTexto(t, 8.8)));
      const ay = ejeAlinear === 1 ? y : y + h / 2, an = ejeAlinear === 1 ? 'end' : 'middle';
      const xx = x - 2.74 - 2.2 - anchoY - 2.75 - fs * 0.25;
      e += `<text transform="translate(${r2(xx)},${r2(ay)}) rotate(-90)" font-size="${fs}"${fw} fill="#000000" text-anchor="${an}">${esc(yTitulo)}</text>`;
    }
    if (titulo) e += `<text x="${r2(x + w / 2)}" y="${r2(y - 6)}" font-size="${tituloBold ? 11 : 13.2}"${tituloBold ? ' font-weight="bold"' : ''} fill="#000000" text-anchor="middle">${esc(titulo)}</text>`;
    return e;
  };
  return { sx, sy, fondo: s, ejes };
}

const svgAbrir = (W, H) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FUENTE}" style="display:block;max-width:100%">`
  + `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`;

// ---------------------------------------------------------- Cajas
// ggplot(aes(Producto, Valor, label = Valuador)) + geom_boxplot() + geom_text(aes(color = Valuador)) + theme_bw()
export function graficoCajas(filas, atributo, rango, W = 800, H = 400) {
  const datos = filas.filter(f => typeof f[atributo] === 'number' && isFinite(f[atributo]));
  const prods = [...new Set(datos.map(f => f.Producto))].sort(ordenR);
  const vals = [...new Set(datos.map(f => f.Valuador))].sort(ordenR);
  const col = new Map(paletaHue(vals.length).map((c, i) => [vals[i], c]));
  const yc = []; for (let v = Math.ceil(rango[0]); v <= Math.floor(rango[1]); v++) yc.push(v);
  const exp = 0.05 * (rango[1] - rango[0]);
  const yr = [rango[0] - exp, rango[1] + exp];
  const anchoY = Math.max(...yc.map(v => anchoTexto(String(v), 8.8)));
  const izq = 5.5 + 11 + 2.75 + anchoY + 2.2 + 2.74;   // ylab("") deja el espacio del título
  const abajo = 5.5 + 11 + 2.75 + 8.8 + 2.2 + 2.74;
  const px = izq, py = 5.5, pw = W - izq - 5.5, ph = H - py - abajo;
  const n = prods.length || 1, xr = [0.4, n + 0.6];
  const m = marco({ x: px, y: py, w: pw, h: ph, xr, yr, xcortes: prods.map((_, i) => i + 1), xetq: prods, ycortes: yc, yetq: yc.map(String), xMinor: false, yMinor: true });
  let s = svgAbrir(W, H) + m.fondo;
  s += `<defs><clipPath id="cl-caja"><rect x="${px}" y="${py}" width="${pw}" height="${ph}"/></clipPath></defs><g clip-path="url(#cl-caja)">`;
  const bw = (0.75 / (xr[1] - xr[0])) * pw;
  prods.forEach((p, i) => {
    const x = datos.filter(f => f.Producto === p).map(f => f[atributo]);
    const c = caja(x), cx = m.sx(i + 1);
    s += `<line x1="${r2(cx)}" x2="${r2(cx)}" y1="${r2(m.sy(c.q3))}" y2="${r2(m.sy(c.max))}" stroke="#333333" stroke-width="1.07"/>`;
    s += `<line x1="${r2(cx)}" x2="${r2(cx)}" y1="${r2(m.sy(c.q1))}" y2="${r2(m.sy(c.min))}" stroke="#333333" stroke-width="1.07"/>`;
    s += `<rect x="${r2(cx - bw / 2)}" y="${r2(m.sy(c.q3))}" width="${r2(bw)}" height="${r2(Math.max(0, m.sy(c.q1) - m.sy(c.q3)))}" fill="#FFFFFF" stroke="#333333" stroke-width="1.07"/>`;
    s += `<line x1="${r2(cx - bw / 2)}" x2="${r2(cx + bw / 2)}" y1="${r2(m.sy(c.q2))}" y2="${r2(m.sy(c.q2))}" stroke="#333333" stroke-width="2.13"/>`;
    for (const o of c.atipicos) s += `<circle cx="${r2(cx)}" cy="${r2(m.sy(o))}" r="2.2" fill="#000000"/>`;
  });
  for (const f of datos) {
    const i = prods.indexOf(f.Producto);
    s += `<text x="${r2(m.sx(i + 1))}" y="${r2(m.sy(f[atributo]) + 3.9)}" font-size="11" fill="${col.get(f.Valuador)}" text-anchor="middle">${esc(f.Valuador)}</text>`;
  }
  s += '</g>' + m.ejes() + '</svg>';
  return s;
}

// ---------------------------------------------------------- Anova (agricolae::bar.group, R base)
export function graficoBarras(grupos, rango, W = 800, H = 400) {
  const n = grupos.length;
  const lin = 14.4;                      // 1 línea de margen = 0.2 pulgadas a 72 ppp
  const mar = { b: 5.1 * lin, l: 4.1 * lin, t: 4.1 * lin, r: 2.1 * lin };
  const pw = W - mar.l - mar.r, ph = H - mar.t - mar.b;
  const xl = [0.2, n * 1.2], dx = (xl[1] - xl[0]) * 0.04;
  const xr = [xl[0] - dx, xl[1] + dx];
  const dy = (rango[1] - rango[0]) * 0.04, yr = [rango[0] - dy, rango[1] + dy];
  const sx = v => mar.l + ((v - xr[0]) / (xr[1] - xr[0])) * pw;
  const sy = v => mar.t + ph - ((v - yr[0]) / (yr[1] - yr[0])) * ph;
  let s = svgAbrir(W, H);
  s += `<defs><pattern id="rayado" patternUnits="userSpaceOnUse" width="18" height="18" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="18" stroke="#BEBEBE" stroke-width="1.5"/></pattern><clipPath id="cl-bar"><rect x="${mar.l}" y="${mar.t}" width="${pw}" height="${ph}"/></clipPath></defs>`;
  const tope = Math.max(...grupos.map(g => g.media)) / 10;
  s += `<g clip-path="url(#cl-bar)">`;
  grupos.forEach((g, i) => {
    const x0 = 0.2 + i * 1.2, x1 = x0 + 1, y0 = 0, y1 = g.media;
    const X = sx(x0), Wd = sx(x1) - sx(x0), Y = sy(Math.max(y0, y1)), Hh = Math.abs(sy(y0) - sy(y1));
    s += `<rect x="${r2(X)}" y="${r2(Y)}" width="${r2(Wd)}" height="${r2(Hh)}" fill="url(#rayado)" stroke="#000000" stroke-width="1"/>`;
  });
  s += '</g>';
  grupos.forEach((g, i) => {
    const cx = sx(0.2 + i * 1.2 + 0.5);
    const yy = g.media < 0 ? Math.abs(tope) : g.media + tope;
    s += `<text x="${r2(cx)}" y="${r2(sy(yy) + 4.3)}" font-size="12" text-anchor="middle" fill="#000000">${esc(g.grupo)}</text>`;
    s += `<text x="${r2(cx)}" y="${r2(mar.t + ph + lin * 1 + 8.4 * 0.75)}" font-size="8.4" text-anchor="middle" fill="#000000">${esc(g.trat)}</text>`;
  });
  // eje y (axis(2)): pretty(), etiquetas paralelas al eje
  const yc = cortesR(rango[0], rango[1]);
  const ex = mar.l;
  s += `<line x1="${r2(ex)}" x2="${r2(ex)}" y1="${r2(sy(yc[0]))}" y2="${r2(sy(yc[yc.length - 1]))}" stroke="#000000" stroke-width="1"/>`;
  for (const v of yc) {
    s += `<line x1="${r2(ex - 7.2)}" x2="${r2(ex)}" y1="${r2(sy(v))}" y2="${r2(sy(v))}" stroke="#000000" stroke-width="1"/>`;
    s += `<text transform="translate(${r2(ex - lin * 1 - 2)},${r2(sy(v))}) rotate(-90)" font-size="12" text-anchor="middle" fill="#000000">${v}</text>`;
  }
  return s + '</svg>';
}
// base::pretty
function cortesR(a, b, n = 5) {
  const d = (b - a) / n, p = Math.pow(10, Math.floor(Math.log10(d)));
  const u = [1, 2, 5, 10].find(k => k * p >= d * 0.999) * p;
  const o = []; for (let v = Math.ceil(a / u - 1e-9) * u; v <= b + 1e-9; v += u) o.push(Math.round(v / u) * u);
  return o;
}

// ---------------------------------------------------------- ACP (FactoMineR::plot.PCA, ggplot) dos gráficos lado a lado
function graficoIndividuos(r, W, H, ox) {
  const c = r.ind.map(f => [f[0], f[1] || 0]);
  let xmin = Math.min(0, ...c.map(v => v[0])), xmax = Math.max(0, ...c.map(v => v[0]));
  let ymin = Math.min(0, ...c.map(v => v[1])), ymax = Math.max(0, ...c.map(v => v[1]));
  let xl = [xmin, xmax], yl = [ymin, ymax];
  const ex = (l, f) => { const m = (l[0] + l[1]) / 2; return [(l[0] - m) * f + m, (l[1] - m) * f + m]; };
  xl = ex(xl, 1.2); yl = ex(yl, 1.2);
  const dX = xl[1] - xl[0] || 1, dY = yl[1] - yl[0] || 1;
  if (dX / dY > 3) yl = ex(yl, dX / dY / 3);
  if (dX / dY < 1 / 2) xl = ex(xl, dY / dX / 2);
  return plano(W, H, ox, xl, yl, 'PCA graph of individuals', r, (m, s) => {
    for (let i = 0; i < c.length; i++) {
      const [x, y] = c[i];
      s += `<circle cx="${r2(m.sx(x))}" cy="${r2(m.sy(y))}" r="2.1" fill="#000000"/>`;
      m.etq.push([m.sx(x), m.sy(y), x >= 0, y >= 0, r.productos[i]]);
    }
    return s;
  }, false);
}
function graficoVariables(r, W, H, ox) {
  const c = r.var.map(f => [f[0], f[1] || 0]);
  let xl = [Math.min(-1, ...c.map(v => v[0])), Math.max(1, ...c.map(v => v[0]))];
  let yl = [Math.min(-1, ...c.map(v => v[1])), Math.max(1, ...c.map(v => v[1]))];
  return plano(W, H, ox, xl, yl, 'PCA graph of variables', r, (m, s) => {
    let pts = '';
    for (let k = 0; k <= 100; k++) { const a = (2 * Math.PI * k) / 99; pts += `${r2(m.sx(Math.cos(a)))},${r2(m.sy(Math.sin(a)))} `; }
    s += `<polyline points="${pts}" fill="none" stroke="#000000" stroke-width="1.07"/>`;
    for (let i = 0; i < c.length; i++) {
      const [x, y] = c[i], X = m.sx(x), Y = m.sy(y), X0 = m.sx(0), Y0 = m.sy(0);
      const ang = Math.atan2(Y - Y0, X - X0), L = 5.67;
      s += `<line x1="${r2(X0)}" y1="${r2(Y0)}" x2="${r2(X)}" y2="${r2(Y)}" stroke="#000000" stroke-width="1.07"/>`;
      s += `<polyline points="${r2(X - L * Math.cos(ang - 0.52))},${r2(Y - L * Math.sin(ang - 0.52))} ${r2(X)},${r2(Y)} ${r2(X - L * Math.cos(ang + 0.52))},${r2(Y - L * Math.sin(ang + 0.52))}" fill="none" stroke="#000000" stroke-width="1.07"/>`;
      m.etq.push([X, Y, x >= 0, y >= 0, r.atributos[i]]);
    }
    return s;
  }, true);
}
function plano(W, H, ox, xl, yl, titulo, r, dibujar, esVar) {
  // escala con expansión 5 % y coord_fixed(1)
  const e = (l) => { const d = (l[1] - l[0]) * 0.05; return [l[0] - d, l[1] + d]; };
  let xr = e(xl), yr = e(yl);
  const xc = cortes(xl[0], xl[1]), yc = cortes(yl[0], yl[1]);
  const xe = etiquetas(xc), ye = etiquetas(yc);
  const anchoY = Math.max(...ye.map(t => anchoTexto(t, 8.8)));
  const izq = 5.5 + 10 + 2.75 + anchoY + 2.2 + 2.74, der = 5.5;
  const arr = 5.5 + 11 + 6, abajo = 5.5 + 10 + 2.75 + 8.8 + 2.2 + 2.74;
  const aw = W - izq - der, ah = H - arr - abajo;
  const rx = xr[1] - xr[0], ry = yr[1] - yr[0];
  let pw = aw, ph = (aw * ry) / rx;
  if (ph > ah) { ph = ah; pw = (ah * rx) / ry; }
  const px = ox + izq + (aw - pw) / 2, py = arr + (ah - ph) / 2;
  const lx = `Dim 1 (${r.pct[0].toFixed(2)}%)`, ly = `Dim 2 (${(r.pct[1] || 0).toFixed(2)}%)`;
  const m = marco({ x: px, y: py, w: pw, h: ph, xr, yr, xcortes: xc, xetq: xe, ycortes: yc, yetq: ye, tema: 'light', xTitulo: lx, yTitulo: ly, titulo, tituloBold: true, ejeBold: true, ejeAlinear: 1 });
  const id = 'cl' + Math.round(ox) + (esVar ? 'v' : 'i');
  let s = m.fondo + `<defs><clipPath id="${id}"><rect x="${r2(px)}" y="${r2(py)}" width="${r2(pw)}" height="${r2(ph)}"/></clipPath></defs><g clip-path="url(#${id})">`;
  const l0 = esVar ? [-1, 1] : [xr[0], xr[1]], l1 = esVar ? [-1, 1] : [yr[0], yr[1]];
  s += `<line x1="${r2(m.sx(l0[0]))}" x2="${r2(m.sx(l0[1]))}" y1="${r2(m.sy(0))}" y2="${r2(m.sy(0))}" stroke="#000000" stroke-width="1.07" stroke-dasharray="4.3,4.3"/>`;
  s += `<line x1="${r2(m.sx(0))}" x2="${r2(m.sx(0))}" y1="${r2(m.sy(l1[0]))}" y2="${r2(m.sy(l1[1]))}" stroke="#000000" stroke-width="1.07" stroke-dasharray="4.3,4.3"/>`;
  m.etq = [];
  s = dibujar(m, s) + '</g>';
  // etiquetas dentro del panel, sin pisarse (aproximación a ggrepel)
  const puestas = [];
  for (const [X, Y, der, arriba, t] of m.etq) {
    const tw = anchoTexto(t, 11.4), th = 11.4;
    let lx = der ? X + 3 : X - 3 - tw, ly = arriba ? Y - 4 : Y + 12;
    lx = Math.min(Math.max(lx, px + 2), px + pw - 2 - tw);
    for (let k = 0; k < 8 && puestas.some(q => lx < q[0] + q[2] && lx + tw > q[0] && ly - th < q[1] && ly > q[1] - th); k++) ly += arriba ? -th : th;
    ly = Math.min(Math.max(ly, py + th), py + ph - 2);
    puestas.push([lx, ly, tw]);
    s += `<text x="${r2(lx)}" y="${r2(ly)}" font-size="11.4" fill="#000000">${esc(t)}</text>`;
  }
  return s + m.ejes();
}
export function graficoACP(r, W = 800, H = 400) {
  const w = W / 2;
  return svgAbrir(W, H) + graficoIndividuos(r, w, H, 0) + graficoVariables(r, w, H, w) + '</svg>';
}

// ---------------------------------------------------------- Radar (ggradar)
export function graficoRadar(productos, atributos, valores, rango, W = 800, H = 400) {
  const gmin = rango[0], gmax = rango[1], gmid = 0.5;   // ggradar: grid.mid = 0.5 por defecto
  const centro = gmin - (1 / 9) * (gmax - gmin);
  const n = atributos.length;
  const leyW = 30 + Math.max(...productos.map(p => anchoTexto(p, 14.2)), 0) + 20;
  const aw = W - leyW, cxp = aw / 2, cyp = H / 2;
  const radioMax = Math.min(aw, H) / 2 - 34;
  const R = v => ((v - centro) / (gmax - centro)) * radioMax;
  const ang = i => Math.PI / 2 - (2 * Math.PI * i) / n;
  const pt = (i, v) => [cxp + R(v) * Math.cos(ang(i)), cyp - R(v) * Math.sin(ang(i))];
  const col = paletaHue(productos.length);
  let s = svgAbrir(W, H);
  s += `<circle cx="${cxp}" cy="${cyp}" r="${r2(R(gmax))}" fill="#D7D6D1" fill-opacity="0.2" stroke="none"/>`;
  const circ = (v, c) => `<circle cx="${cxp}" cy="${cyp}" r="${r2(Math.max(0, R(v)))}" fill="none" stroke="${c}" stroke-width="1.07" stroke-dasharray="8.5,4.3"/>`;
  s += circ(gmin, 'grey') + circ(gmid, '#007A87') + circ(gmax, 'grey');
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(i, gmax * 1.0);
    s += `<line x1="${cxp}" y1="${cyp}" x2="${r2(x)}" y2="${r2(y)}" stroke="grey" stroke-width="1.07"/>`;
    const [lx, ly] = pt(i, gmax + (gmax - centro) * 0.15);
    const c = Math.cos(ang(i)), an = Math.abs(c) < 0.05 ? 'middle' : c > 0 ? 'start' : 'end';
    s += `<text x="${r2(lx)}" y="${r2(ly + 5)}" font-size="14.2" fill="#000000" text-anchor="${an}">${esc(atributos[i])}</text>`;
  }
  productos.forEach((p, k) => {
    const ps = atributos.map((a, i) => pt(i, valores[a][k]));
    s += `<polygon points="${ps.map(q => q.map(r2).join(',')).join(' ')}" fill="none" stroke="${col[k]}" stroke-width="3.2"/>`;
    for (const q of ps) s += `<circle cx="${r2(q[0])}" cy="${r2(q[1])}" r="8.5" fill="${col[k]}"/>`;
  });
  // leyenda
  const ly0 = cyp - (productos.length * 24) / 2;
  productos.forEach((p, k) => {
    const y = ly0 + k * 24 + 12, x = aw + 10;
    s += `<line x1="${x}" x2="${x + 22}" y1="${y}" y2="${y}" stroke="${col[k]}" stroke-width="3.2"/><circle cx="${x + 11}" cy="${y}" r="6" fill="${col[k]}"/>`;
    s += `<text x="${x + 30}" y="${y + 5}" font-size="14.2" fill="#000000">${esc(p)}</text>`;
  });
  return s + '</svg>';
}

// ---------------------------------------------------------- QR (como qr_gen() del tablero: teselas negras)
export function graficoQR(texto, W = 150) {
  /* global qrcode */
  const q = qrcode(0, 'M');
  q.addData(texto);
  q.make();
  const n = q.getModuleCount(), t = W / n;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" style="display:block;max-width:100%;height:auto">`;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) s += `<rect x="${r2(c * t)}" y="${r2(r * t)}" width="${r2(t + 0.3)}" height="${r2(t + 0.3)}" fill="#333333"/>`;
  return s + '</svg>';
}
