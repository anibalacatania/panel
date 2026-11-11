// =====================================================================
// Capa de datos: Firebase (Firestore + inicio de sesión con Google)
//
// Estructura en Firestore:
//   estudios/{id}                      nombre, tecnica, activo, atributos, sesiones, panelistas, creado
//   estudios/{id}/publico/diseno       filas "Sesion|Valuador|Orden|Codigo"   (sin nombres: cata a ciegas)
//   estudios/{id}/privado/diseno       filas "Sesion|Valuador|Orden|Codigo|Vino|Rep" + parámetros (solo admin)
//   estudios/{id}/respuestas/{V_S_O}   Sesion, Valuador, Orden, CodigoProducto, valores{atributo: número}, ts
//   estudios/{id}/progreso/{V}         { S1: [1,2,3], ... }  órdenes respondidas por sesión
//   admins/{email}                     administradores
//   meta/setup                         marca que ya hay un primer administrador
// =====================================================================
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, setDoc, onSnapshot, query, where, writeBatch,
  arrayUnion, serverTimestamp, getCountFromServer, updateDoc,
} from 'firebase/firestore';
// El inicio de sesión (firebase/auth) solo lo usa el administrador: se carga aparte, a pedido,
// así la app de los panelistas es más liviana.
let db, auth, app, A;
async function cargarAuth() {
  if (!A) {
    A = await import('firebase/auth');
    auth = A.getAuth(app);
  }
  return A;
}

export async function iniciar() {
  if (db) return;
  const cfg = await (await fetch('config.json?v=' + Date.now(), { cache: 'no-store' })).json();
  app = initializeApp(cfg.firebase);
  try {
    // guarda en el dispositivo: sin internet sigue funcionando y sube todo al volver la conexión
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    db = initializeFirestore(app, {});
  }
}

const ses = (e, ...p) => doc(db, 'estudios', e, ...p);

// ------------------------------------------------------------- panelistas
export async function estudiosActivos() {
  const q = await getDocs(query(collection(db, 'estudios'), where('activo', '==', true)));
  return q.docs.map(d => ({ id: d.id, ...limpiarEstudio(d.data()) }));
}

export async function disenoPublico(eid) {
  const d = await getDoc(ses(eid, 'publico', 'diseno'));
  return (d.exists() ? d.data().filas : []).map(t => {
    const [Sesion, Valuador, Orden, CodigoProducto] = t.split('|');
    return { Sesion, Valuador, Orden: Number(Orden), CodigoProducto };
  });
}

// progreso del panelista en vivo; 'pendiente' = hay respuestas guardadas en el dispositivo sin subir
export function observarProgreso(eid, v, cb) {
  return onSnapshot(ses(eid, 'progreso', v), { includeMetadataChanges: true },
    snap => cb(snap.data() || {}, snap.metadata.hasPendingWrites),
    () => cb(null, false));
}

let pendientes = 0;
const oyentes = new Set();
const avisar = () => oyentes.forEach(f => f(pendientes));
export function suscribirPendientes(cb) { oyentes.add(cb); cb(pendientes); return () => oyentes.delete(cb); }

// Guarda una muestra. Se escribe en el dispositivo al instante y se sube sola cuando hay conexión.
// Una corrección (misma muestra) sobrescribe el mismo documento: no hay duplicados.
export function guardarRespuesta(eid, { Sesion, Valuador, Orden, CodigoProducto, valores }) {
  const b = writeBatch(db);
  b.set(ses(eid, 'respuestas', `${Valuador}_${Sesion}_${Orden}`), {
    Sesion, Valuador, Orden, CodigoProducto, valores, ts: serverTimestamp(), tsCliente: new Date().toISOString(),
  });
  b.set(ses(eid, 'progreso', Valuador), { [Sesion]: arrayUnion(Orden) }, { merge: true });
  pendientes++; avisar();
  return b.commit().finally(() => { pendientes--; avisar(); });
}

// ------------------------------------------------------------- administración
export function observarUsuario(cb) {
  let off = () => {}, vivo = true;
  cargarAuth().then(a => { if (vivo) off = a.onAuthStateChanged(auth, cb); });
  return () => { vivo = false; off(); };
}

export async function entrarConGoogle() {
  const a = await cargarAuth();
  const p = new a.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  try { await a.signInWithPopup(auth, p); }
  catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
      await a.signInWithRedirect(auth, p);
    } else throw e;
  }
}
export const salir = async () => { const a = await cargarAuth(); return a.signOut(auth); };

// 'admin' | 'registrable' (todavía no hay ningún administrador) | 'no'
export async function rolAdmin() {
  const email = auth.currentUser && auth.currentUser.email;
  if (!email) return 'no';
  const a = await getDoc(doc(db, 'admins', email));
  if (a.exists()) return 'admin';
  const s = await getDoc(doc(db, 'meta', 'setup'));
  return s.exists() ? 'no' : 'registrable';
}

