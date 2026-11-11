// Imitación en memoria de datos.js, SOLO para pruebas automáticas (no se publica).
// Reproduce las reglas de seguridad principales para que las pruebas las ejerzan.
// el estado se guarda en localStorage para sobrevivir a recargas de página durante las pruebas
const guardado = (() => { try { return JSON.parse(localStorage.getItem('__falso') || 'null'); } catch { return null; } })();
const st = (window.__falso = window.__falso || guardado || {
  docs: {}, usuario: null, latencia: 30,
  error: null, // si se define, las escrituras de panelistas fallan con ese código
});
const persistir = () => { try { localStorage.setItem('__falso', JSON.stringify(st)); } catch {} };
const clon = x => JSON.parse(JSON.stringify(x));
const dormir = ms => new Promise(r => setTimeout(r, ms));
const g = p => (st.docs[p] ? clon(st.docs[p]) : null);
const s = (p, v) => { st.docs[p] = clon(v); notificar(p); };
const del = p => { delete st.docs[p]; notificar(p); };
const subs = new Set();
function notificar() { persistir(); subs.forEach(f => f()); }
const esAdmin = () => !!(st.usuario && st.docs['admins/' + st.usuario.email]);
const denegar = () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; };

export async function iniciar() { await dormir(5); }

const limpiar = (id, d) => ({ id, nombre: d.nombre, tecnica: d.tecnica || 'descriptiva', activo: !!d.activo,
  atributos: d.atributos || [], sesiones: d.sesiones || [], panelistas: d.panelistas || [], creado: d.creado || null });

export async function estudiosActivos() {
  await dormir(st.latencia);
  return Object.keys(st.docs).filter(k => /^estudios\/[^/]+$/.test(k) && st.docs[k].activo)
    .map(k => limpiar(k.split('/')[1], st.docs[k]));
}
export async function disenoPublico(eid) {
  await dormir(st.latencia);
  const d = g(`estudios/${eid}/publico/diseno`);
  return (d ? d.filas : []).map(t => { const [Sesion, Valuador, Orden, CodigoProducto] = t.split('|'); return { Sesion, Valuador, Orden: Number(Orden), CodigoProducto }; });
}
export function observarProgreso(eid, v, cb) {
  const f = () => cb(g(`estudios/${eid}/progreso/${v}`) || {}, pendientes > 0);
  subs.add(f); setTimeout(f, 0); return () => subs.delete(f);
}
let pendientes = 0; const oyentes = new Set();
const avisar = () => oyentes.forEach(f => f(pendientes));
export function suscribirPendientes(cb) { oyentes.add(cb); cb(pendientes); return () => oyentes.delete(cb); }
export function guardarRespuesta(eid, r) {
  pendientes++; avisar();
  return (async () => {
    await dormir(st.latencia);
    if (st.error) { const e = new Error(st.error); e.code = st.error; throw e; }
    const est = g(`estudios/${eid}`);
    if (!est || !est.activo) denegar();
    const ks = Object.keys(r).sort().join();
    if (ks !== 'CodigoProducto,Orden,Sesion,Valuador,valores') denegar();
    s(`estudios/${eid}/respuestas/${r.Valuador}_${r.Sesion}_${r.Orden}`, { ...r, ts: new Date().toISOString() });
    const p = g(`estudios/${eid}/progreso/${r.Valuador}`) || {};
    p[r.Sesion] = [...new Set([...(p[r.Sesion] || []), r.Orden])];
    s(`estudios/${eid}/progreso/${r.Valuador}`, p);
  })().finally(() => { pendientes--; avisar(); notificar(); });
}

