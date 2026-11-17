// =====================================================================
// Versión de prueba de datos.js (se activa con ?demo en la dirección).
// Guarda todo en este navegador (localStorage); no usa Firebase. Sirve para probar sin tocar datos reales.
// =====================================================================
const K = 'panel_demo_v1';
const leer = () => { try { return JSON.parse(localStorage.getItem(K)) || { paneles: {} }; } catch (e) { return { paneles: {} }; } };
const escribir = s => { localStorage.setItem(K, JSON.stringify(s)); oyentes.forEach(f => f()); };
const oyentes = new Set();
window.addEventListener('storage', e => { if (e.key === K) oyentes.forEach(f => f()); });
const ahora = () => ({ seconds: Math.floor(Date.now() / 1000) });
export let config = { firebase: {} };

export async function iniciar() {
  const s = leer();
  if (!Object.keys(s.paneles).length) {
    const at = [{ Nombre: 'Intensidad de color', Valores: 'Numeric' }, { Nombre: 'Matiz violeta', Valores: 'Numeric' }, { Nombre: 'Matiz rojo', Valores: 'Numeric' }];
    const vinos = [['Casarena 2', '528'], ['Terrazas_8 2', '420'], ['Durigutti 2', '266'], ['Weinert B', '489']];
    const filas = [];
    for (let v = 1; v <= 4; v++) vinos.forEach((w, i) => {
      const k = (i + v) % vinos.length;
      filas.push({ Valuador: 'V' + v, Orden: i + 1, Muestra: String(k + 1), NombreProducto: vinos[k][0], CodigoProducto: vinos[k][1], CodigoMuestra: 'M' + (100 + v * 10 + i), Etiqueta: vinos[k][1] });
    });
    s.paneles.demo1 = { panel: { nombre: 'Panel de prueba', activo: true, dueno: 'demo@demo', atributos: at, etiqueta: 'Copa', mostrar: 'CodigoProducto', rango: [0, 10], paso: 0.01, azar: false, panelistas: ['V1', 'V2', 'V3', 'V4'], nMuestras: filas.length, creado: ahora() }, filas, respuestas: {}, progreso: {} };
    escribir(s);
  }
}
const get = p => leer().paneles[p];
export async function panelesActivos() { return Object.entries(leer().paneles).filter(([, v]) => v.panel.activo).map(([id, v]) => ({ id, ...v.panel })); }
export async function leerPanel(p) { const x = get(p); return x ? { id: p, ...x.panel } : null; }
export async function disenoPublico(p) { return (get(p)?.filas || []).map(({ Valuador, Orden, Etiqueta }) => ({ Valuador, Orden, Etiqueta })); }
export async function disenoPrivado(p) { return get(p)?.filas || []; }
export async function leerProgreso(p, v) { return get(p)?.progreso[v] || []; }
export async function guardarRespuesta(p, r) {
  const s = leer(), x = s.paneles[p];
  x.respuestas[`${r.Valuador}_${r.Orden}`] = { ...r, ts: ahora(), tsCliente: new Date().toISOString() };
  x.progreso[r.Valuador] = [...new Set([...(x.progreso[r.Valuador] || []), r.Orden])];
  escribir(s);
}
export async function observarSesion(cb) { cb({ email: 'demo@demo', nombre: 'Demo', rol: 'super' }); return () => {}; }
export async function entrar() {}
export async function salir() {}
function observar(f) { f(); oyentes.add(f); return () => oyentes.delete(f); }
export function observarPaneles(cb) {
  return observar(() => cb(Object.entries(leer().paneles).map(([id, v]) => ({ id, ...v.panel }))
    .sort((a, b) => b.creado.seconds - a.creado.seconds || (a.id < b.id ? 1 : -1))));
}
export function observarProgresos(p, cb) { return observar(() => cb({ ...(get(p)?.progreso || {}) })); }
export function observarRespuestas(p, cb) { return observar(() => cb(Object.values(get(p)?.respuestas || {}))); }
export async function leerRespuestas(p) { return Object.values(get(p)?.respuestas || {}); }
export async function crearPanel(email, datos, filas) {
  const s = leer(), id = 'p' + Date.now().toString(36);
  s.paneles[id] = { panel: { ...datos, dueno: email, activo: true, creado: ahora() }, filas, respuestas: {}, progreso: {} };
  escribir(s); return id;
}
export async function actualizarPanel(p, c) { const s = leer(); Object.assign(s.paneles[p].panel, c); escribir(s); }
export async function borrarDatos(p) { const s = leer(); s.paneles[p].respuestas = {}; s.paneles[p].progreso = {}; escribir(s); }
export async function borrarPanel(p) { const s = leer(); delete s.paneles[p]; escribir(s); }
