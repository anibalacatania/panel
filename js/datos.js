// =====================================================================
// Capa de datos: Firebase (Firestore + inicio de sesión con Google)
//
//   paneles/{id}                       nombre, activo, dueno, atributos, etiqueta, mostrar, rango, paso, azar,
//                                      panelistas, nMuestras, creado
//   paneles/{id}/publico/diseno        filas "Valuador|Orden|Etiqueta"      (lo que ve el panelista)
//   paneles/{id}/privado/diseno        filas "Valuador|Orden|Muestra|NombreProducto|CodigoProducto|CodigoMuestra"
//   paneles/{id}/respuestas/{V_O}      Valuador, Orden, Etiqueta, valores{atributo: valor}, ts
//   paneles/{id}/progreso/{V}          hechos: [órdenes respondidas]
//   admins/{email}                     administradores (los mismos de LibreSense)
// =====================================================================
const V = '10.12.2';
const FB = `https://www.gstatic.com/firebasejs/${V}`;
const { initializeApp } = await import(`${FB}/firebase-app.js`);
const F = await import(`${FB}/firebase-firestore.js`);

let app, db, A, auth;
export let config = {};

export async function iniciar({ admin = false } = {}) {
  if (db) return;
  config = await (await fetch('config.json?v=' + Date.now(), { cache: 'no-store' })).json();
  app = initializeApp(config.firebase);
  try {
    db = admin
      ? F.initializeFirestore(app, { localCache: F.memoryLocalCache() })
      : F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch (e) {
    db = F.getFirestore(app);
  }
}

const pan = (p, ...r) => F.doc(db, 'paneles', p, ...r);
const filaPub = t => { const [Valuador, Orden, Etiqueta] = t.split('|'); return { Valuador, Orden: Number(Orden), Etiqueta }; };
const filaPriv = t => {
  const [Valuador, Orden, Muestra, NombreProducto, CodigoProducto, CodigoMuestra] = t.split('|');
  return { Valuador, Orden: Number(Orden), Muestra, NombreProducto, CodigoProducto, CodigoMuestra };
};

// ------------------------------------------------------------- panelistas
export async function panelesActivos() {
  const q = await F.getDocs(F.query(F.collection(db, 'paneles'), F.where('activo', '==', true)));
  return q.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.nombre).localeCompare(b.nombre));
}
export async function leerPanel(p) {
  const d = await F.getDoc(pan(p));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function disenoPublico(p) {
  const d = await F.getDoc(pan(p, 'publico', 'diseno'));
  return (d.exists() ? d.data().filas : []).map(filaPub);
}
export async function leerProgreso(p, v) {
  try {
    const d = await F.getDoc(pan(p, 'progreso', v));
    return d.exists() ? (d.data().hechos || []) : [];
  } catch (e) { return []; }
}
// se escribe primero en el dispositivo y se sube sola cuando hay conexión
export function guardarRespuesta(p, { Valuador, Orden, Etiqueta, valores }) {
  const b = F.writeBatch(db);
  b.set(pan(p, 'respuestas', `${Valuador}_${Orden}`), {
    Valuador, Orden, Etiqueta, valores, ts: F.serverTimestamp(), tsCliente: new Date().toISOString(),
  });
  b.set(pan(p, 'progreso', Valuador), { hechos: F.arrayUnion(Orden) }, { merge: true });
  return b.commit();
}

// ------------------------------------------------------------- administración
async function cargarAuth() {
  if (!A) { A = await import(`${FB}/firebase-auth.js`); auth = A.getAuth(app); }
  return A;
}
export async function observarSesion(cb) {
  await cargarAuth();
  return A.onAuthStateChanged(auth, async u => {
    if (!u) return cb(null);
    let rol = null;
    try {
      const d = await F.getDoc(F.doc(db, 'admins', u.email));
      if (d.exists()) rol = d.data().rol || 'super';
    } catch (e) { /* sin permiso */ }
    cb({ email: u.email, nombre: u.displayName, rol });
  });
}
export async function entrar() {
  await cargarAuth();
  return A.signInWithPopup(auth, new A.GoogleAuthProvider());
}
export async function salir() { await cargarAuth(); return A.signOut(auth); }

export function observarPaneles(cb) {
  return F.onSnapshot(F.collection(db, 'paneles'),
    s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creado?.seconds || 0) - (a.creado?.seconds || 0))),
    e => cb(null, e));
}
export function observarProgresos(p, cb) {
  return F.onSnapshot(F.collection(db, 'paneles', p, 'progreso'),
    s => cb(Object.fromEntries(s.docs.map(d => [d.id, d.data().hechos || []]))), () => cb({}));
}
export async function disenoPrivado(p) {
  const d = await F.getDoc(pan(p, 'privado', 'diseno'));
  return (d.exists() ? d.data().filas : []).map(filaPriv);
}
export function observarRespuestas(p, cb, cbErr) {
  return F.onSnapshot(F.collection(db, 'paneles', p, 'respuestas'),
    s => cb(s.docs.map(d => d.data())), e => cbErr && cbErr(e));
}
export async function leerRespuestas(p) {
  const s = await F.getDocs(F.collection(db, 'paneles', p, 'respuestas'));
  return s.docs.map(d => d.data());
}

