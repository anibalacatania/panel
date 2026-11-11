import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import * as datos from 'datos';
import { ordenNatural, tamaniosSesiones, generarDiseno } from './diseno.js';
import { TECNICAS, nombreTecnica, etiquetasRata, parsearDescriptores, bloquesDe } from './tecnicas.js';
import { analizar } from './analisis.js';

// ---- almacenamiento local seguro (copias para mostrar la app al instante)
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const urlBase = () => location.origin + location.pathname;

// =====================================================================
// UI común
// =====================================================================
const Icon = ({ path, className = 'w-full h-full' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
  </svg>
);
const Wine = () => <Icon path="M8 2h8l-1 7a3 3 0 01-6 0L8 2zm4 10v8m-4 0h8" />;
const Check = () => <Icon path="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />;
const Lock = () => <Icon path="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />;

const Tarjeta = ({ children, ancho = 'max-w-md' }) => (
  <div className="min-h-screen flex items-center justify-center p-4">
    <div className={`bg-white rounded-2xl shadow-2xl p-6 sm:p-8 ${ancho} w-full`}>{children}</div>
  </div>
);
const Cargando = ({ texto = 'Cargando…' }) => (
  <Tarjeta><div className="text-center">
    <div className="w-14 h-14 mx-auto text-purple-600 mb-4 animate-pulse"><Wine/></div>
    <h2 className="text-xl font-bold text-gray-800">{texto}</h2>
  </div></Tarjeta>
);

function usePendientes() {
  const [n, setN] = useState(0);
  useEffect(() => datos.suscribirPendientes(setN), []);
  return n;
}
const EstadoNube = ({ pendientes, oscuro }) => (
  pendientes === 0
    ? <p className={`text-sm font-semibold ${oscuro ? 'text-emerald-300' : 'text-emerald-600'}`}>☁️ Todo guardado en la nube</p>
    : <p className={`text-sm font-semibold ${oscuro ? 'text-amber-300' : 'text-amber-600'}`}>⏳ {pendientes} respuesta(s) subiéndose… (se guardan en el dispositivo y se suben solas)</p>
);

// =====================================================================
// APP DEL PANELISTA
// =====================================================================
function PanelApp() {
  const [estudios, setEstudios] = useState(LS.get('pf_estudios', null));
  const [error, setError] = useState(null);
  const [eid, setEid] = useState(null);
  const [diseno, setDiseno] = useState(null);
  const [vista, setVista] = useState('estudios');
  const [valuador, setValuador] = useState('');
  const [progreso, setProgreso] = useState(null);
  const [progPend, setProgPend] = useState(false);
  const [sesion, setSesion] = useState(null);
  const [filas, setFilas] = useState([]);
  const [idx, setIdx] = useState(0);
  const [valores, setValores] = useState({});
  const [buffer, setBuffer] = useState({});
  const [hechasLocal, setHechasLocal] = useState({});
  const [cerrado, setCerrado] = useState(false);
  const [faltan, setFaltan] = useState([]);
  const pendN = usePendientes();
  const pendientes = Math.max(pendN, progPend ? 1 : 0);

  const estudio = (estudios || []).find(e => e.id === eid) || null;
  const atributos = estudio ? estudio.atributos : [];
  const unicoEstudio = estudios && estudios.length === 1;
  const esRata = estudio && estudio.tecnica === 'rata';
  const bloques = useMemo(() => (estudio ? bloquesDe(estudio, `${eid}|${valuador}`) : []), [estudio, eid, valuador]);

  const elegirEstudio = (e) => {
    setEid(e.id); setVista('inicio'); setValuador('');
    setDiseno(LS.get('pf_dis_' + e.id, null));
    datos.disenoPublico(e.id).then(d => { setDiseno(d); LS.set('pf_dis_' + e.id, d); }).catch(() => {});
  };

  const cargar = async () => {
    setError(null);
    try {
      await datos.iniciar();
      const lista = await datos.estudiosActivos();
      setEstudios(lista); LS.set('pf_estudios', lista);
      return lista;
    } catch (e) {
      if (!estudios) setError('No se pudo conectar. Revisá la conexión a internet y reintentá.');
      return null;
    }
  };

  useEffect(() => {
    (async () => {
      const lista = (await cargar()) || estudios || [];
      const pedido = new URLSearchParams(location.search).get('e');
      const elegido = lista.find(x => x.id === pedido) || (lista.length === 1 ? lista[0] : null);
      if (elegido) elegirEstudio(elegido);
    })();
  }, []);

  // progreso del panelista en vivo (de la nube, con lo guardado en el dispositivo)
  useEffect(() => {
    if (!eid || !valuador) return;
    setProgreso(null);
    return datos.observarProgreso(eid, valuador, (p, pend) => { if (p) setProgreso(p); setProgPend(pend); });
  }, [eid, valuador]);

  const respondidas = (s) => {
    const set = new Set(((progreso && progreso[s]) || []).map(Number));
    (hechasLocal[s] || []).forEach(o => set.add(o));
    return set;
  };

  const misSesiones = useMemo(() => {
    if (!diseno || !valuador) return [];
    const por = {};
    diseno.filter(r => r.Valuador === valuador).forEach(r => { (por[r.Sesion] = por[r.Sesion] || []).push(r); });
    return Object.keys(por).sort(ordenNatural).map(s => ({ Sesion: s, filas: por[s].sort((a, b) => a.Orden - b.Orden) }));
  }, [diseno, valuador]);

  const ceros = () => { const o = {}; atributos.forEach(a => o[a] = 0); return o; };

  const abrirSesion = (s) => {
    const hechas = respondidas(s.Sesion);
    const primera = s.filas.findIndex(f => !hechas.has(f.Orden));
    setSesion(s); setFilas(s.filas); setBuffer({});
    setIdx(primera === -1 ? 0 : primera);
    setValores(ceros());
    setVista('evaluacion'); window.scrollTo(0, 0);
  };

  const enviarMuestra = () => {
    const f = filas[idx];
    if (esRata) {
      const sinNivel = atributos.filter(a => valores[a] === -1);
      if (sinNivel.length) {
        setFaltan(sinNivel);
        const el = document.getElementById('attr-' + sinNivel[0]); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    setFaltan([]);
    const vals = {}; atributos.forEach(a => { vals[a] = Number(valores[a] ?? 0); });
    datos.guardarRespuesta(eid, { Sesion: sesion.Sesion, Valuador: valuador, Orden: f.Orden, CodigoProducto: f.CodigoProducto, valores: vals })
      .catch(e => { if (e && e.code === 'permission-denied') setCerrado(true); });
    const nb = { ...buffer, [f.Orden]: { ...valores } };
    setBuffer(nb);
    const hechas = new Set([...(hechasLocal[sesion.Sesion] || []), f.Orden]);
    setHechasLocal(prev => ({ ...prev, [sesion.Sesion]: [...hechas] }));
    const todas = respondidas(sesion.Sesion); hechas.forEach(o => todas.add(o));
    let sig = filas.findIndex((x, i) => i > idx && !todas.has(x.Orden));
    if (sig === -1) sig = filas.findIndex(x => !todas.has(x.Orden));
    if (sig === -1) { setVista('finSesion'); window.scrollTo(0, 0); return; }
    setIdx(sig); setValores(nb[filas[sig].Orden] || ceros()); window.scrollTo(0, 0);
  };
  const cambiar = (a, v) => { setValores(prev => ({ ...prev, [a]: v })); if (v !== -1) setFaltan(x => x.filter(y => y !== a)); };

  const volver = () => {
    if (idx === 0) return;
    setBuffer(b => ({ ...b, [filas[idx].Orden]: { ...valores } }));
    const p = idx - 1;
    setFaltan([]); setIdx(p); setValores(buffer[filas[p].Orden] || ceros()); window.scrollTo(0, 0);
  };

  const AvisoCerrado = () => cerrado
    ? <p className="text-sm bg-red-50 text-red-700 p-3 rounded-lg mb-3">Este estudio fue cerrado por el administrador: las respuestas nuevas no se pueden guardar.</p>
    : null;

  // ------------------------------------------------------------- vistas
  if (!estudios && !error) return <Cargando/>;
  if (error && !estudios) {
    return <Tarjeta><div className="text-center">
      <p className="text-red-600 mb-4">{error}</p>
      <button onClick={cargar} className="bg-purple-600 text-white font-semibold py-3 px-6 rounded-lg">Reintentar</button>
    </div></Tarjeta>;
  }

  if (vista === 'estudios' || !estudio) {
    return (
      <Tarjeta>
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto text-purple-600 mb-3"><Wine/></div>
          <h1 className="text-3xl font-bold text-gray-800 mb-1">Análisis Sensorial</h1>
          <p className="text-gray-600">Elegí el estudio</p>
        </div>
        {!estudios.length
          ? <p className="text-center text-gray-500">No hay estudios activos en este momento.</p>
          : <div className="space-y-2">{estudios.map(e => (
              <button key={e.id} onClick={() => elegirEstudio(e)}
                className="w-full text-left bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl p-4">
                <p className="font-bold text-lg">{e.nombre}</p>
                <p className="text-sm text-purple-100">{(TECNICAS[e.tecnica] || TECNICAS.descriptiva).corto} · {e.sesiones.length} sesiones · {e.panelistas.length} panelistas</p>
              </button>))}
            </div>}
      </Tarjeta>
    );
  }

  if (vista === 'inicio') {
    return (
      <Tarjeta>
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto text-purple-600 mb-3"><Wine/></div>
          <h1 className="text-3xl font-bold text-gray-800 mb-1">{estudio.nombre}</h1>
          <p className="text-gray-600">Seleccioná tu número de panelista</p>
          <p className="text-xs text-gray-400 mt-1">{nombreTecnica(estudio.tecnica)} • {estudio.sesiones.length} sesiones • {atributos.length} {esRata ? 'descriptores' : 'atributos'}</p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-96 overflow-y-auto">
          {estudio.panelistas.map(v => (
            <button key={v} onClick={() => { setValuador(v); setHechasLocal({}); setVista('sesiones'); }}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-3 rounded-lg">{v}</button>
          ))}
        </div>
        {!unicoEstudio && <p className="text-center mt-5"><button onClick={() => setVista('estudios')} className="text-sm text-purple-700 hover:underline">← Otro estudio</button></p>}
        <div className="mt-4 text-center"><EstadoNube pendientes={pendientes} /></div>
      </Tarjeta>
    );
  }

  if (vista === 'sesiones') {
    const listo = diseno && progreso;
    return (
      <Tarjeta ancho="max-w-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Panelista {valuador}</h1>
            <p className="text-gray-600 text-sm">{estudio.nombre} · elegí la sesión que vas a evaluar</p>
          </div>
          <button onClick={() => { setVista('inicio'); setValuador(''); }} className="text-sm text-purple-700 hover:underline">Cambiar</button>
        </div>
        <AvisoCerrado/>
        {!listo
          ? <p className="text-gray-500 text-center py-8 animate-pulse">Cargando tus sesiones…</p>
          : <div className="space-y-3">
              {misSesiones.map(s => {
                const n = s.filas.length, h = respondidas(s.Sesion).size;
                const completa = h >= n, enCurso = h > 0 && !completa;
                return (
                  <button key={s.Sesion} disabled={completa} onClick={() => abrirSesion(s)}
                    className={`w-full text-left rounded-xl p-4 border-2 flex items-center justify-between transition-all ${
                      completa ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                      : enCurso ? 'bg-amber-50 border-amber-300 hover:border-amber-500'
                      : 'bg-white border-purple-200 hover:border-purple-500 hover:shadow'}`}>
                    <div>
                      <p className={`font-bold text-lg ${completa ? '' : 'text-gray-800'}`}>Sesión {s.Sesion.replace(/^S/, '')}</p>
                      <p className="text-sm">{n} muestras</p>
                    </div>
                    <div className="text-right">
                      {completa ? <span className="flex items-center gap-1 font-semibold text-emerald-600"><span className="w-6 h-6 inline-block"><Check/></span> Completada</span>
                        : enCurso ? <span className="font-semibold text-amber-600">En curso {h}/{n}</span>
                        : <span className="font-semibold text-purple-600">Comenzar →</span>}
                    </div>
                  </button>
                );
              })}
              {!misSesiones.length && <p className="text-gray-500 text-center">No tenés sesiones asignadas.</p>}
            </div>}
        <div className="mt-5 text-center"><EstadoNube pendientes={pendientes} /></div>
      </Tarjeta>
    );
  }

  if (vista === 'finSesion') {
    return (
      <Tarjeta>
        <div className="text-center">
          <div className="w-20 h-20 mx-auto text-green-600 mb-4"><Check/></div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">¡Sesión {sesion.Sesion.replace(/^S/, '')} completada!</h1>
          <p className="text-gray-600 mb-4">Gracias, <strong>{valuador}</strong>.</p>
          <AvisoCerrado/>
          <div className="mb-6 p-3 rounded-lg bg-gray-50 border"><EstadoNube pendientes={pendientes} /></div>
          <button onClick={() => setVista('sesiones')}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-3 rounded-lg mb-3">Ver mis sesiones</button>
          <button onClick={() => { setVista('inicio'); setValuador(''); }}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 rounded-lg">Salir</button>
        </div>
      </Tarjeta>
    );
  }

  // evaluación
  const f = filas[idx] || {};
  const hechasSesion = respondidas(sesion.Sesion);
  return (
    <div className="min-h-screen py-6 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-5 mb-5 border border-white/20">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold text-white">Panelista {valuador} · Sesión {sesion.Sesion.replace(/^S/, '')}</h2>
              <p className="text-purple-200">Muestra {idx + 1} de {filas.length}</p>
              <div className="mt-1"><EstadoNube pendientes={pendientes} oscuro /></div>
            </div>
            <button onClick={() => setVista('sesiones')} className="text-sm text-purple-200 hover:text-white underline">Salir de la sesión</button>
          </div>
          <AvisoCerrado/>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg p-4 shadow-lg">
              <p className="text-gray-800 font-semibold text-sm mb-1">Código de Muestra</p>
              <p className="text-gray-900 text-4xl font-bold">{f.CodigoProducto}</p>
            </div>
            <div className="bg-white/20 rounded-lg p-4 border-2 border-white/40">
              <p className="text-white font-semibold text-sm mb-2">Progreso de la sesión</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/30 rounded-full h-4">
                  <div className="bg-gradient-to-r from-green-400 to-emerald-500 h-4 rounded-full transition-all" style={{ width: (hechasSesion.size / Math.max(1, filas.length)) * 100 + '%' }}/>
                </div>
                <span className="text-white font-bold">{hechasSesion.size}/{filas.length}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-5 mb-5 border border-white/20">
          {esRata
            ? <EvaluacionRata bloques={bloques} valores={valores} cambiar={cambiar} etiquetas={etiquetasRata(estudio.escala)} faltan={faltan} />
            : <EvaluacionDescriptiva bloques={bloques} valores={valores} cambiar={cambiar} />}
        </div>
        {faltan.length > 0 && (
          <p className="mb-3 bg-red-500/90 text-white font-semibold p-3 rounded-xl text-center">
            Falta indicar la intensidad de: {faltan.join(', ')}
          </p>
        )}

        <div className="space-y-3">
          <button onClick={enviarMuestra}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-4 rounded-xl shadow-2xl text-lg">
            {hechasSesion.size + (hechasSesion.has(f.Orden) ? 0 : 1) >= filas.length ? 'Finalizar sesión ✓' : 'Enviar y continuar →'}
          </button>
          {idx > 0 && (
            <button onClick={volver} className="w-full bg-white/10 hover:bg-white/20 border-2 border-white/30 text-white font-semibold py-3 rounded-xl">← Volver a la muestra anterior</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- formularios de evaluación por técnica
const TituloGrupo = ({ b }) => (
  <>
    {b.mostrarG1 && <h3 className="text-2xl font-bold text-white mt-6 first:mt-0 mb-2 border-b border-white/20 pb-1">{b.g1}</h3>}
    {b.g2 && <h4 className="text-sm font-bold uppercase tracking-wide text-purple-200 mt-4 mb-2">{b.g2}</h4>}
  </>
);

function EvaluacionDescriptiva({ bloques, valores, cambiar }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-5">Evaluación de Atributos</h3>
      {bloques.map((b, i) => (
        <div key={i}>
          <TituloGrupo b={b}/>
          <div className="space-y-5 mb-5">
            {b.attrs.map(({ k, n }) => (
              <div key={k} className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 rounded-lg p-5 border-2 border-slate-600/50 shadow-lg">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-white font-semibold text-lg">{n}</label>
                  <span className="bg-gradient-to-r from-pink-500 to-rose-500 text-white px-5 py-2 rounded-full font-bold text-xl min-w-[70px] text-center shadow-lg">
                    {Number(valores[k] ?? 0).toFixed(1)}
                  </span>
                </div>
                <input type="range" min="0" max="10" step="0.1" value={valores[k] ?? 0}
                  onChange={e => cambiar(k, Number(e.target.value))}
                  className="w-full h-4 rounded-lg appearance-none cursor-pointer"
                  style={{ background: `linear-gradient(to right,#f59e0b 0%,#f59e0b ${(valores[k] || 0) * 10}%,#cbd5e1 ${(valores[k] || 0) * 10}%,#cbd5e1 100%)` }} />
                <div className="flex justify-between text-gray-200 font-semibold text-sm mt-2"><span>0</span><span>5</span><span>10</span></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// RATA: tocar el descriptor si está presente → aparece la escala de intensidad.
// Valores: 0 = no marcado, -1 = marcado sin intensidad (no se puede enviar), 1..N = intensidad
function EvaluacionRata({ bloques, valores, cambiar, etiquetas, faltan }) {
  const marcados = Object.values(valores).filter(v => v !== 0 && v != null).length;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h3 className="text-xl font-bold text-white">¿Qué descriptores percibís?</h3>
        <span className="text-purple-200 text-sm">{marcados} marcado{marcados === 1 ? '' : 's'}</span>
      </div>
      <p className="text-purple-100 text-sm mb-4">Tocá cada descriptor que esté <b>presente</b> y después indicá su intensidad. Si no está presente, dejalo sin marcar.</p>
      {bloques.map((b, i) => (
        <div key={i}>
          <TituloGrupo b={b}/>
          <div className="grid sm:grid-cols-2 gap-2 mb-4">
            {b.attrs.map(({ k, n }) => {
              const v = valores[k] ?? 0, on = v !== 0, falta = faltan.includes(k);
              return (
                <div key={k} id={'attr-' + k}
                  className={`rounded-xl border-2 transition-all ${on ? 'bg-white border-pink-400 shadow-lg' : 'bg-slate-800/70 border-slate-600/60'} ${falta ? 'ring-4 ring-red-500' : ''}`}>
                  <button type="button" onClick={() => cambiar(k, on ? 0 : -1)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left">
                    <span className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center font-bold ${on ? 'bg-pink-500 border-pink-500 text-white' : 'border-slate-400'}`}>{on ? '✓' : ''}</span>
                    <span className={`font-semibold text-lg ${on ? 'text-gray-900' : 'text-white'}`}>{n}</span>
                  </button>
                  {on && (
                    <div className="px-3 pb-3">
                      <div className={`grid gap-1`} style={{ gridTemplateColumns: `repeat(${etiquetas.length}, minmax(0, 1fr))` }}>
                        {etiquetas.map((et, j) => (
                          <button key={j} type="button" onClick={() => cambiar(k, j + 1)}
                            className={`py-2 rounded-lg font-bold text-sm border-2 ${v === j + 1 ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white border-transparent' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-purple-400'}`}>
                            {et}
                          </button>
                        ))}
                      </div>
                      {etiquetas.length > 3 && <div className="flex justify-between text-xs text-gray-500 mt-1 px-1"><span>poco intenso</span><span>muy intenso</span></div>}
                      {v === -1 && <p className={`text-xs mt-1 ${falta ? 'text-red-600 font-bold' : 'text-gray-500'}`}>Elegí la intensidad</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// APP DEL ADMINISTRADOR  (index.html#admin)
// =====================================================================
const Campo = ({ label, children, ayuda }) => (
  <label className="block"><span className="text-sm font-semibold text-gray-700">{label}</span>{children}
    {ayuda && <span className="block text-xs text-gray-500 mt-1">{ayuda}</span>}</label>
);
const inp = 'mt-1 w-full border-2 border-gray-200 rounded-lg px-3 py-2 focus:border-purple-500 outline-none';
const btn = 'px-4 py-2 rounded-lg font-semibold disabled:opacity-50';
const Mensaje = ({ msg }) => msg ? <p className={`p-3 rounded-lg ${msg.t === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.m}</p> : null;
const textoError = e => (e && e.code === 'permission-denied') ? 'No tenés permiso para esta acción.' : ((e && e.message) || 'Error inesperado');

function AdminApp() {
  const [usuario, setUsuario] = useState(undefined);
  const [rol, setRol] = useState(null);
  const [msg, setMsg] = useState(null);
  const [vista, setVista] = useState({ tipo: 'lista' });

  useEffect(() => {
    let off = () => {};
    datos.iniciar().then(() => {
      off = datos.observarUsuario(async u => {
        setUsuario(u || null); setRol(null);
        if (u) { try { setRol(await datos.rolAdmin()); } catch (e) { setRol('no'); } }
      });
    }).catch(() => setMsg({ t: 'error', m: 'No se pudo conectar con Firebase.' }));
    return () => off();
  }, []);

  const entrar = async () => {
    setMsg(null);
    try { await datos.entrarConGoogle(); }
    catch (e) { if (!e || e.code !== 'auth/popup-closed-by-user') setMsg({ t: 'error', m: 'No se pudo entrar: ' + textoError(e) }); }
  };

  if (usuario === undefined || (usuario && !rol)) return <Cargando/>;

  if (!usuario) {
    return (
      <Tarjeta>
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto text-purple-600 mb-3"><Lock/></div>
          <h1 className="text-2xl font-bold text-gray-800">Administración</h1>
          <p className="text-gray-600 text-sm">Entrá con tu cuenta de Google</p>
        </div>
        <button onClick={entrar} className="w-full bg-white border-2 border-gray-300 hover:border-purple-500 text-gray-800 font-bold py-3 rounded-lg flex items-center justify-center gap-2">
          <span className="text-xl">G</span> Entrar con Google
        </button>
        <div className="mt-3"><Mensaje msg={msg}/></div>
        <p className="text-center mt-6"><a href="#" className="text-sm text-purple-700 hover:underline">← Ir a la app de panelistas</a></p>
      </Tarjeta>
    );
  }

  if (rol === 'registrable') {
    return (
      <Tarjeta>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Primer ingreso</h1>
        <p className="text-gray-600 mb-4">Todavía no hay ningún administrador. Podés registrarte como el primero con <b>{usuario.email}</b>.
          Después vas a poder agregar a otras personas desde la pestaña Administradores.</p>
        <button onClick={async () => { try { await datos.registrarPrimerAdmin(); setRol(await datos.rolAdmin()); } catch (e) { setMsg({ t: 'error', m: textoError(e) }); } }}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg">Registrarme como administrador</button>
        <div className="mt-3"><Mensaje msg={msg}/></div>
        <button onClick={datos.salir} className="w-full mt-3 text-sm text-gray-500 hover:underline">Salir</button>
      </Tarjeta>
    );
  }

  if (rol !== 'admin') {
    return (
      <Tarjeta>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Sin permiso</h1>
        <p className="text-gray-600 mb-4">La cuenta <b>{usuario.email}</b> no es administradora. Pedile a un administrador que la agregue.</p>
        <button onClick={datos.salir} className="w-full bg-gray-200 hover:bg-gray-300 font-semibold py-3 rounded-lg">Salir</button>
      </Tarjeta>
    );
  }

  return (
    <div className="min-h-screen py-6 px-4">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-2xl p-5 sm:p-7 print-area">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 no-print">
          <h1 className="text-2xl font-bold text-gray-800 cursor-pointer" onClick={() => setVista({ tipo: 'lista' })}>Administración</h1>
          <div className="flex gap-3 items-center text-sm">
            <button onClick={() => setVista({ tipo: 'lista' })} className={vista.tipo === 'lista' ? 'font-bold text-purple-700' : 'text-purple-700 hover:underline'}>Estudios</button>
            <button onClick={() => setVista({ tipo: 'admins' })} className={vista.tipo === 'admins' ? 'font-bold text-purple-700' : 'text-purple-700 hover:underline'}>Administradores</button>
            <a href="#" className="text-purple-700 hover:underline">App de panelistas</a>
            <span className="text-gray-400">{usuario.email}</span>
            <button onClick={datos.salir} className="text-gray-500 hover:underline">Salir</button>
          </div>
        </div>
        {vista.tipo === 'lista' && <ListaEstudios abrir={id => setVista({ tipo: 'estudio', id })} nuevo={() => setVista({ tipo: 'nuevo' })} />}
        {vista.tipo === 'nuevo' && <NuevoEstudio creado={id => setVista({ tipo: 'estudio', id })} cancelar={() => setVista({ tipo: 'lista' })} />}
        {vista.tipo === 'estudio' && <EstudioAdmin eid={vista.id} volver={() => setVista({ tipo: 'lista' })} />}
        {vista.tipo === 'admins' && <Administradores yo={usuario.email} />}
      </div>
    </div>
  );
}

function ListaEstudios({ abrir, nuevo }) {
  const [lista, setLista] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { datos.listarEstudios().then(setLista).catch(e => setMsg({ t: 'error', m: textoError(e) })); }, []);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Estudios</h2>
        <button onClick={nuevo} className={btn + ' bg-purple-600 hover:bg-purple-700 text-white'}>+ Nuevo estudio</button>
      </div>
      <Mensaje msg={msg}/>
      {!lista ? <p className="text-gray-500">Cargando…</p>
        : !lista.length ? <p className="text-gray-500 border-2 border-dashed rounded-xl p-8 text-center">Todavía no hay estudios. Creá el primero con “Nuevo estudio”.</p>
        : <div className="grid sm:grid-cols-2 gap-3">{lista.map(e => (
            <button key={e.id} onClick={() => abrir(e.id)} className="text-left border-2 border-gray-200 hover:border-purple-500 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold text-lg text-gray-800">{e.nombre}</p>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${e.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>{e.activo ? 'Activo' : 'Cerrado'}</span>
              </div>
              <p className="text-sm text-gray-600"><span className={`text-xs font-bold px-2 py-0.5 rounded-full mr-1 ${(TECNICAS[e.tecnica] || TECNICAS.descriptiva).color}`}>{(TECNICAS[e.tecnica] || TECNICAS.descriptiva).corto}</span>
                {e.sesiones.length} sesiones · {e.panelistas.length} panelistas · {e.atributos.length} {e.tecnica === 'rata' ? 'descriptores' : 'atributos'}</p>
              {e.creado && <p className="text-xs text-gray-400 mt-1">Creado {new Date(e.creado).toLocaleDateString('es-AR')}</p>}
            </button>))}
          </div>}
    </div>
  );
}

function NuevoEstudio({ creado, cancelar }) {
  const F = LS.get('pf_form', {});
  const [nombre, setNombre] = useState(F.nombre ?? '');
  const [vinosTxt, setVinosTxt] = useState(F.vinosTxt ?? '');
  const [porSesion, setPorSesion] = useState(F.porSesion ?? 8);
  const [reps, setReps] = useState(F.reps ?? 3);
  const [nPan, setNPan] = useState(F.nPan ?? 16);
  const [parejo, setParejo] = useState(F.parejo ?? false);
  const [semilla, setSemilla] = useState(() => F.semilla ?? (Math.floor(Math.random() * 99999) + 1));
  const [atrTxt, setAtrTxt] = useState(F.atrTxt ?? '');
  const [tecnica, setTecnica] = useState(F.tecnica ?? 'descriptiva');
  const [escala, setEscala] = useState(F.escala ?? 3);
  const [ordenAzar, setOrdenAzar] = useState(F.ordenAzar ?? false);
  useEffect(() => { LS.set('pf_form', { nombre, vinosTxt, porSesion, reps, nPan, parejo, semilla, atrTxt, tecnica, escala, ordenAzar }); },
    [nombre, vinosTxt, porSesion, reps, nPan, parejo, semilla, atrTxt, tecnica, escala, ordenAzar]);
  const [prev, setPrev] = useState(null);
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const lineas = t => t.split(/\r?\n|\t|;/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const vinos = lineas(vinosTxt);
  const desc = useMemo(() => parsearDescriptores(atrTxt), [atrTxt]);
  const atributos = desc.claves;
  const esRata = tecnica === 'rata';
  const dup = vinos.filter((v, i) => vinos.indexOf(v) !== i);

  const generar = () => {
    setMsg(null);
    if (!nombre.trim()) return setMsg({ t: 'error', m: 'Poné un nombre al estudio.' });
    if (vinos.length < 1) return setMsg({ t: 'error', m: 'Pegá al menos un vino.' });
    if (dup.length) return setMsg({ t: 'error', m: 'Hay vinos repetidos: ' + [...new Set(dup)].join(', ') });
    if (vinos.some(v => v.includes('|'))) return setMsg({ t: 'error', m: 'Los nombres de vinos no pueden tener el carácter |' });
    if (!atributos.length) return setMsg({ t: 'error', m: 'Agregá al menos un descriptor.' });
    if (desc.dup.length) return setMsg({ t: 'error', m: 'Hay descriptores repetidos en el mismo grupo: ' + desc.dup.join(', ') });
    if (desc.malos.length) return setMsg({ t: 'error', m: 'Descriptores con el carácter | o demasiado largos: ' + desc.malos.join(', ') });
    if (atributos.length > 300) return setMsg({ t: 'error', m: 'Máximo 300 descriptores por estudio.' });
    if (Number(porSesion) > vinos.length) return setMsg({ t: 'error', m: `No puede haber más vinos por sesión (${porSesion}) que vinos distintos (${vinos.length}): un vino no se repite dentro de una sesión.` });
    if (vinos.length * reps > 900) return setMsg({ t: 'error', m: 'Demasiadas muestras para códigos de 3 dígitos (máx. 900 vinos × repeticiones).' });
    setPrev(generarDiseno({ vinos, porSesion: Number(porSesion), reps: Number(reps), nPanelistas: Number(nPan), parejo, semilla: Number(semilla) }));
  };

  const guardar = async () => {
    setOcupado(true); setMsg(null);
    try {
      const id = await datos.crearEstudio({
        nombre: nombre.trim(), atributos, tecnica, estructura: desc.estructura,
        escala: esRata ? Number(escala) : 3, ordenAzar,
        sesiones: prev.sesiones.map(s => ({ Sesion: s.Sesion, NMuestras: s.NMuestras, Vinos: s.Vinos })),
        panelistas: Array.from({ length: Number(nPan) }, (_, i) => 'V' + (i + 1)),
        diseno: prev.diseno,
        parametros: { vinos, reps: Number(reps), porSesion: Number(porSesion), nPanelistas: Number(nPan), parejo, semilla: Number(semilla) },
      });
      LS.set('pf_form', { atrTxt, porSesion, reps, nPan, parejo, tecnica, escala, ordenAzar });
      creado(id);
    } catch (e) { setMsg({ t: 'error', m: textoError(e) }); }
    finally { setOcupado(false); }
  };

  const balanceado = prev ? prev.sesiones.every(s => Number(nPan) % s.filasWilliams === 0) : true;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Nuevo estudio</h2>
        <button onClick={cancelar} className="text-sm text-gray-500 hover:underline">Cancelar</button>
      </div>
      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div>
            <span className="text-sm font-semibold text-gray-700">Técnica</span>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {[['descriptiva', 'Análisis Descriptivo Cuantitativo', 'Escala continua 0–10 para cada atributo.'],
                ['rata', 'RATA', 'Marcar los descriptores presentes y su intensidad (bajo, medio, alto).']].map(([k, t, d]) => (
                <button key={k} type="button" onClick={() => setTecnica(k)}
                  className={`text-left rounded-xl border-2 p-3 ${tecnica === k ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-purple-300'}`}>
                  <p className="font-bold text-gray-800 text-sm">{t}</p>
                  <p className="text-xs text-gray-500 mt-1">{d}</p>
                </button>))}
            </div>
          </div>
          <Campo label="Nombre del estudio">
            <input className={inp} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Malbec 2026" />
          </Campo>
          <Campo label={`Vinos (${vinos.length})`} ayuda="Uno por línea. Podés pegar una columna desde Excel.">
            <textarea className={inp + ' h-40 font-mono text-sm'} value={vinosTxt} onChange={e => setVinosTxt(e.target.value)} placeholder={'T1R1\nT1R2\nT2R1\n…'} />
          </Campo>
          <div className="grid grid-cols-3 gap-3">
            <Campo label="Repeticiones"><input type="number" min="1" className={inp} value={reps} onChange={e => setReps(e.target.value)} /></Campo>
            <Campo label="Vinos por sesión"><input type="number" min="1" className={inp} value={porSesion} onChange={e => setPorSesion(e.target.value)} /></Campo>
            <Campo label="Panelistas"><input type="number" min="1" className={inp} value={nPan} onChange={e => setNPan(e.target.value)} /></Campo>
          </div>
          {vinos.length > 0 && Number(reps) > 0 && Number(porSesion) > 0 && (
            <p className="text-sm bg-purple-50 text-purple-900 rounded-lg p-3">
              {vinos.length} vinos × {reps} repeticiones = <b>{vinos.length * reps} muestras</b> →{' '}
              <b>{tamaniosSesiones(vinos.length * reps, Number(porSesion), parejo).length} sesiones</b>{' '}
              ({tamaniosSesiones(vinos.length * reps, Number(porSesion), parejo).join(' + ')})
            </p>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={parejo} onChange={e => setParejo(e.target.checked)} className="w-4 h-4" />
            Repartir parejo entre sesiones (ej. 24 muestras de a 7 → 6+6+6+6 en vez de 7+7+7+3)
          </label>
          <Campo label="Semilla" ayuda="Con la misma semilla y los mismos datos se obtiene exactamente el mismo diseño.">
            <input type="number" className={inp} value={semilla} onChange={e => setSemilla(e.target.value)} />
          </Campo>
          <Campo label={`${esRata ? 'Descriptores' : 'Atributos'} (${atributos.length})`}
            ayuda={<>Uno por línea. Opcional: agrupá con títulos — <code># Aroma</code> para la modalidad y <code>## Cítricos</code> para una categoría.
              Si un descriptor se repite en distintos grupos (ej. Limón en Aroma y en Sabor) la columna se llama “Aroma: Limón”.</>}>
            <textarea className={inp + ' h-56 text-sm font-mono'} value={atrTxt} onChange={e => setAtrTxt(e.target.value)}
              placeholder={'# Aroma\n## Frutal\nFrutos rojos\nCiruela\n## Especiado\nPimienta\n# Boca\nAcidez\nAmargor\nAstringencia'} />
          </Campo>
          {esRata && (
            <Campo label="Escala de intensidad" ayuda="Resultados: 0 = no marcado; 1, 2, 3… = intensidad elegida.">
              <select className={inp} value={escala} onChange={e => setEscala(Number(e.target.value))}>
                <option value={3}>3 puntos: bajo · medio · alto (0–3)</option>
                <option value={5}>5 puntos (0–5)</option>
              </select>
            </Campo>
          )}
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={ordenAzar} onChange={e => setOrdenAzar(e.target.checked)} className="w-4 h-4 mt-0.5" />
            <span>Orden de los {esRata ? 'descriptores' : 'atributos'} al azar para cada panelista (dentro de cada grupo; los títulos quedan en su lugar).
              Reduce el sesgo por posición en la lista.</span>
          </label>
          <button onClick={generar} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg">Generar vista previa</button>
          <Mensaje msg={msg}/>
        </div>
        <div className="lg:col-span-3">
          {!prev
            ? <div className="h-full min-h-[200px] border-2 border-dashed rounded-xl flex items-center justify-center text-gray-400 p-6 text-center">
                Completá los datos y tocá “Generar vista previa”.<br/>Nada se publica hasta que lo guardes.
              </div>
            : <div>
                <h2 className="text-lg font-bold text-gray-800 mb-1">Vista previa: {prev.sesiones.length} sesiones</h2>
                <p className="text-sm text-gray-600 mb-3">
                  <b>{nombreTecnica(tecnica)}</b> · {atributos.length} {esRata ? 'descriptores' : 'atributos'}{desc.hayGrupos ? ` en ${desc.estructura.filter(i => i.t === 'g1').length || desc.estructura.filter(i => i.t === 'g2').length} grupos` : ''} ·{' '}
                  {prev.totalMuestras} muestras ({vinos.length} vinos × {reps} rep.) · {nPan} panelistas · {prev.diseno.length} evaluaciones en total
                </p>
                {!balanceado && (
                  <p className="text-sm bg-amber-50 text-amber-800 p-3 rounded-lg mb-3">
                    Para que el diseño de Williams quede completamente balanceado, el número de panelistas debería ser múltiplo de {
                      [...new Set(prev.sesiones.map(s => s.filasWilliams))].join(' y ')}. Igual se puede usar.
                  </p>
                )}
                <div className="overflow-auto max-h-[420px] border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0"><tr>
                      <th className="p-2 text-left">Sesión</th><th className="p-2 text-left">N</th><th className="p-2 text-left">Vinos (repetición, código)</th>
                    </tr></thead>
                    <tbody>{prev.sesiones.map(s => (
                      <tr key={s.Sesion} className="border-t align-top">
                        <td className="p-2 font-bold">{s.Sesion}</td><td className="p-2">{s.NMuestras}</td>
                        <td className="p-2">{s.muestras.map(m => <span key={m.vino} className="inline-block bg-gray-100 rounded px-2 py-0.5 mr-1 mb-1">{m.vino} <span className="text-gray-500">r{m.rep}</span> <b>{m.codigo}</b></span>)}</td>
                      </tr>))}
                    </tbody>
                  </table>
                </div>
                <button onClick={guardar} disabled={ocupado}
                  className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg disabled:opacity-50">
                  {ocupado ? 'Guardando…' : 'Crear y publicar este estudio'}
                </button>
              </div>}
        </div>
      </div>
    </div>
  );
}

function EstudioAdmin({ eid, volver }) {
  const [est, setEst] = useState(null);
  const [priv, setPriv] = useState(null);
  const [tab, setTab] = useState('progreso');
  const [msg, setMsg] = useState(null);
  const recargar = async () => {
    try { setEst(await datos.leerEstudio(eid)); setPriv(await datos.disenoPrivado(eid)); }
    catch (e) { setMsg({ t: 'error', m: textoError(e) }); }
  };
  useEffect(() => { recargar(); }, [eid]);
  if (!est || !priv) return <div><Mensaje msg={msg}/><p className="text-gray-500">Cargando…</p></div>;
  const tabs = [['progreso', 'Progreso'], ['servicio', 'Planilla de servicio'], ['analisis', 'Análisis en vivo'], ['resultados', 'Resultados'], ['config', 'Configuración']];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3 no-print">
        <button onClick={volver} className="text-sm text-purple-700 hover:underline">← Estudios</button>
        <h2 className="text-xl font-bold text-gray-800">{est.nombre}</h2>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${(TECNICAS[est.tecnica] || TECNICAS.descriptiva).color}`}>{nombreTecnica(est.tecnica)}</span>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${est.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>{est.activo ? 'Activo' : 'Cerrado'}</span>
      </div>
      <div className="flex gap-2 border-b mb-5 no-print overflow-x-auto">
        {tabs.map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 font-semibold rounded-t-lg whitespace-nowrap ${tab === k ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{t}</button>
        ))}
      </div>
      {tab === 'progreso' && <Progreso eid={eid} est={est} />}
      {tab === 'servicio' && <Servicio est={est} priv={priv} />}
      {tab === 'analisis' && <Analisis eid={eid} est={est} priv={priv} />}
      {tab === 'resultados' && <Resultados eid={eid} est={est} priv={priv} />}
      {tab === 'config' && <Configuracion eid={eid} est={est} recargar={recargar} borrado={volver} />}
    </div>
  );
}

function Progreso({ eid, est }) {
  const [prog, setProg] = useState(null);
  useEffect(() => datos.observarProgresoEstudio(eid, setProg), [eid]);
  if (!prog) return <p className="text-gray-500">Cargando…</p>;
  const sesiones = est.sesiones, pans = est.panelistas;
  const cuenta = (v, s) => ((prog[v] && prog[v][s]) || []).length;
  const completas = pans.reduce((acc, v) => acc + sesiones.filter(s => cuenta(v, s.Sesion) >= s.NMuestras).length, 0);
  return (
    <div>
      <p className="text-gray-700 mb-3"><b>{completas}</b> de <b>{pans.length * sesiones.length}</b> sesiones completadas <span className="text-xs text-emerald-600 ml-2">● en vivo</span></p>
      <div className="overflow-auto max-h-[70vh] border rounded-lg">
        <table className="text-sm">
          <thead className="bg-gray-100 sticky top-0"><tr>
            <th className="p-2 text-left sticky left-0 bg-gray-100">Panelista</th>
            {sesiones.map(s => <th key={s.Sesion} className="p-2 text-center whitespace-nowrap">{s.Sesion}<div className="text-xs font-normal text-gray-500">{s.NMuestras} muestras</div></th>)}
          </tr></thead>
          <tbody>{pans.map(v => (
            <tr key={v} className="border-t">
              <td className="p-2 font-bold sticky left-0 bg-white">{v}</td>
              {sesiones.map(s => {
                const c = cuenta(v, s.Sesion);
                const cls = c >= s.NMuestras ? 'bg-emerald-500 text-white' : c > 0 ? 'bg-amber-300 text-amber-900' : 'bg-gray-100 text-gray-400';
                return <td key={s.Sesion} className="p-1 text-center"><span className={`inline-block w-14 rounded py-1 font-semibold ${cls}`}>{c >= s.NMuestras ? '✔' : `${c}/${s.NMuestras}`}</span></td>;
              })}
            </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Servicio({ est, priv }) {
  const [s, setS] = useState('');
  if (!est.sesiones.length) return <p className="text-gray-500">El estudio no tiene sesiones.</p>;
  const sel = s || est.sesiones[0].Sesion;
  const ses = est.sesiones.find(x => x.Sesion === sel);
  const filas = priv.filas.filter(d => d.Sesion === sel);
  const pans = [...new Set(filas.map(d => d.Valuador))].sort(ordenNatural);
  const clave = {}; filas.forEach(d => { clave[d.NombreProducto] = { codigo: d.CodigoProducto, rep: d.Rep }; });
  return (
    <div>
      <div className="flex flex-wrap gap-3 items-center mb-4 no-print">
        <label className="font-semibold text-gray-700">Sesión</label>
        <select value={sel} onChange={e => setS(e.target.value)} className="border-2 border-gray-200 rounded-lg px-3 py-2">
          {est.sesiones.map(x => <option key={x.Sesion} value={x.Sesion}>{x.Sesion} — {x.NMuestras} muestras</option>)}
        </select>
        <button onClick={() => window.print()} className="bg-gray-800 text-white px-4 py-2 rounded-lg font-semibold">Imprimir</button>
      </div>
      <h2 className="text-xl font-bold mb-1">{est.nombre} — Sesión {sel} ({ses.NMuestras} muestras)</h2>
      <h3 className="font-semibold mt-4 mb-2">Orden de servicio (vino → código)</h3>
      <table className="text-sm border mb-6">
        <thead className="bg-gray-100"><tr><th className="p-2 border">Vino</th><th className="p-2 border">Repetición</th><th className="p-2 border">Código</th></tr></thead>
        <tbody>{Object.keys(clave).sort(ordenNatural).map(v => (
          <tr key={v}><td className="p-2 border">{v}</td><td className="p-2 border text-center">{clave[v].rep}</td><td className="p-2 border text-center font-bold text-lg">{clave[v].codigo}</td></tr>))}
        </tbody>
      </table>
      <h3 className="font-semibold mb-2">Bandeja por panelista (orden de presentación)</h3>
      <table className="text-sm border">
        <thead className="bg-gray-100"><tr><th className="p-2 border">Panelista</th>{Array.from({ length: ses.NMuestras }, (_, i) => <th key={i} className="p-2 border">{i + 1}º</th>)}</tr></thead>
        <tbody>{pans.map(v => (
          <tr key={v}><td className="p-2 border font-bold">{v}</td>
            {filas.filter(d => d.Valuador === v).sort((a, b) => a.Orden - b.Orden).map(d =>
              <td key={d.Orden} className="p-2 border text-center"><div className="font-bold text-base">{d.CodigoProducto}</div><div className="text-xs text-gray-500">{d.NombreProducto}</div></td>)}
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}

// arma las filas de resultados con el vino y la repetición (que el panelista nunca ve)
function filasResultados(est, priv, respuestas) {
  const info = {}; priv.filas.forEach(d => { info[`${d.Valuador}_${d.Sesion}_${d.Orden}`] = d; });
  return respuestas.map(r => {
    const d = info[`${r.Valuador}_${r.Sesion}_${r.Orden}`] || {};
    const o = { Estudio: est.nombre, Sesion: r.Sesion, Valuador: r.Valuador, Orden: r.Orden,
      NombreProducto: d.NombreProducto || '', Rep: d.Rep || '', CodigoProducto: r.CodigoProducto, timestamp: r.ts || '' };
    est.atributos.forEach(a => { o[a] = r.valores ? r.valores[a] : ''; });
    return o;
  }).sort((a, b) => ordenNatural(a.Sesion, b.Sesion) || ordenNatural(a.Valuador, b.Valuador) || a.Orden - b.Orden);
}
function aCSV(filas, cols, sep, coma) {
  const esc = v => {
    let t = (typeof v === 'number' && coma) ? String(v).replace('.', ',') : String(v ?? '');
    return /["\n\r]/.test(t) || t.includes(sep) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return '﻿' + [cols.map(esc).join(sep)].concat(filas.map(f => cols.map(c => esc(f[c])).join(sep))).join('\r\n');
}
function descargar(nombre, texto) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- Análisis en vivo: medias, frecuencias (RATA), ANOVA orientativa y PCA
const estrellas = p => p == null ? '' : p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : p < 0.1 ? '·' : 'ns';
const fmtP = p => p == null ? '—' : p < 0.001 ? '<0,001' : p.toFixed(3).replace('.', ',');
const fmt = (x, d = 2) => Number(x).toFixed(d).replace('.', ',');

function Biplot({ pca, inv1, inv2, svgRef }) {
  const W = 640, H = 520, m = 40;
  const s1 = inv1 ? -1 : 1, s2 = inv2 ? -1 : 1;
  const ind = pca.ind.map(p => ({ ...p, x: p.x * s1, y: p.y * s2 }));
  const vars = pca.vars.map(v => ({ ...v, x: v.x * s1, y: v.y * s2 }));
  const rInd = Math.max(1e-9, ...ind.map(p => Math.hypot(p.x, p.y)));
  const k = rInd * 0.95; // flechas (correlaciones, máx. 1) escaladas al tamaño de la nube de vinos
  const lim = rInd * 1.25;
  const X = x => W / 2 + (x / lim) * (W / 2 - m), Y = y => H / 2 - (y / lim) * (H / 2 - m);
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border rounded-lg" xmlns="http://www.w3.org/2000/svg" fontFamily="sans-serif">
      <defs><marker id="flecha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#db2777"/></marker></defs>
      <line x1={m} x2={W - m} y1={H / 2} y2={H / 2} stroke="#cbd5e1" strokeDasharray="4 4"/>
      <line y1={m} y2={H - m} x1={W / 2} x2={W / 2} stroke="#cbd5e1" strokeDasharray="4 4"/>
      <text x={W - 4} y={H / 2 + 16} textAnchor="end" fontSize="12" fill="#64748b">Dim 1 ({fmt(pca.pct[0], 1)}%)</text>
      <text x={W / 2 + 6} y={14} fontSize="12" fill="#64748b">Dim 2 ({fmt(pca.pct[1], 1)}%)</text>
      {vars.map(v => (
        <g key={v.a}>
          <line x1={X(0)} y1={Y(0)} x2={X(v.x * k)} y2={Y(v.y * k)} stroke="#db2777" strokeWidth="1.5" markerEnd="url(#flecha)" opacity="0.75"/>
          <text x={X(v.x * k * 1.08)} y={Y(v.y * k * 1.08)} fontSize="11" fill="#be185d" textAnchor={v.x >= 0 ? 'start' : 'end'} dominantBaseline="middle">{v.a}</text>
        </g>))}
      {ind.map(p => (
        <g key={p.v}>
          <circle cx={X(p.x)} cy={Y(p.y)} r="5" fill="#4f46e5"/>
          <text x={X(p.x) + 7} y={Y(p.y) - 7} fontSize="13" fontWeight="bold" fill="#1e1b4b">{p.v}</text>
        </g>))}
    </svg>
  );
}

function Analisis({ eid, est, priv }) {
  const [resp, setResp] = useState(null);
  const [msg, setMsg] = useState(null);
  const [filtro, setFiltro] = useState('todos');
  const [sesion, setSesion] = useState('');
  const [inv1, setInv1] = useState(false), [inv2, setInv2] = useState(false);
  const svgRef = React.useRef(null);
  useEffect(() => datos.observarRespuestas(eid, setResp, e => setMsg({ t: 'error', m: textoError(e) })), [eid]);
  const esRata = est.tecnica === 'rata';
  const res = useMemo(() => {
    if (!resp) return null;
    const filas = filasResultados(est, priv, resp).filter(f => !sesion || f.Sesion === sesion);
    const base = analizar(filas, est.atributos, { rata: esRata });
    let usar = est.atributos;
    if (filtro === 'p05') usar = usar.filter(a => base.anova[a].p != null && base.anova[a].p < 0.05);
    if (filtro === 'p10') usar = usar.filter(a => base.anova[a].p != null && base.anova[a].p < 0.10);
    if (filtro === 'cit10') usar = usar.filter(a => base.vinos.some(v => base.frec[v][a] >= 0.10));
    const final = usar.length === est.atributos.length ? base : { ...base, pca: analizar(filas, usar, { rata: esRata }).pca };
    return { ...final, filas, usar, panelistas: new Set(filas.map(f => f.Valuador)).size };
  }, [resp, filtro, sesion]);
  if (!res) return <div><Mensaje msg={msg}/><p className="text-gray-500">Cargando respuestas…</p></div>;
  const orden = [...est.atributos].sort((a, b) => (res.anova[a].p ?? 2) - (res.anova[b].p ?? 2));
  const maxM = esRata ? (est.escala || 3) : 10;
  const color = x => `rgba(219,39,119,${Math.min(1, x / maxM) * 0.85})`;
  const minN = Math.min(...res.vinos.map(v => res.n[v]));
  const bajarSVG = () => {
    const t = new XMLSerializer().serializeToString(svgRef.current);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'image/svg+xml' }));
    a.download = est.nombre.replace(/[^\w\-]+/g, '_') + '_PCA.svg'; a.click();
  };
  return (
    <div>
      <Mensaje msg={msg}/>
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <span className="text-gray-700"><b>{res.filas.length}</b> evaluaciones · <b>{res.panelistas}</b> panelistas · <b>{res.vinos.length}</b> vinos</span>
        <span className="text-xs text-emerald-600">● en vivo</span>
        <select value={sesion} onChange={e => setSesion(e.target.value)} className="border-2 border-gray-200 rounded-lg px-2 py-1">
          <option value="">Todas las sesiones</option>
          {est.sesiones.map(s => <option key={s.Sesion} value={s.Sesion}>Sesión {s.Sesion}</option>)}
        </select>
        <select value={filtro} onChange={e => setFiltro(e.target.value)} className="border-2 border-gray-200 rounded-lg px-2 py-1">
          <option value="todos">PCA con todos los {esRata ? 'descriptores' : 'atributos'}</option>
          <option value="p05">Solo los que discriminan (p &lt; 0,05)</option>
          <option value="p10">Solo los que discriminan (p &lt; 0,10)</option>
          {esRata && <option value="cit10">Solo los citados ≥ 10% en algún vino</option>}
        </select>
      </div>
      {res.vinos.length > 0 && minN < 3 && (
        <p className="text-sm bg-amber-50 text-amber-800 p-3 rounded-lg mb-4">Todavía hay pocos datos (algún vino tiene {minN} evaluación{minN === 1 ? '' : 'es'}): los resultados van a cambiar bastante a medida que lleguen más respuestas.</p>
      )}
      <div className="grid xl:grid-cols-2 gap-6">
        <div>
          <h3 className="font-bold text-gray-800 mb-2">PCA (medias por vino, estandarizado)</h3>
          {res.pca
            ? <>
                <Biplot pca={res.pca} inv1={inv1} inv2={inv2} svgRef={svgRef}/>
                <div className="flex flex-wrap gap-4 items-center text-xs text-gray-600 mt-2">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={inv1} onChange={e => setInv1(e.target.checked)}/> Invertir Dim 1</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={inv2} onChange={e => setInv2(e.target.checked)}/> Invertir Dim 2</label>
                  <button onClick={bajarSVG} className="underline text-purple-700">Descargar gráfico (SVG)</button>
                  {res.pca.excluidos.length > 0 && <span>Sin variación (no entran): {res.pca.excluidos.join(', ')}</span>}
                </div>
                <p className="text-xs text-gray-500 mt-2">Igual que <code>FactoMineR::PCA(medias, scale.unit = TRUE)</code>. El signo de cada eje es arbitrario: si sale espejado respecto de R, usá “Invertir”.</p>
              </>
            : <p className="text-gray-500 border-2 border-dashed rounded-xl p-8 text-center">Se necesitan al menos 3 vinos con datos y 2 {esRata ? 'descriptores' : 'atributos'} que varíen entre vinos.</p>}
        </div>
        <div>
          <h3 className="font-bold text-gray-800 mb-2">Medias por vino {esRata && <span className="font-normal text-gray-500 text-sm">(0–{est.escala || 3}; entre paréntesis, % de citación)</span>}</h3>
          <div className="overflow-auto max-h-[560px] border rounded-lg">
            <table className="text-xs">
              <thead className="bg-gray-100 sticky top-0"><tr>
                <th className="p-2 text-left sticky left-0 bg-gray-100">{esRata ? 'Descriptor' : 'Atributo'}</th>
                {res.vinos.map(v => <th key={v} className="p-2 text-center whitespace-nowrap">{v}<div className="font-normal text-gray-500">n={res.n[v]}</div></th>)}
                <th className="p-2 text-center">F</th><th className="p-2 text-center">p</th>
              </tr></thead>
              <tbody>{orden.map(a => (
                <tr key={a} className={`border-t ${res.usar.includes(a) ? '' : 'opacity-50'}`}>
                  <td className="p-2 font-semibold whitespace-nowrap sticky left-0 bg-white">{a}</td>
                  {res.vinos.map(v => (
                    <td key={v} className="p-2 text-center whitespace-nowrap" style={{ background: color(res.medias[v][a]), color: res.medias[v][a] / maxM > 0.55 ? 'white' : undefined }}>
                      {fmt(res.medias[v][a])}{esRata && <span className="opacity-75"> ({Math.round(100 * res.frec[v][a])}%)</span>}
                    </td>))}
                  <td className="p-2 text-center">{res.anova[a].p == null ? '—' : isFinite(res.anova[a].F) ? fmt(res.anova[a].F) : '∞'}</td>
                  <td className="p-2 text-center whitespace-nowrap">{fmtP(res.anova[a].p)} <b>{estrellas(res.anova[a].p)}</b></td>
                </tr>))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            F y p: ANOVA de dos factores (vino + panelista) por {esRata ? 'descriptor, con el 0 de “no marcado” incluido, como recomiendan Meyners, Jaeger y Ares (2016)' : 'atributo'}.
            Es orientativa para mirar en el momento; para el análisis formal usá el CSV en R. *** p&lt;0,001 · ** p&lt;0,01 · * p&lt;0,05 · “·” p&lt;0,10.
          </p>
        </div>
      </div>
    </div>
  );
}

function Resultados({ eid, est, priv }) {
  const [filas, setFilas] = useState(null);
  const [msg, setMsg] = useState(null);
  const cargar = async () => {
    setMsg(null);
    try { setFilas(filasResultados(est, priv, await datos.respuestasEstudio(eid))); }
    catch (e) { setMsg({ t: 'error', m: textoError(e) }); }
  };
  useEffect(() => { cargar(); }, [eid]);
  const cols = ['Estudio', 'Sesion', 'Valuador', 'Orden', 'NombreProducto', 'Rep', 'CodigoProducto', 'timestamp', ...est.atributos];
  const base = est.nombre.replace(/[^\w\-]+/g, '_');
  const esperadas = priv.filas.length;
  return (
    <div>
      <Mensaje msg={msg}/>
      {!filas ? <p className="text-gray-500">Cargando…</p> : (
        <div>
          <p className="text-gray-700 mb-4"><b>{filas.length}</b> respuestas de <b>{esperadas}</b> esperadas.</p>
          <div className="flex flex-wrap gap-3 mb-5">
            <button onClick={() => descargar(`${base}_respuestas.csv`, aCSV(filas, cols, ',', false))} disabled={!filas.length}
              className={btn + ' bg-emerald-600 hover:bg-emerald-700 text-white'}>Descargar CSV (para R)</button>
            <button onClick={() => descargar(`${base}_respuestas_excel.csv`, aCSV(filas, cols, ';', true))} disabled={!filas.length}
              className={btn + ' bg-emerald-100 hover:bg-emerald-200 text-emerald-800'}>Descargar CSV (para Excel en español)</button>
            <button onClick={cargar} className={btn + ' bg-gray-100 hover:bg-gray-200'}>Actualizar</button>
          </div>
          <p className="text-xs text-gray-500 mb-2">“Para R”: separador coma y punto decimal (read.csv). “Para Excel”: separador punto y coma y coma decimal.
            {est.tecnica === 'rata' && <> En RATA cada descriptor vale 0 si no fue marcado y 1–{est.escala || 3} según la intensidad elegida.</>}</p>
          {filas.length > 0 && (
            <div className="overflow-auto max-h-[50vh] border rounded-lg">
              <table className="text-xs">
                <thead className="bg-gray-100 sticky top-0"><tr>{cols.map(c => <th key={c} className="p-2 text-left whitespace-nowrap">{c}</th>)}</tr></thead>
                <tbody>{filas.slice(0, 200).map((f, i) => <tr key={i} className="border-t">{cols.map(c => <td key={c} className="p-2 whitespace-nowrap">{String(f[c])}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Configuracion({ eid, est, recargar, borrado }) {
  const [nombre, setNombre] = useState(est.nombre);
  const [confirmaTxt, setConfirmaTxt] = useState('');
  const [msg, setMsg] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const link = `${urlBase()}?e=${eid}`;
  const hacer = async (fn, ok) => { setMsg(null); try { await fn(); setMsg({ t: 'ok', m: ok }); await recargar(); } catch (e) { setMsg({ t: 'error', m: textoError(e) }); } };
  return (
    <div className="space-y-6 max-w-2xl">
      <Mensaje msg={msg}/>
      <section>
        <h3 className="font-bold text-gray-800 mb-2">Link directo para los panelistas</h3>
        <p className="text-sm text-gray-600 mb-2">Abre este estudio sin pasar por la lista (útil para un QR).</p>
        <div className="flex gap-2">
          <input readOnly value={link} className={inp + ' mt-0 text-sm'} onFocus={e => e.target.select()} />
          <button onClick={() => { navigator.clipboard && navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }}
            className={btn + ' bg-gray-100 hover:bg-gray-200 whitespace-nowrap'}>{copiado ? '¡Copiado!' : 'Copiar'}</button>
        </div>
      </section>
      <section>
        <h3 className="font-bold text-gray-800 mb-2">Estado</h3>
        <p className="text-sm text-gray-600 mb-2">{est.activo ? 'Activo: aparece para los panelistas y acepta respuestas.' : 'Cerrado: no aparece para los panelistas y no acepta respuestas nuevas.'}</p>
        <button onClick={() => hacer(() => datos.actualizarEstudio(eid, { activo: !est.activo }), est.activo ? 'Estudio cerrado.' : 'Estudio reabierto.')}
          className={btn + (est.activo ? ' bg-amber-500 hover:bg-amber-600 text-white' : ' bg-emerald-600 hover:bg-emerald-700 text-white')}>
          {est.activo ? 'Cerrar estudio' : 'Reabrir estudio'}</button>
      </section>
      <section>
        <h3 className="font-bold text-gray-800 mb-2">Nombre</h3>
        <div className="flex gap-2">
          <input className={inp + ' mt-0'} value={nombre} onChange={e => setNombre(e.target.value)} />
          <button disabled={!nombre.trim() || nombre === est.nombre} onClick={() => hacer(() => datos.actualizarEstudio(eid, { nombre: nombre.trim() }), 'Nombre actualizado.')}
            className={btn + ' bg-purple-600 hover:bg-purple-700 text-white'}>Guardar</button>
        </div>
      </section>
      <section className="border-2 border-red-200 rounded-xl p-4">
        <h3 className="font-bold text-red-700 mb-2">Borrar estudio</h3>
        <p className="text-sm text-gray-700 mb-2">Borra el estudio <b>y todas sus respuestas</b>. No se puede deshacer: descargá antes los resultados.
          Para confirmar, escribí el nombre del estudio:</p>
        <div className="flex gap-2">
          <input className={inp + ' mt-0'} value={confirmaTxt} onChange={e => setConfirmaTxt(e.target.value)} placeholder={est.nombre} />
          <button disabled={confirmaTxt !== est.nombre} onClick={async () => { try { await datos.borrarEstudio(eid); borrado(); } catch (e) { setMsg({ t: 'error', m: textoError(e) }); } }}
            className={btn + ' bg-red-600 hover:bg-red-700 text-white whitespace-nowrap'}>Borrar definitivamente</button>
        </div>
      </section>
    </div>
  );
}

function Administradores({ yo }) {
  const [lista, setLista] = useState(null);
  const [nuevo, setNuevo] = useState('');
  const [msg, setMsg] = useState(null);
  const cargar = () => datos.listarAdmins().then(setLista).catch(e => setMsg({ t: 'error', m: textoError(e) }));
  useEffect(() => { cargar(); }, []);
  const valido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nuevo.trim());
  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Administradores</h2>
      <p className="text-sm text-gray-600 mb-4">Cuentas de Google que pueden crear estudios y ver resultados.</p>
      <Mensaje msg={msg}/>
      {!lista ? <p className="text-gray-500">Cargando…</p> : (
        <ul className="divide-y border rounded-lg mb-4">{lista.map(e => (
          <li key={e} className="flex items-center justify-between p-3">
            <span>{e}{e === yo && <span className="text-xs text-gray-400 ml-2">(vos)</span>}</span>
            {e !== yo && <button onClick={async () => { try { await datos.quitarAdmin(e); cargar(); } catch (x) { setMsg({ t: 'error', m: textoError(x) }); } }}
              className="text-sm text-red-600 hover:underline">Quitar</button>}
          </li>))}
        </ul>
      )}
      <div className="flex gap-2">
        <input className={inp + ' mt-0'} value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="correo@gmail.com" />
        <button disabled={!valido} onClick={async () => { try { await datos.agregarAdmin(nuevo); setNuevo(''); cargar(); } catch (x) { setMsg({ t: 'error', m: textoError(x) }); } }}
          className={btn + ' bg-purple-600 hover:bg-purple-700 text-white whitespace-nowrap'}>Agregar</button>
      </div>
    </div>
  );
}

// =====================================================================
function Raiz() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const f = () => setHash(location.hash); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return hash === '#admin' ? <AdminApp/> : <PanelApp/>;
}
createRoot(document.getElementById('root')).render(<Raiz/>);
