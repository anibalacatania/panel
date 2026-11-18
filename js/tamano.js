// =====================================================================
// Tamaño de los documentos según las reglas de Firestore
// (https://firebase.google.com/docs/firestore/storage-size):
//   texto = bytes UTF-8 + 1 · número, fecha = 8 · booleano, nulo = 1 · lista/mapa = suma de su contenido
//   nombre del documento = suma de los segmentos de la ruta + 16 · documento = nombre + campos + 32
//   entrada de índice = nombre del documento + nombre del campo + valor + 32 (cada campo se indexa
//   ascendente y descendente; cada elemento de una lista, una vez más para array-contains)
// =====================================================================
const enc = new TextEncoder();
const texto = s => enc.encode(String(s)).length + 1;

function valor(v) {
  if (v === null || v === undefined) return 1;
  if (typeof v === 'string') return texto(v);
  if (typeof v === 'number') return 8;
  if (typeof v === 'boolean') return 1;
  if (v instanceof Date || typeof v?.toMillis === 'function' || (typeof v === 'object' && 'seconds' in v && 'nanoseconds' in v)) return 8;
  if (Array.isArray(v)) return v.reduce((s, x) => s + valor(x), 0);
  if (typeof v === 'object') return Object.entries(v).reduce((s, [k, x]) => s + texto(k) + valor(x), 0);
  return 8;
}

export const nombreDoc = ruta => ruta.reduce((s, seg) => s + texto(seg), 0) + 16;

// devuelve { doc, indices } en bytes
export function tamanoDoc(ruta, datos) {
  const nombre = nombreDoc(ruta);
  const doc = nombre + Object.entries(datos || {}).reduce((s, [k, v]) => s + texto(k) + valor(v), 0) + 32;
  let indices = 0;
  const recorrer = (camino, v) => {
    const campo = texto(camino);
    if (Array.isArray(v)) {
      indices += 2 * (nombre + campo + valor(v) + 32);
      for (const x of v) indices += nombre + campo + valor(x) + 32;
    } else if (v && typeof v === 'object' && !(typeof v.toMillis === 'function') && !('seconds' in v && 'nanoseconds' in v)) {
      for (const [k, x] of Object.entries(v)) recorrer(camino + '.' + k, x);
    } else {
      indices += 2 * (nombre + campo + valor(v) + 32);
    }
  };
  for (const [k, v] of Object.entries(datos || {})) recorrer(k, v);
  return { doc, indices };
}

export const LIMITES = { almacenamiento: 1024 ** 3, lecturas: 50000, escrituras: 20000, borrados: 20000 };

// comienzo del día de cuota: medianoche del Pacífico (ahí se reinician las cuotas gratuitas)
export function inicioDiaPacifico(ahora = new Date()) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(ahora).map(x => [x.type, x.value]));
  const transcurrido = ((+p.hour * 60 + +p.minute) * 60 + +p.second) * 1000 + ahora.getMilliseconds();
  return new Date(ahora.getTime() - transcurrido);
}