let oyUsuario = null;
export function observarUsuario(cb) { oyUsuario = cb; setTimeout(() => cb(st.usuario), 0); return () => { oyUsuario = null; }; }
export async function entrarConGoogle() { st.usuario = st.proximoUsuario || { email: 'admin@prueba.test' }; persistir(); oyUsuario && oyUsuario(st.usuario); }
export async function salir() { st.usuario = null; persistir(); oyUsuario && oyUsuario(null); }
export async function rolAdmin() {
  if (!st.usuario) return 'no';
  if (esAdmin()) return 'admin';
  return st.docs['meta/setup'] ? 'no' : 'registrable';
}
export async function registrarPrimerAdmin() {
  if (st.docs['meta/setup']) denegar();
  s('admins/' + st.usuario.email, { email: st.usuario.email }); s('meta/setup', { listo: true });
}
export async function listarAdmins() { if (!esAdmin()) denegar(); return Object.keys(st.docs).filter(k => k.startsWith('admins/')).map(k => k.slice(7)).sort(); }
export async function agregarAdmin(e) { if (!esAdmin()) denegar(); s('admins/' + e.trim().toLowerCase(), { email: e }); }
export async function quitarAdmin(e) { if (!esAdmin() || e === st.usuario.email) denegar(); del('admins/' + e); }
export async function listarEstudios() {
  return Object.keys(st.docs).filter(k => /^estudios\/[^/]+$/.test(k)).map(k => limpiar(k.split('/')[1], st.docs[k]))
    .sort((a, b) => String(b.creado).localeCompare(String(a.creado)));
}
export async function leerEstudio(eid) { const d = g('estudios/' + eid); return d ? limpiar(eid, d) : null; }
let n = 0;
export async function crearEstudio(est) {
  if (!esAdmin()) denegar();
  const id = 'est' + (++n) + '_' + Date.now().toString(36);
  s(`estudios/${id}`, { nombre: est.nombre, tecnica: 'descriptiva', activo: true, atributos: est.atributos,
    sesiones: est.sesiones.map(x => ({ Sesion: x.Sesion, NMuestras: x.NMuestras })), panelistas: est.panelistas, creado: new Date().toISOString() });
  s(`estudios/${id}/publico/diseno`, { filas: est.diseno.map(d => `${d.Sesion}|${d.Valuador}|${d.Orden}|${d.CodigoProducto}`) });
  s(`estudios/${id}/privado/diseno`, { filas: est.diseno.map(d => `${d.Sesion}|${d.Valuador}|${d.Orden}|${d.CodigoProducto}|${d.NombreProducto}|${d.Rep}`),
    sesiones: est.sesiones.map(x => ({ Sesion: x.Sesion, Vinos: x.Vinos })), parametros: est.parametros || {} });
  return id;
}
export async function actualizarEstudio(eid, c) { if (!esAdmin()) denegar(); s('estudios/' + eid, { ...g('estudios/' + eid), ...c }); }
export async function disenoPrivado(eid) {
  if (!esAdmin()) denegar();
  const x = g(`estudios/${eid}/privado/diseno`) || { filas: [], sesiones: [], parametros: {} };
  return { filas: x.filas.map(t => { const [Sesion, Valuador, Orden, CodigoProducto, NombreProducto, Rep] = t.split('|'); return { Sesion, Valuador, Orden: Number(Orden), CodigoProducto, NombreProducto, Rep: Number(Rep) }; }), sesiones: x.sesiones, parametros: x.parametros };
}
export function observarProgresoEstudio(eid, cb) {
  const f = () => { const out = {}; Object.keys(st.docs).forEach(k => { const m = k.match(new RegExp(`^estudios/${eid}/progreso/([^/]+)$`)); if (m) out[m[1]] = clon(st.docs[k]); }); cb(out); };
  subs.add(f); setTimeout(f, 0); return () => subs.delete(f);
}
export async function respuestasEstudio(eid) {
  if (!esAdmin()) denegar();
  return Object.keys(st.docs).filter(k => k.startsWith(`estudios/${eid}/respuestas/`)).map(k => clon(st.docs[k]));
}
export async function contarRespuestas(eid) { return Object.keys(st.docs).filter(k => k.startsWith(`estudios/${eid}/respuestas/`)).length; }
export async function borrarEstudio(eid) { if (!esAdmin()) denegar(); Object.keys(st.docs).filter(k => k === `estudios/${eid}` || k.startsWith(`estudios/${eid}/`)).forEach(del); }
