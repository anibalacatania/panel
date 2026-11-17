// =====================================================================
// Lectura de los .csv de diseño y atributos, y exportación de resultados
// =====================================================================

// lee un archivo como texto: UTF-8 o, si no lo es, Windows-1252 (Excel en español)
export async function leerTexto(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}

// CSV con comillas; separador ',' o ';' (se detecta en la primera línea)
export function parsearCSV(texto) {
  const primera = texto.split(/\r?\n/)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let f = [], c = '', q = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (q) {
      if (ch === '"') { if (texto[i + 1] === '"') { c += '"'; i++; } else q = false; }
      else c += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { f.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      f.push(c); c = '';
      if (f.some(x => x.trim() !== '')) filas.push(f);
      f = [];
    } else c += ch;
  }
  f.push(c);
  if (f.some(x => x.trim() !== '')) filas.push(f);
  if (!filas.length) return { columnas: [], filas: [] };
  const columnas = filas[0].map(s => s.trim());
  return {
    columnas,
    filas: filas.slice(1).map(r => Object.fromEntries(columnas.map((k, i) => [k, (r[i] ?? '').trim()]))),
  };
}

const busca = (cols, nombre) => cols.find(c => c.toLowerCase() === nombre.toLowerCase());

// sample(1000) - 1 de R: códigos al azar sin repetir
function codigos(n, prefijo, usados = new Set()) {
  const max = n + usados.size > 900 ? 10000 : 1000;
  const pool = [];
  for (let i = 0; i < max; i++) if (!usados.has(prefijo + i)) pool.push(prefijo + i);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}

// Diseño: Valuador, Muestra, NombreProducto, CodigoProducto [, CodigoMuestra]
export function armarDiseno(csv, mostrar) {
  const errores = [], avisos = [];
  const cV = busca(csv.columnas, 'Valuador'), cM = busca(csv.columnas, 'Muestra');
  const cN = busca(csv.columnas, 'NombreProducto'), cP = busca(csv.columnas, 'CodigoProducto'), cC = busca(csv.columnas, 'CodigoMuestra');
  if (!cV) errores.push('Falta la columna "Valuador".');
  if (!cM && !cN) errores.push('Falta la columna "Muestra" (o "NombreProducto").');
  if (errores.length) return { errores, avisos, filas: [] };
  const base = csv.filas.filter(r => r[cV] !== '');
  // códigos de producto: del archivo, o al azar por muestra (como run_panel)
  const muestras = [...new Set(base.map(r => r[cM] || r[cN]))];
  let codP = {};
  if (!cP) {
    const c = codigos(muestras.length, 'P');
    muestras.forEach((m, i) => { codP[m] = c[i]; });
    avisos.push('El diseño no tiene "CodigoProducto": se generaron códigos al azar (P…).');
  }
  const codM = cC ? null : codigos(base.length, 'M');
  const orden = {};
  const filas = base.map((r, i) => {
    const Valuador = r[cV];
    orden[Valuador] = (orden[Valuador] || 0) + 1;
    const Muestra = r[cM] || r[cN];
    const f = {
      Valuador, Orden: orden[Valuador], Muestra,
      NombreProducto: (cN && r[cN]) || ('Muestra ' + Muestra),
      CodigoProducto: (cP && r[cP]) || codP[Muestra],
      CodigoMuestra: (cC && r[cC]) || codM[i],
    };
    f.Etiqueta = String(f[mostrar] ?? f.CodigoProducto);
    return f;
  });
  for (const f of filas) {
    for (const k of ['Valuador', 'Muestra', 'NombreProducto', 'CodigoProducto', 'CodigoMuestra']) {
      if (String(f[k]).includes('|')) errores.push(`El valor "${f[k]}" no puede tener el carácter |.`);
    }
    if (/[\/]/.test(f.Valuador) || f.Valuador.length > 40) errores.push(`Nombre de valuador no válido: "${f.Valuador}" (sin / y hasta 40 caracteres).`);
  }
  const vals = [...new Set(filas.map(f => f.Valuador))];
  for (const v of vals) {
    const et = filas.filter(f => f.Valuador === v).map(f => f.Etiqueta);
    if (new Set(et).size !== et.length) errores.push(`El valuador ${v} tiene dos muestras con la misma etiqueta (${mostrar}); el panelista no podría distinguirlas.`);
  }
  if (filas.length > 2000) errores.push('El diseño tiene más de 2000 filas.');
  return { errores: [...new Set(errores)].slice(0, 10), avisos, filas, valuadores: vals, muestras };
}