export async function registrarPrimerAdmin() {
  const email = auth.currentUser.email;
  const b = writeBatch(db);
  b.set(doc(db, 'admins', email), { email, desde: serverTimestamp() });
  b.set(doc(db, 'meta', 'setup'), { listo: true });
  await b.commit();
}

export async function listarAdmins() {
  return (await getDocs(collection(db, 'admins'))).docs.map(d => d.id).sort();
}
export async function agregarAdmin(email) {
  const e = String(email).trim().toLowerCase();
  await setDoc(doc(db, 'admins', e), { email: e, desde: serverTimestamp() });
}
export async function quitarAdmin(email) {
  const b = writeBatch(db); b.delete(doc(db, 'admins', email)); await b.commit();
}

function limpiarEstudio(d) {
  return {
    nombre: d.nombre || 'Estudio', tecnica: d.tecnica || 'descriptiva', activo: !!d.activo,
    atributos: d.atributos || [], sesiones: d.sesiones || [], panelistas: d.panelistas || [],
    creado: d.creado && d.creado.toDate ? d.creado.toDate().toISOString() : null,
  };
}

export async function listarEstudios() {
  const q = await getDocs(collection(db, 'estudios'));
  return q.docs.map(d => ({ id: d.id, ...limpiarEstudio(d.data()) }))
    .sort((a, b) => String(b.creado).localeCompare(String(a.creado)));
}

export async function leerEstudio(eid) {
  const d = await getDoc(ses(eid));
  return d.exists() ? { id: eid, ...limpiarEstudio(d.data()) } : null;
}

function docsDiseno(est) {
  const pub = est.diseno.map(d => `${d.Sesion}|${d.Valuador}|${d.Orden}|${d.CodigoProducto}`);
  const priv = est.diseno.map(d => `${d.Sesion}|${d.Valuador}|${d.Orden}|${d.CodigoProducto}|${d.NombreProducto}|${d.Rep}`);
  return {
    estudio: {
      nombre: est.nombre, tecnica: 'descriptiva', atributos: est.atributos,
      sesiones: est.sesiones.map(s => ({ Sesion: s.Sesion, NMuestras: s.NMuestras })),
      panelistas: est.panelistas,
    },
    publico: { filas: pub },
    privado: { filas: priv, sesiones: est.sesiones.map(s => ({ Sesion: s.Sesion, Vinos: s.Vinos })), parametros: est.parametros || {} },
  };
}

export async function crearEstudio(est) {
  const ref = doc(collection(db, 'estudios'));
  const d = docsDiseno(est);
  const b = writeBatch(db);
  b.set(ref, { ...d.estudio, activo: true, creado: serverTimestamp() });
  b.set(doc(db, 'estudios', ref.id, 'publico', 'diseno'), d.publico);
  b.set(doc(db, 'estudios', ref.id, 'privado', 'diseno'), d.privado);
  await b.commit();
  return ref.id;
}

export async function actualizarEstudio(eid, campos) { await updateDoc(ses(eid), campos); }

export async function disenoPrivado(eid) {
  const d = await getDoc(ses(eid, 'privado', 'diseno'));
  if (!d.exists()) return { filas: [], sesiones: [], parametros: {} };
  const x = d.data();
  return {
    filas: x.filas.map(t => {
      const [Sesion, Valuador, Orden, CodigoProducto, NombreProducto, Rep] = t.split('|');
      return { Sesion, Valuador, Orden: Number(Orden), CodigoProducto, NombreProducto, Rep: Number(Rep) };
    }),
    sesiones: x.sesiones || [], parametros: x.parametros || {},
  };
}

// progreso de todo el estudio, en vivo: { V1: { S1: [1,2], ... }, ... }
export function observarProgresoEstudio(eid, cb) {
  return onSnapshot(collection(db, 'estudios', eid, 'progreso'), snap => {
    const out = {}; snap.forEach(d => { out[d.id] = d.data(); }); cb(out);
  });
}

export async function respuestasEstudio(eid) {
  const q = await getDocs(collection(db, 'estudios', eid, 'respuestas'));
  return q.docs.map(d => {
    const x = d.data();
    return { ...x, ts: x.ts && x.ts.toDate ? x.ts.toDate().toISOString() : (x.tsCliente || '') };
  });
}

export async function contarRespuestas(eid) {
  return (await getCountFromServer(collection(db, 'estudios', eid, 'respuestas'))).data().count;
}

// Borra el estudio completo (respuestas incluidas). Irreversible.
export async function borrarEstudio(eid) {
  for (const sub of ['respuestas', 'progreso', 'publico', 'privado']) {
    const q = await getDocs(collection(db, 'estudios', eid, sub));
    for (let i = 0; i < q.docs.length; i += 400) {
      const b = writeBatch(db);
      q.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
      await b.commit();
    }
  }
  const b = writeBatch(db); b.delete(ses(eid)); await b.commit();
}