export async function crearPanel(email, datos, filas) {
  const ref = F.doc(F.collection(db, 'paneles'));
  const b = F.writeBatch(db);
  b.set(ref, { ...datos, dueno: email, activo: true, creado: F.serverTimestamp() });
  b.set(F.doc(db, 'paneles', ref.id, 'publico', 'diseno'), {
    filas: filas.map(f => [f.Valuador, f.Orden, f.Etiqueta].join('|')),
  });
  b.set(F.doc(db, 'paneles', ref.id, 'privado', 'diseno'), {
    filas: filas.map(f => [f.Valuador, f.Orden, f.Muestra, f.NombreProducto, f.CodigoProducto, f.CodigoMuestra].join('|')),
  });
  await b.commit();
  return ref.id;
}
export const actualizarPanel = (p, cambios) => F.updateDoc(pan(p), cambios);

async function borrarColeccion(p, nombre) {
  const s = await F.getDocs(F.collection(db, 'paneles', p, nombre));
  for (let i = 0; i < s.docs.length; i += 400) {
    const b = F.writeBatch(db);
    s.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
    await b.commit();
  }
}
export async function borrarDatos(p) {
  await borrarColeccion(p, 'respuestas');
  await borrarColeccion(p, 'progreso');
}
export async function borrarPanel(p) {
  await borrarDatos(p);
  const b = F.writeBatch(db);
  b.delete(pan(p, 'publico', 'diseno'));
  b.delete(pan(p, 'privado', 'diseno'));
  await b.commit();
  await F.deleteDoc(pan(p));
}

// ------------------------------------------------------------- uso del plan gratuito (estimado)
// Firestore no informa el espacio usado a la página: se estima contando documentos (consultas de conteo,
// muy baratas) y midiendo una muestra de cada colección. Incluye LibreSense (estudios), que comparte la base.
export async function estimarUso() {
  const { tamanoDoc, inicioDiaPacifico } = await import('./tamano.js');
  const desde = F.Timestamp.fromDate(inicioDiaPacifico());
  let bytes = 0, docs = 0, escriturasHoy = 0, parcial = false;
  const sumar = (ruta, datos) => { const t = tamanoDoc(ruta, datos); bytes += t.doc + t.indices; docs++; };
  // colección grande: cantidad exacta × tamaño medio de una muestra
  async function coleccion(ruta, conHoy) {
    try {
      const ref = F.collection(db, ...ruta);
      const [n, muestra] = await Promise.all([
        F.getCountFromServer(ref),
        F.getDocs(F.query(ref, F.limit(10))),
      ]);
      const total = n.data().count;
      if (total && muestra.size) {
        const medio = muestra.docs.reduce((s, d) => { const t = tamanoDoc([...ruta, d.id], d.data()); return s + t.doc + t.indices; }, 0) / muestra.size;
        bytes += medio * total; docs += total;
      }
      if (conHoy && total) {
        const h = await F.getCountFromServer(F.query(ref, F.where('ts', '>=', desde)));
        escriturasHoy += 2 * h.data().count;   // cada respuesta escribe la respuesta y el progreso
      }
    } catch (e) { parcial = true; }
  }
  async function unDoc(ruta) {
    try { const d = await F.getDoc(F.doc(db, ...ruta)); if (d.exists()) sumar(ruta, d.data()); }
    catch (e) { parcial = true; }
  }
  for (const raiz of ['paneles', 'estudios']) {
    let lista;
    try { lista = await F.getDocs(F.collection(db, raiz)); } catch (e) { parcial = true; continue; }
    await Promise.all(lista.docs.map(async d => {
      sumar([raiz, d.id], d.data());
      await Promise.all([
        unDoc([raiz, d.id, 'publico', 'diseno']),
        unDoc([raiz, d.id, 'privado', 'diseno']),
        coleccion([raiz, d.id, 'respuestas'], true),
        coleccion([raiz, d.id, 'progreso'], false),
      ]);
    }));
  }
  return { bytes, docs, escriturasHoy, parcial, desde: desde.toDate() };
}