// Atributos: Nombre, Valores ∈ {Numeric, Check, Text}
export function armarAtributos(csv) {
  const errores = [];
  const cN = busca(csv.columnas, 'Nombre'), cV = busca(csv.columnas, 'Valores');
  if (!cN) errores.push('Falta la columna "Nombre".');
  if (errores.length) return { errores, atributos: [] };
  const atributos = csv.filas.filter(r => r[cN]).map(r => {
    let Valores = (cV && r[cV]) || 'Numeric';
    const tipo = Valores.split(/[:,]/)[0].trim();
    const t = ['Numeric', 'Check', 'Text'].find(x => x.toLowerCase() === tipo.toLowerCase());
    if (!t) errores.push(`"${r[cN]}": Valores debe ser Numeric, Check o Text (dice "${Valores}").`);
    return { Nombre: r[cN], Valores: t || Valores };
  });
  const nombres = atributos.map(a => a.Nombre);
  if (new Set(nombres).size !== nombres.length) errores.push('Hay atributos repetidos.');
  if (!atributos.length) errores.push('No hay atributos.');
  if (atributos.length > 100) errores.push('Hay más de 100 atributos.');
  return { errores, atributos };
}

// ---------------------------------------------------------------- resultados
// une respuestas con el diseño privado: una fila por muestra evaluada
export function tablaRespuestas(respuestas, privado, atributos) {
  const mapa = new Map(privado.map(f => [`${f.Valuador}_${f.Orden}`, f]));
  return respuestas.map(r => {
    const d = mapa.get(`${r.Valuador}_${r.Orden}`) || {};
    const o = {
      Producto: d.NombreProducto ?? r.Etiqueta, Valuador: r.Valuador, Muestra: d.Muestra ?? '',
      CodigoProducto: d.CodigoProducto ?? '', CodigoMuestra: d.CodigoMuestra ?? '', Orden: r.Orden,
      Fecha: r.tsCliente || '',
    };
    for (const a of atributos) o[a.Nombre] = r.valores?.[a.Nombre];
    return o;
  });
}

const campoCSV = (v, sep, dec) => {
  if (v === undefined || v === null || v === '') return 'NA';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return dec === ',' ? String(v).replace('.', ',') : String(v);
  const s = String(v);
  return /["\n\r]/.test(s) || s.includes(sep) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export function aCSV(filas, columnas, { sep = ',', dec = '.' } = {}) {
  return [columnas.map(c => campoCSV(c, sep, dec)).join(sep),
    ...filas.map(f => columnas.map(c => campoCSV(f[c], sep, dec)).join(sep))].join('\n') + '\n';
}

export function descargar(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ZIP sin compresión (para la carpeta Answers/ de run_board)
const tablaCRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = tablaCRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zip(archivos) {
  const enc = new TextEncoder(), partes = [], central = [];
  let off = 0;
  const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const { nombre, texto } of archivos) {
    const nb = enc.encode(nombre), datos = enc.encode(texto), crc = crc32(datos);
    const cab = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(datos.length), ...u32(datos.length), ...u16(nb.length), ...u16(0)];
    partes.push(new Uint8Array(cab), nb, datos);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(datos.length), ...u32(datos.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
    off += cab.length + nb.length + datos.length;
  }
  const tamC = central.reduce((s, x) => s + x.length, 0);
  const fin = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(archivos.length), ...u16(archivos.length), ...u32(tamC), ...u32(off), ...u16(0)]);
  return new Blob([...partes, ...central, fin], { type: 'application/zip' });
}
