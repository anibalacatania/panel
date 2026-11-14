import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import * as datos from 'datos';
import { ordenNatural, tamaniosSesiones, generarDiseno, generarDisenoFlash, LETRAS } from './diseno.js';
import { TECNICAS, nombreTecnica, etiquetasRata, parsearDescriptores, bloquesDe, rangosDesdePosiciones, HOJAS, claveX, claveY } from './tecnicas.js';
import { analizar, afm } from './analisis.js';

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
          <p className="text-xs text-gray-400 mt-1">{nombreTecnica(estudio.tecnica)} • {estudio.sesiones.length} sesiones{estudio.tecnica === 'flash' || estudio.tecnica === 'napping' ? '' : ` • ${atributos.length} ${esRata ? 'descriptores' : 'atributos'}`}</p>
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
  if (estudio.tecnica === 'napping') {
    return <SesionNapping eid={eid} estudio={estudio} valuador={valuador} sesion={sesion} muestras={filas}
      pendientes={pendientes} cerrado={cerrado} setCerrado={setCerrado} salir={() => setVista('sesiones')}
      alTerminar={ordenes => {
        setHechasLocal(prev => ({ ...prev, [sesion.Sesion]: [...new Set([...(prev[sesion.Sesion] || []), ...ordenes])] }));
        setVista('finSesion'); window.scrollTo(0, 0);
      }} />;
  }
  if (estudio.tecnica === 'flash') {
    return <SesionFlash eid={eid} estudio={estudio} valuador={valuador} sesion={sesion} muestras={filas}
      previos={progreso && progreso._atributos} pendientes={pendientes} cerrado={cerrado} setCerrado={setCerrado}
      salir={() => setVista('sesiones')}
      alTerminar={ordenes => {
        setHechasLocal(prev => ({ ...prev, [sesion.Sesion]: [...new Set([...(prev[sesion.Sesion] || []), ...ordenes])] }));
        setVista('finSesion'); window.scrollTo(0, 0);
      }} />;
  }
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

// ---- Perfil Flash (Delarue, cap. 7): cada panelista crea sus descriptores y, para cada uno, ordena todas las
// copas (letras) de menos a más, con empates. Las copas se arrastran con el dedo; apilarlas = empate.

// mueve una copa: tipo 'unir' (apilar en el grupo i = empate), 'insertar' (nuevo lugar k) o 'bandeja' (sacar)
function moverCopa(grupos, orden, destino) {
  const g = grupos.map(x => x.filter(o => o !== orden));
  if (destino.tipo === 'unir') g[destino.i].push(orden);
  else if (destino.tipo === 'insertar') g.splice(destino.k, 0, [orden]);
  return g.filter(x => x.length);
}

function TableroOrden({ muestras, grupos, setGrupos, izq, der }) {
  const porOrden = useMemo(() => Object.fromEntries(muestras.map(m => [m.Orden, m])), [muestras]);
  const ubicadas = new Set(grupos.flat());
  const sueltas = muestras.filter(m => !ubicadas.has(m.Orden));
  const [drag, setDrag] = useState(null);        // { orden, x, y, destino, barra }
  const [sel, setSel] = useState(null);          // modo tocar: copa elegida
  const ini = React.useRef(null);
  const tablero = React.useRef(null), bandeja = React.useRef(null), cols = React.useRef([]);
  const n = muestras.length;
  const lado = `min(3.5rem, calc((100vw - 3rem) / ${Math.max(5, n)} - 0.5rem))`;

  const destinoEn = (x, y) => {
    const dentro = (r, m = 0) => r && x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;
    const rb = bandeja.current && bandeja.current.getBoundingClientRect();
    if (dentro(rb, 8)) return { tipo: 'bandeja' };
    const rt = tablero.current && tablero.current.getBoundingClientRect();
    if (!rt || y < rt.top - 40 || y > rt.bottom + 60) return null;
    const rs = grupos.map((_, i) => cols.current[i] && cols.current[i].getBoundingClientRect()).filter(Boolean);
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i], m = r.width * 0.22;
      if (x >= r.left + m && x <= r.right - m) return { tipo: 'unir', i };
    }
    let k = rs.filter(r => (r.left + r.right) / 2 < x).length;
    const xb = !rs.length ? rt.left + rt.width / 2 : k === 0 ? rs[0].left - 6 : k === rs.length ? rs[rs.length - 1].right + 6 : (rs[k - 1].right + rs[k].left) / 2;
    return { tipo: 'insertar', k, barra: xb - rt.left };
  };

  const abajo = (e, orden) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    ini.current = { orden, x: e.clientX, y: e.clientY, mov: false };
  };
  const mueve = (e) => {
    const s = ini.current; if (!s) return;
    if (!s.mov && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return;
    s.mov = true; setSel(null);
    setDrag({ orden: s.orden, x: e.clientX, y: e.clientY, destino: destinoEn(e.clientX, e.clientY) });
  };
  const arriba = (e) => {
    const s = ini.current; ini.current = null;
    if (!s) return;
    if (s.mov) {
      const d = destinoEn(e.clientX, e.clientY);
      if (d) setGrupos(moverCopa(grupos, s.orden, d));
      setDrag(null);
    } else {
      // tocar: con otra copa elegida, tocar una copa ya ubicada = apilar ahí; si no, elegir/soltar esta
      const i = grupos.findIndex(g => g.includes(s.orden));
      if (sel != null && sel !== s.orden && i >= 0) { setGrupos(moverCopa(grupos, sel, { tipo: 'unir', i })); setSel(null); }
      else setSel(x => (x === s.orden ? null : s.orden));
    }
  };
  const cancelar = () => { ini.current = null; setDrag(null); };
  const tocar = (destino) => { if (sel != null) { setGrupos(moverCopa(grupos, sel, destino)); setSel(null); } };

  // (función, no componente: así el elemento no se re-crea durante el arrastre y no se pierde el dedo)
  const copa = (orden) => {
    const m = porOrden[orden];
    const arrastrando = drag && drag.orden === orden;
    return (
      <div key={orden} onClick={e => e.stopPropagation()} onPointerDown={e => abajo(e, orden)} onPointerMove={mueve} onPointerUp={arriba} onPointerCancel={cancelar}
        data-copa={m.CodigoProducto}
        style={{ width: lado, height: lado, touchAction: 'none' }}
        className={`select-none cursor-grab active:cursor-grabbing rounded-xl flex items-center justify-center font-black text-2xl shadow-lg border-2 transition-transform
          bg-gradient-to-br from-yellow-300 to-orange-500 text-gray-900
          ${arrastrando ? 'opacity-30' : ''} ${sel === orden ? 'ring-4 ring-pink-400 border-white scale-110' : 'border-orange-600/40'}`}>
        {m.CodigoProducto}
      </div>
    );
  };

  const d = drag && drag.destino;
  return (
    <div>
      {/* bandeja: copas sin ubicar */}
      <div ref={bandeja} onClick={() => tocar({ tipo: 'bandeja' })} data-zona="bandeja"
        className={`rounded-2xl border-2 border-dashed p-3 mb-4 min-h-[4.5rem] ${d && d.tipo === 'bandeja' ? 'border-pink-400 bg-pink-500/10' : 'border-white/30'}`}>
        <p className="text-xs text-purple-200 mb-2">{sueltas.length ? 'Copas sin ubicar — arrastralas a la línea' : 'Todas las copas están ubicadas ✓'}</p>
        <div className="flex flex-wrap gap-2">{sueltas.map(m => copa(m.Orden))}</div>
      </div>

      {/* línea de menos a más */}
      <div className="relative">
        <div ref={tablero} data-zona="linea" className="relative flex items-end gap-2 min-h-[9rem] px-2 pb-2 pt-3 rounded-2xl bg-slate-900/40 overflow-x-auto">
          {sel != null && <button onClick={() => tocar({ tipo: 'insertar', k: 0 })} className="self-stretch px-2 rounded-lg border-2 border-dashed border-pink-400 text-pink-300 font-bold" data-insertar="0">＋</button>}
          {grupos.map((g, i) => (
            <React.Fragment key={g.join('-')}>
              <div ref={el => { cols.current[i] = el; }} onClick={() => tocar({ tipo: 'unir', i })} data-grupo={i}
                className={`flex flex-col-reverse items-center gap-1 p-1 rounded-xl ${d && d.tipo === 'unir' && d.i === i ? 'bg-pink-500/30 ring-2 ring-pink-400' : sel != null ? 'bg-white/5 ring-1 ring-white/20' : ''}`}>
                {g.map(o => copa(o))}
                {g.length > 1 && <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wide">empate</span>}
              </div>
              {sel != null && <button onClick={() => tocar({ tipo: 'insertar', k: i + 1 })} className="self-stretch px-2 rounded-lg border-2 border-dashed border-pink-400 text-pink-300 font-bold" data-insertar={i + 1}>＋</button>}
            </React.Fragment>
          ))}
          {!grupos.length && <p className="m-auto text-purple-200/70 text-sm text-center px-4">Arrastrá acá las copas: a la izquierda la que menos tiene, a la derecha la que más.<br/>Si dos son iguales, poné una encima de la otra.</p>}
          {d && d.tipo === 'insertar' && <div className="absolute top-2 bottom-2 w-1 rounded bg-pink-400 shadow-[0_0_12px_rgba(244,114,182,0.9)]" style={{ left: d.barra - 2 }} />}
        </div>
        <div className="flex items-center gap-2 mt-2 text-sm font-bold">
          <span className="text-sky-300 whitespace-nowrap">− {izq || 'menos'}</span>
          <div className="flex-1 h-1 rounded bg-gradient-to-r from-sky-400 to-pink-500 relative"><span className="absolute -right-1 -top-2 text-pink-500">▶</span></div>
          <span className="text-pink-300 whitespace-nowrap">{der || 'más'} +</span>
        </div>
      </div>

      {sel != null && <p className="text-xs text-pink-200 mt-2">Copa {porOrden[sel].CodigoProducto} elegida: tocá una columna para apilarla (empate), un ＋ para ponerla en un lugar nuevo, o la bandeja para sacarla.</p>}

      {drag && (
        <div className="fixed z-50 pointer-events-none rounded-xl flex items-center justify-center font-black text-2xl shadow-2xl bg-gradient-to-br from-yellow-300 to-orange-500 text-gray-900 border-2 border-white"
          style={{ width: 56, height: 56, left: drag.x - 28, top: drag.y - 28, transform: 'rotate(-6deg) scale(1.1)' }}>
          {porOrden[drag.orden].CodigoProducto}
        </div>
      )}
    </div>
  );
}

const textoLinea = (muestras, grupos) => {
  const c = Object.fromEntries(muestras.map(m => [m.Orden, m.CodigoProducto]));
  return grupos.map(g => g.map(o => c[o]).sort().join(' = '));
};

function SesionFlash({ eid, estudio, valuador, sesion, muestras: muestras0, previos, pendientes, cerrado, setCerrado, alTerminar, salir }) {
  const muestras = useMemo(() => [...muestras0].sort((a, b) => String(a.CodigoProducto).localeCompare(String(b.CodigoProducto))), [muestras0]);
  const clave = `pf_flash2_${eid}_${valuador}_${sesion.Sesion}`;
  const [st, setSt] = useState(() => LS.get(clave, null) || {
    paso: 'desc', i: 0, orden: {},
    atributos: (previos || []).map(n => ({ n, def: '', izq: '', der: '' })),
  });
  const [nuevo, setNuevo] = useState('');
  const [nuevo2, setNuevo2] = useState('');
  const [aviso, setAviso] = useState('');
  useEffect(() => { LS.set(clave, st); }, [st]);
  const upd = c => setSt(prev => ({ ...prev, ...(typeof c === 'function' ? c(prev) : c) }));
  const nombres = st.atributos.map(a => a.n);
  const ideas = useMemo(() => {
    const p = parsearDescriptores((estudio.sugerencias || []).join('\n'));
    return bloquesDe({ estructura: p.estructura, atributos: p.claves }, '').map(b => ({ ...b, attrs: [...b.attrs].sort((x, y) => x.n.localeCompare(y.n, 'es')) }));
  }, [estudio]);

  const agregar = (txt, alFinal) => {
    const t = String(txt || '').replace(/\s+/g, ' ').trim().replace(/\|/g, '/').slice(0, 60);
    if (!t) return false;
    if (nombres.some(x => x.toLowerCase() === t.toLowerCase())) { setAviso(`“${t}” ya está en tu lista.`); return false; }
    setAviso(''); upd(prev => ({ atributos: [...prev.atributos, { n: t, def: '', izq: '', der: '' }] }));
    return true;
  };
  const cambiarAttr = (n, c) => upd(prev => ({ atributos: prev.atributos.map(x => (x.n === n ? { ...x, ...c } : x)) }));
  const quitar = (n) => upd(prev => ({ atributos: prev.atributos.filter(a => a.n !== n) }));
  const gruposDe = a => st.orden[a] || [];
  const completo = a => gruposDe(a).flat().length === muestras.length;

  const enviar = () => {
    const def = {};
    st.atributos.forEach(a => {
      const esc = (a.izq.trim() || a.der.trim()) ? `Escala: ${a.izq.trim() || 'menos'} → ${a.der.trim() || 'más'}. ` : '';
      const t = (esc + a.def.trim()).trim(); if (t) def[a.n] = t.slice(0, 300);
    });
    const rangos = {};
    nombres.forEach(a => { const pos = {}; gruposDe(a).forEach((g, i) => g.forEach(o => { pos[o] = i + 1; })); rangos[a] = rangosDesdePosiciones(pos); });
    const payload = muestras.map(m => {
      const valores = {}; nombres.forEach(a => { valores[a] = rangos[a][m.Orden]; });
      return { Orden: m.Orden, CodigoProducto: m.CodigoProducto, valores };
    });
    datos.guardarFlash(eid, { Sesion: sesion.Sesion, Valuador: valuador, muestras: payload, atributos: nombres, def })
      .catch(e => { if (e && e.code === 'permission-denied') setCerrado(true); });
    try { localStorage.removeItem(clave); } catch {}
    alTerminar(muestras.map(m => m.Orden));
  };

  const caja = 'bg-white/10 backdrop-blur-lg rounded-2xl p-5 mb-5 border border-white/20';
  const btnP = 'w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-4 rounded-xl shadow-2xl text-lg disabled:opacity-40';
  const btnS = 'w-full bg-white/10 hover:bg-white/20 border-2 border-white/30 text-white font-semibold py-3 rounded-xl';
  const cabecera = (
    <div className={caja}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-bold text-white">Panelista {valuador} · Sesión {sesion.Sesion.replace(/^S/, '')}</h2>
          <p className="text-purple-200">Perfil Flash · {muestras.length} copas</p>
          <div className="mt-1"><EstadoNube pendientes={pendientes} oscuro /></div>
        </div>
        <button onClick={salir} className="text-sm text-purple-200 hover:text-white underline">Pausa / salir (queda guardado)</button>
      </div>
      {cerrado && <p className="text-sm bg-red-50 text-red-700 p-3 rounded-lg mb-3">Este estudio fue cerrado por el administrador: las respuestas nuevas no se pueden guardar.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-purple-100 text-sm mr-1">Tus copas:</span>
        {muestras.map(m => <span key={m.Orden} className="bg-gradient-to-br from-yellow-300 to-orange-500 text-gray-900 font-black text-lg w-9 h-9 flex items-center justify-center rounded-lg shadow">{m.CodigoProducto}</span>)}
      </div>
    </div>
  );

  // 1) descriptores
  if (st.paso === 'desc') {
    return (
      <div className="min-h-screen py-6 px-4"><div className="max-w-4xl mx-auto">
        {cabecera}
        <div className={caja}>
          <h3 className="text-xl font-bold text-white mb-2">1. Tus descriptores</h3>
          <div className="text-purple-100 text-sm space-y-2 mb-4">
            <p>Mirá, oledé y probá <b>todas las copas</b>, comparándolas entre sí (podés volver a probar cuantas veces quieras).
              Anotá los descriptores que te sirven para <b>diferenciarlas</b>: color, aroma, sabor, sensaciones en boca…</p>
            <p>Usá tus propias palabras. <b>Nada de gustos</b> (“rico”, “feo”): solo características. Concentrate en las diferencias
              que percibís; no hace falta una lista larga. Podés agregar más descriptores después, mientras ordenás.</p>
          </div>
          <details className="mb-4 bg-white/5 rounded-xl p-3 border border-white/10">
            <summary className="text-sm text-pink-200 cursor-pointer font-semibold">Ver un ejemplo</summary>
            <p className="text-sm text-purple-100 mt-2">Con 4 galletitas (A, B, C, D), alguien podría usar “Crocante”, “Dulce” y “Color tostado”.
              Para “Crocante” las ordena de menos a más: <b>B · A = D · C</b> (A y D le parecen iguales, así que van apiladas).</p>
          </details>
          <div className="flex gap-2 mb-2">
            <input value={nuevo} onChange={e => setNuevo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && agregar(nuevo)) setNuevo(''); }}
              placeholder="Escribí un descriptor, ej: Frutos rojos" className="flex-1 min-w-0 rounded-lg px-4 py-3 text-lg text-gray-900" />
            <button onClick={() => { if (agregar(nuevo)) setNuevo(''); }} className="bg-pink-500 hover:bg-pink-600 text-white font-bold px-5 rounded-lg">Agregar</button>
          </div>
          {aviso && <p className="text-amber-300 text-sm mb-2">{aviso}</p>}
          {ideas.some(b => b.attrs.length) && (
            <details className="mb-4">
              <summary className="text-purple-200 text-xs cursor-pointer">Lista de ayuda (tocá una palabra para agregarla, solo si te sirve)</summary>
              <div className="mt-2 space-y-2">{ideas.map((b, i) => (
                <div key={i}>
                  {(b.g1 || b.g2) && <p className="text-[11px] uppercase tracking-wide text-purple-300 font-bold">{[b.g1, b.g2].filter(Boolean).join(' · ')}</p>}
                  <div className="flex flex-wrap gap-1">{b.attrs.filter(x => !nombres.some(y => y.toLowerCase() === x.n.toLowerCase())).map(x =>
                    <button key={x.k} onClick={() => agregar(x.n)} className="text-sm bg-white/10 hover:bg-white/25 text-white px-3 py-1 rounded-full border border-white/20">+ {x.n}</button>)}</div>
                </div>))}
              </div>
            </details>
          )}
          <div className="space-y-2 mt-4">
            {st.atributos.map((a, i) => (
              <div key={a.n} className="bg-slate-800/70 border border-slate-600/60 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <span className="text-purple-300 font-bold w-6 text-right">{i + 1}.</span>
                  <span className="text-white font-semibold text-lg flex-1">{a.n}</span>
                  <button onClick={() => quitar(a.n)} className="text-slate-300 hover:text-red-400 text-xl px-2" title="Quitar">✕</button>
                </div>
                <details className="mt-1 ml-9">
                  <summary className="text-xs text-purple-200 cursor-pointer">Opcional: cómo lo evaluás y extremos de la escala</summary>
                  <input value={a.def} onChange={e => cambiarAttr(a.n, { def: e.target.value })}
                    placeholder="Cómo lo evaluás (ej: en boca, después de 5 segundos)" className="mt-2 w-full rounded-lg px-3 py-2 text-sm bg-white/90 text-gray-800" />
                  <div className="flex items-center gap-2 mt-2 text-xs text-purple-200">
                    <span>De</span>
                    <input value={a.izq} onChange={e => cambiarAttr(a.n, { izq: e.target.value.slice(0, 30) })} placeholder="menos" className="w-28 rounded px-2 py-1 bg-white/90 text-gray-800" />
                    <span>a</span>
                    <input value={a.der} onChange={e => cambiarAttr(a.n, { der: e.target.value.slice(0, 30) })} placeholder="más" className="w-28 rounded px-2 py-1 bg-white/90 text-gray-800" />
                    <span className="hidden sm:inline">(ej: de amarillo a marrón)</span>
                  </div>
                </details>
              </div>
            ))}
            {!st.atributos.length && <p className="text-purple-200 text-sm italic">Todavía no agregaste descriptores.</p>}
          </div>
        </div>
        <button disabled={!st.atributos.length} onClick={() => { setAviso(''); upd({ paso: 'rank', i: 0 }); window.scrollTo(0, 0); }} className={btnP}>
          Ordenar las copas ({st.atributos.length} descriptor{st.atributos.length === 1 ? '' : 'es'}) →
        </button>
      </div></div>
    );
  }

  // 3) revisión y envío
  if (st.paso === 'revisar') {
    return (
      <div className="min-h-screen py-6 px-4"><div className="max-w-4xl mx-auto">
        {cabecera}
        <div className={caja}>
          <h3 className="text-xl font-bold text-white mb-4">3. Revisá y enviá</h3>
          <div className="space-y-3">
            {st.atributos.map((at, i) => (
              <button key={at.n} onClick={() => upd({ paso: 'rank', i })} className="w-full text-left bg-slate-800/70 hover:bg-slate-700/70 border border-slate-600/60 rounded-xl p-3">
                <p className="text-white font-semibold mb-1">{at.n} <span className="text-xs text-purple-300 font-normal">(tocá para cambiar)</span></p>
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-sky-300">{at.izq || 'menos'}</span>
                  {textoLinea(muestras, gruposDe(at.n)).map((g, j) => (
                    <span key={j} className={`px-2 py-0.5 rounded font-bold ${g.includes('=') ? 'bg-amber-300 text-amber-900' : 'bg-white text-gray-900'}`}>{g}</span>))}
                  <span className="text-pink-300">{at.der || 'más'}</span>
                </div>
              </button>))}
          </div>
        </div>
        <div className="space-y-3">
          <button onClick={enviar} className={btnP}>Enviar sesión ✓</button>
          <button onClick={() => upd({ paso: 'desc' })} className={btnS}>← Cambiar mis descriptores</button>
        </div>
      </div></div>
    );
  }

  // 2) ordenar, un descriptor a la vez
  const i = Math.min(st.i, nombres.length - 1);
  const at = st.atributos[i];
  const grupos = gruposDe(at.n);
  const todosIguales = completo(at.n) && grupos.length === 1;
  const siguiente = () => {
    if (!completo(at.n)) { setAviso('Falta ubicar alguna copa en la línea.'); return; }
    setAviso('');
    if (i + 1 < nombres.length) upd({ i: i + 1 }); else upd({ paso: 'revisar' });
    window.scrollTo(0, 0);
  };
  return (
    <div className="min-h-screen py-6 px-4"><div className="max-w-4xl mx-auto">
      {cabecera}
      <div className={caja}>
        <p className="text-purple-200 text-sm">2. Ordenar · descriptor {i + 1} de {nombres.length}</p>
        <h3 className="text-3xl font-bold text-white mb-1">{at.n}</h3>
        {at.def && <p className="text-purple-100 text-sm mb-1 italic">{at.def}</p>}
        <p className="text-purple-100 text-sm mb-4">
          Ordená las copas en tu mesa y después pasalo acá: arrastrá cada letra a la línea, de <b>{at.izq || 'menos'}</b> (izquierda)
          a <b>{at.der || 'más'}</b> (derecha). Si dos te parecen iguales, <b>apilalas una encima de la otra</b>.
          {' '}<span className="text-purple-300">También podés tocar una letra y después tocar dónde va.</span>
        </p>
        <TableroOrden muestras={muestras} grupos={grupos} izq={at.izq} der={at.der}
          setGrupos={g => { setAviso(''); upd(prev => ({ orden: { ...prev.orden, [at.n]: g } })); }} />
        {todosIguales && <p className="text-xs text-amber-300 mt-3">Pusiste todas las copas iguales: este descriptor no las diferencia. Si es así, podés quitarlo de tu lista.</p>}
        <p className="text-xs text-purple-300 mt-3">Si te cansás, hacé una pausa entre descriptores: tu avance queda guardado en este dispositivo.</p>
      </div>
      {aviso && <p className="mb-3 bg-red-500/90 text-white font-semibold p-3 rounded-xl text-center">{aviso}</p>}
      <div className="space-y-3">
        <button onClick={siguiente} className={btnP}>{i + 1 < nombres.length ? 'Siguiente descriptor →' : 'Revisar y enviar →'}</button>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { setAviso(''); i > 0 ? upd({ i: i - 1 }) : upd({ paso: 'desc' }); window.scrollTo(0, 0); }} className={btnS}>← Anterior</button>
          <button onClick={() => upd({ paso: 'desc' })} className={btnS}>Ver / editar descriptores</button>
        </div>
        <div className="flex gap-2">
          <input value={nuevo2} onChange={e => setNuevo2(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && agregar(nuevo2)) setNuevo2(''); }}
            placeholder="¿Encontraste otra diferencia? Agregá un descriptor" className="flex-1 min-w-0 rounded-lg px-3 py-2 text-gray-900" />
          <button onClick={() => { if (agregar(nuevo2)) setNuevo2(''); }} className="bg-white/15 hover:bg-white/25 text-white font-semibold px-4 rounded-lg border border-white/30">+ Agregar</button>
        </div>
      </div>
    </div></div>
  );
}

// ---- Napping / mapeo proyectivo (Dehlholm, cap. 9): ubicar las muestras en una hoja; cerca = parecidas.
// Posiciones normalizadas 0..1 (x hacia la derecha, y hacia arriba); al guardar se pasan a cm desde la esquina inferior izquierda.
function HojaNapping({ muestras, pos, setPos, hoja, soloVer = false, chica = false, etiquetas }) {
  const H = HOJAS[hoja] || HOJAS.rect;
  const hojaRef = React.useRef(null), bandeja = React.useRef(null);
  const [drag, setDrag] = useState(null);
  const [sel, setSel] = useState(null);
  const ini = React.useRef(null);
  const sueltas = muestras.filter(m => !pos[m.Orden]);
  // tamaño de las fichas según el ancho de la hoja (en el celular la hoja es chica)
  const [anchoHoja, setAnchoHoja] = useState(800);
  useEffect(() => {
    const medir = () => { if (hojaRef.current) setAnchoHoja(hojaRef.current.getBoundingClientRect().width); };
    medir(); window.addEventListener('resize', medir); return () => window.removeEventListener('resize', medir);
  }, []);
  const tam = chica ? 26 : Math.round(Math.max(30, Math.min(46, anchoHoja / 11)));

  // punto de pantalla -> posición normalizada dentro de la hoja (o null si cae afuera)
  const aHoja = (x, y) => {
    const r = hojaRef.current && hojaRef.current.getBoundingClientRect(); if (!r) return null;
    let u = (x - r.left) / r.width, v = 1 - (y - r.top) / r.height;
    const mx = (tam / 2) / r.width, my = (tam / 2) / r.height;
    if (u < -0.05 || u > 1.05 || v < -0.05 || v > 1.05) return null;
    if (H.redonda) {   // dentro del círculo (con margen)
      const cx = u - 0.5, cy = v - 0.5, rmax = 0.5 - Math.max(mx, my), d = Math.hypot(cx, cy);
      if (d > rmax) { u = 0.5 + cx / d * rmax; v = 0.5 + cy / d * rmax; }
    } else { u = Math.min(1 - mx, Math.max(mx, u)); v = Math.min(1 - my, Math.max(my, v)); }
    return { x: u, y: v };
  };
  const enBandeja = (x, y) => { const r = bandeja.current && bandeja.current.getBoundingClientRect(); return r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  const soltar = (orden, x, y) => {
    if (enBandeja(x, y)) { const p = { ...pos }; delete p[orden]; setPos(p); return; }
    const q = aHoja(x, y); if (q) setPos({ ...pos, [orden]: q });
  };
  const abajo = (e, orden) => { if (soloVer) return; e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} ini.current = { orden, x: e.clientX, y: e.clientY, mov: false }; };
  const mueve = e => { const s = ini.current; if (!s) return; if (!s.mov && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 5) return; s.mov = true; setSel(null); setDrag({ orden: s.orden, x: e.clientX, y: e.clientY }); };
  const arriba = e => {
    const s = ini.current; ini.current = null; if (!s) return;
    if (s.mov) { soltar(s.orden, e.clientX, e.clientY); setDrag(null); return; }
    // modo tocar: con otra muestra elegida, tocar una que ya está en la hoja = poner la elegida ahí, al lado
    if (sel != null && sel !== s.orden && pos[s.orden]) { const q = aHoja(e.clientX + tam * 0.6, e.clientY); if (q) setPos({ ...pos, [sel]: q }); setSel(null); return; }
    setSel(x => (x === s.orden ? null : s.orden));
  };
  const tocarHoja = e => { if (sel == null || soloVer) return; const q = aHoja(e.clientX, e.clientY); if (q) { setPos({ ...pos, [sel]: q }); setSel(null); } };

  const ficha = (m, estilo) => (
    <div key={m.Orden} data-muestra={m.CodigoProducto} onClick={e => e.stopPropagation()}
      onPointerDown={e => abajo(e, m.Orden)} onPointerMove={mueve} onPointerUp={arriba} onPointerCancel={() => { ini.current = null; setDrag(null); }}
      style={{ width: tam, height: tam, touchAction: 'none', ...estilo }}
      className={`select-none ${soloVer ? '' : 'cursor-grab'} rounded-full flex items-center justify-center font-black shadow-lg border-2
        bg-gradient-to-br from-yellow-300 to-orange-500 text-gray-900 ${chica || tam < 40 ? 'text-[10px]' : 'text-sm'}
        ${drag && drag.orden === m.Orden ? 'opacity-30' : ''} ${sel === m.Orden ? 'ring-4 ring-pink-400 border-white' : 'border-orange-600/40'}`}>
      {m.CodigoProducto}
    </div>
  );
  return (
    <div>
      {!soloVer && (
        <div ref={bandeja} onClick={() => { if (sel != null) { const p = { ...pos }; delete p[sel]; setPos(p); setSel(null); } }} data-zona="bandeja"
          className="rounded-2xl border-2 border-dashed border-white/30 p-3 mb-3 min-h-[4.2rem]">
          <p className="text-xs text-purple-200 mb-2">{sueltas.length ? 'Muestras sin ubicar (en el orden en que las probás) — arrastralas a la hoja' : 'Todas las muestras están en la hoja ✓ (podés seguir moviéndolas)'}</p>
          <div className="flex flex-wrap gap-2">{sueltas.map(m => ficha(m))}</div>
        </div>
      )}
      <div className="mx-auto" style={{ maxWidth: H.redonda ? 520 : H.alto === H.ancho ? 560 : 900 }}>
        <div ref={hojaRef} onClick={tocarHoja} data-zona="hoja"
          className={`relative w-full bg-white shadow-inner border-2 ${H.redonda ? 'rounded-full' : 'rounded-md'} ${sel != null ? 'border-pink-400 cursor-crosshair' : 'border-gray-300'}`}
          style={{ aspectRatio: `${H.ancho} / ${H.alto}` }}>
          {muestras.filter(m => pos[m.Orden]).map(m => ficha(m, {
            position: 'absolute', left: `${pos[m.Orden].x * 100}%`, top: `${(1 - pos[m.Orden].y) * 100}%`, transform: 'translate(-50%, -50%)' }))}
          {etiquetas && muestras.filter(m => pos[m.Orden] && etiquetas[m.Orden]).map(m => (
            <div key={'e' + m.Orden} className="absolute text-[10px] leading-tight text-gray-600 pointer-events-none max-w-[7rem]"
              style={{ left: `${pos[m.Orden].x * 100}%`, top: `${(1 - pos[m.Orden].y) * 100}%`, transform: `translate(-50%, ${tam / 2 + 2}px)` }}>{etiquetas[m.Orden]}</div>))}
        </div>
      </div>
      {sel != null && <p className="text-xs text-pink-200 mt-2">Muestra elegida: tocá el lugar de la hoja donde va, o la bandeja para sacarla.</p>}
      {drag && (
        <div className="fixed z-50 pointer-events-none rounded-full flex items-center justify-center font-black text-sm shadow-2xl bg-gradient-to-br from-yellow-300 to-orange-500 text-gray-900 border-2 border-white"
          style={{ width: 52, height: 52, left: drag.x - 26, top: drag.y - 26 }}>{(muestras.find(m => m.Orden === drag.orden) || {}).CodigoProducto}</div>
      )}
    </div>
  );
}

function SesionNapping({ eid, estudio, valuador, sesion, muestras, pendientes, cerrado, setCerrado, alTerminar, salir }) {
  const cfg = estudio.napping || { hoja: 'rect', tareas: ['Global'], palabras: 'opcional' };
  const H = HOJAS[cfg.hoja] || HOJAS.rect;
  const tareas = cfg.tareas && cfg.tareas.length ? cfg.tareas : ['Global'];
  const conPalabras = cfg.palabras !== 'no';
  const clave = `pf_nap_${eid}_${valuador}_${sesion.Sesion}`;
  const [st, setSt] = useState(() => LS.get(clave, null) || { t: 0, paso: 'mapa', pos: {}, pal: {} });
  const [aviso, setAviso] = useState('');
  const [nueva, setNueva] = useState({});
  useEffect(() => { LS.set(clave, st); }, [st]);
  const upd = c => setSt(prev => ({ ...prev, ...(typeof c === 'function' ? c(prev) : c) }));
  const tarea = tareas[Math.min(st.t, tareas.length - 1)];
  const pos = st.pos[tarea] || {};
  const pal = st.pal[tarea] || {};
  const ideas = useMemo(() => {
    const p = parsearDescriptores((estudio.sugerencias || []).join('\n'));
    return p.claves.length ? [...new Set(p.estructura ? p.estructura.filter(i => i.t === 'a').map(i => i.n) : p.claves)].sort((a, b) => a.localeCompare(b, 'es')) : [];
  }, [estudio]);
  const propias = [...new Set(Object.values(st.pal).flatMap(t => Object.values(t).flat()))].sort((a, b) => a.localeCompare(b, 'es'));

  const setPos = p => { setAviso(''); upd(prev => ({ pos: { ...prev.pos, [tarea]: p } })); };
  const agregarPalabra = (orden, txt) => {
    const ws = String(txt || '').split(/[,;\n]/).map(w => w.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 40)).filter(Boolean);
    if (!ws.length) return;
    setAviso('');
    upd(prev => { const t = { ...(prev.pal[tarea] || {}) }; t[orden] = [...new Set([...(t[orden] || []), ...ws])].slice(0, 12); return { pal: { ...prev.pal, [tarea]: t } }; });
    setNueva(n => ({ ...n, [orden]: '' }));
  };
  const quitarPalabra = (orden, w) => upd(prev => { const t = { ...(prev.pal[tarea] || {}) }; t[orden] = (t[orden] || []).filter(x => x !== w); return { pal: { ...prev.pal, [tarea]: t } }; });

  const r1 = x => Math.round(x * 10) / 10;
  const enviar = () => {
    const def = {};
    const payload = muestras.map(m => {
      const valores = {};
      tareas.forEach(t => { const p = (st.pos[t] || {})[m.Orden]; valores[claveX(t)] = r1(p.x * H.ancho); valores[claveY(t)] = r1(p.y * H.alto); });
      return { Orden: m.Orden, CodigoProducto: m.CodigoProducto, valores };
    });
    // palabras: por muestra, guardadas en def (una entrada por tarea: "pal1; pal2")
    const porMuestra = {};
    muestras.forEach(m => { const d = {}; tareas.forEach(t => { const w = ((st.pal[t] || {})[m.Orden] || []); if (w.length) d[t] = w.join('; '); }); porMuestra[m.Orden] = d; });
    datos.guardarFlash(eid, { Sesion: sesion.Sesion, Valuador: valuador, atributos: [],
      muestras: payload.map(p => ({ ...p, def: porMuestra[p.Orden] })), def: null })
      .catch(e => { if (e && e.code === 'permission-denied') setCerrado(true); });
    try { localStorage.removeItem(clave); } catch {}
    alTerminar(muestras.map(m => m.Orden));
  };

  const caja = 'bg-white/10 backdrop-blur-lg rounded-2xl p-5 mb-5 border border-white/20';
  const btnP = 'w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-4 rounded-xl shadow-2xl text-lg disabled:opacity-40';
  const btnS = 'w-full bg-white/10 hover:bg-white/20 border-2 border-white/30 text-white font-semibold py-3 rounded-xl';
  const cabecera = (
    <div className={caja}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-bold text-white">Panelista {valuador} · Sesión {sesion.Sesion.replace(/^S/, '')}</h2>
          <p className="text-purple-200">Napping · {muestras.length} muestras{tareas.length > 1 ? ` · hoja ${st.t + 1} de ${tareas.length}` : ''}</p>
          <div className="mt-1"><EstadoNube pendientes={pendientes} oscuro /></div>
        </div>
        <button onClick={salir} className="text-sm text-purple-200 hover:text-white underline">Pausa / salir (queda guardado)</button>
      </div>
      {cerrado && <p className="text-sm bg-red-50 text-red-700 p-3 rounded-lg mb-3">Este estudio fue cerrado por el administrador: las respuestas nuevas no se pueden guardar.</p>}
      <p className="text-purple-100 text-sm mb-1">Probá las muestras <b>en este orden</b>:</p>
      <div className="flex flex-wrap items-center gap-1">
        {muestras.map((m, i) => <React.Fragment key={m.Orden}>{i > 0 && <span className="text-purple-300">→</span>}
          <span className="bg-gradient-to-br from-yellow-300 to-orange-500 text-gray-900 font-black text-sm px-2 py-1 rounded-lg">{m.CodigoProducto}</span></React.Fragment>)}
      </div>
    </div>
  );

  if (st.paso === 'revisar') {
    return (
      <div className="min-h-screen py-6 px-4"><div className="max-w-4xl mx-auto">
        {cabecera}
        <div className={caja}>
          <h3 className="text-xl font-bold text-white mb-3">Revisá y enviá</h3>
          {tareas.map((t, i) => (
            <div key={t} className="mb-4">
              {tareas.length > 1 && <p className="text-white font-semibold mb-1">{t} <button onClick={() => upd({ t: i, paso: 'mapa' })} className="text-xs text-purple-300 underline ml-2">cambiar</button></p>}
              <HojaNapping muestras={muestras} pos={st.pos[t] || {}} setPos={() => {}} hoja={cfg.hoja} soloVer
                etiquetas={Object.fromEntries(muestras.map(m => [m.Orden, ((st.pal[t] || {})[m.Orden] || []).join(', ')]))} />
            </div>))}
        </div>
        <div className="space-y-3">
          <button onClick={enviar} className={btnP}>Enviar sesión ✓</button>
          <button onClick={() => upd({ paso: conPalabras ? 'palabras' : 'mapa', t: tareas.length - 1 })} className={btnS}>← Volver</button>
        </div>
      </div></div>
    );
  }

  const completo = muestras.every(m => pos[m.Orden]);
  const siguienteTarea = () => { if (st.t + 1 < tareas.length) upd({ t: st.t + 1, paso: 'mapa' }); else upd({ paso: 'revisar' }); window.scrollTo(0, 0); };

  if (st.paso === 'palabras') {
    const faltan = cfg.palabras === 'obligatorio' ? muestras.filter(m => !(pal[m.Orden] || []).length) : [];
    return (
      <div className="min-h-screen py-6 px-4"><div className="max-w-4xl mx-auto">
        {cabecera}
        <div className={caja}>
          <h3 className="text-xl font-bold text-white mb-1">{tareas.length > 1 ? `${tarea}: ` : ''}palabras para cada muestra</h3>
          <p className="text-purple-100 text-sm mb-3">
            Escribí algunas palabras que describan cada muestra (lo que te llevó a ubicarla ahí). {cfg.palabras === 'obligatorio' ? 'Al menos una por muestra.' : 'Son opcionales.'}
            {' '}Separalas con coma o apretá Enter.
          </p>
          <HojaNapping muestras={muestras} pos={pos} setPos={() => {}} hoja={cfg.hoja} soloVer chica
            etiquetas={Object.fromEntries(muestras.map(m => [m.Orden, (pal[m.Orden] || []).join(', ')]))} />
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            {muestras.map(m => (
              <div key={m.Orden} data-palabras={m.CodigoProducto} className={`rounded-xl p-3 bg-slate-800/70 border ${aviso && faltan.includes(m) ? 'border-red-400' : 'border-slate-600/60'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-gradient-to-br from-yellow-300 to-orange-500 text-gray-900 font-black text-sm px-2 py-1 rounded-lg">{m.CodigoProducto}</span>
                  <div className="flex flex-wrap gap-1">{(pal[m.Orden] || []).map(w => (
                    <button key={w} onClick={() => quitarPalabra(m.Orden, w)} className="text-xs bg-pink-500 text-white rounded-full px-2 py-0.5" title="Quitar">{w} ✕</button>))}</div>
                </div>
                <input value={nueva[m.Orden] || ''} onChange={e => setNueva(n => ({ ...n, [m.Orden]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') agregarPalabra(m.Orden, nueva[m.Orden]); }} onBlur={() => agregarPalabra(m.Orden, nueva[m.Orden])}
                  placeholder="ej: frutado, suave" className="w-full rounded-lg px-3 py-2 text-sm text-gray-900" list={`pal-${m.Orden}`} />
                <datalist id={`pal-${m.Orden}`}>{[...new Set([...propias, ...ideas])].map(w => <option key={w} value={w} />)}</datalist>
              </div>))}
          </div>
          {ideas.length > 0 && (
            <details className="mt-3"><summary className="text-xs text-purple-200 cursor-pointer">Lista de ayuda</summary>
              <p className="text-xs text-purple-100 mt-1">{ideas.join(' · ')}</p></details>)}
        </div>
        {aviso && <p className="mb-3 bg-red-500/90 text-white font-semibold p-3 rounded-xl text-center">{aviso}</p>}
        <div className="space-y-3">
          <button onClick={() => { if (faltan.length) { setAviso('Falta al menos una palabra para: ' + faltan.map(m => m.CodigoProducto).join(', ')); return; } setAviso(''); siguienteTarea(); }} className={btnP}>
            {st.t + 1 < tareas.length ? `Seguir con: ${tareas[st.t + 1]} →` : 'Revisar y enviar →'}</button>
          <button onClick={() => upd({ paso: 'mapa' })} className={btnS}>← Volver a la hoja</button>
        </div>
      </div></div>
    );
  }

  // hoja
  return (
    <div className="min-h-screen py-6 px-4"><div className="max-w-5xl mx-auto">
      {cabecera}
      <div className={caja}>
        <h3 className="text-2xl font-bold text-white mb-1">{tarea === 'Global' ? 'Ubicá las muestras en la hoja' : `Napping parcial: ${tarea}`}</h3>
        <p className="text-purple-100 text-sm mb-3">
          Probá las muestras de a una, en el orden indicado, y ubicalas en la hoja: dos muestras que te parecen <b>parecidas, cerca</b>;
          {' '}<b>distintas, lejos</b>. {tarea === 'Global' ? 'El criterio lo decidís vos: no hay respuestas incorrectas.' : <>Fijate <b>solo en: {tarea.toLowerCase()}</b>.</>}
          {' '}Podés mover las muestras y volver a probarlas todas las veces que quieras hasta terminar. Usá toda la hoja.
          {' '}<span className="text-purple-300">También podés tocar una muestra y después tocar el lugar.</span>
        </p>
        <HojaNapping muestras={muestras} pos={pos} setPos={setPos} hoja={cfg.hoja} />
      </div>
      {aviso && <p className="mb-3 bg-red-500/90 text-white font-semibold p-3 rounded-xl text-center">{aviso}</p>}
      <div className="space-y-3">
        <button onClick={() => { if (!completo) { setAviso('Falta ubicar alguna muestra en la hoja.'); return; } setAviso(''); if (conPalabras) { upd({ paso: 'palabras' }); window.scrollTo(0, 0); } else siguienteTarea(); }} className={btnP}>
          {conPalabras ? 'Listo, agregar palabras →' : st.t + 1 < tareas.length ? `Seguir con: ${tareas[st.t + 1]} →` : 'Revisar y enviar →'}</button>
        {st.t > 0 && <button onClick={() => upd({ t: st.t - 1, paso: conPalabras ? 'palabras' : 'mapa' })} className={btnS}>← Hoja anterior</button>}
      </div>
    </div></div>
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
                {e.sesiones.length} sesiones · {e.panelistas.length} panelistas · {e.tecnica === 'flash' ? 'descriptores propios' : e.tecnica === 'napping' ? 'mapeo' : `${e.atributos.length} ${e.tecnica === 'rata' ? 'descriptores' : 'atributos'}`}</p>
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
  const [sugTxt, setSugTxt] = useState(F.sugTxt ?? '');
  const [dupTxt, setDupTxt] = useState('');
  const [hoja, setHoja] = useState(F.hoja ?? 'rect');
  const [parcial, setParcial] = useState(F.parcial ?? false);
  const [focosTxt, setFocosTxt] = useState(F.focosTxt ?? 'Aspecto\nAroma\nBoca');
  const [palabras, setPalabras] = useState(F.palabras ?? 'opcional');
  useEffect(() => { LS.set('pf_form', { nombre, vinosTxt, porSesion, reps, nPan, parejo, semilla, atrTxt, tecnica, escala, ordenAzar, sugTxt, hoja, parcial, focosTxt, palabras }); },
    [nombre, vinosTxt, porSesion, reps, nPan, parejo, semilla, atrTxt, tecnica, escala, ordenAzar, sugTxt, hoja, parcial, focosTxt, palabras]);
  const [prev, setPrev] = useState(null);
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const lineas = t => t.split(/\r?\n|\t|;/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const vinos = lineas(vinosTxt);
  const desc = useMemo(() => parsearDescriptores(atrTxt), [atrTxt]);
  const atributos = desc.claves;
  const esRata = tecnica === 'rata', esFlash = tecnica === 'flash', esNap = tecnica === 'napping';
  const juntas = esFlash || esNap;   // todas las muestras en la misma sesión, sin lista fija de atributos
  const focos = [...new Set(lineas(focosTxt).map(f => f.replace(/[_|]/g, ' ').slice(0, 30)))].slice(0, 6);
  const tareas = esNap ? (parcial ? focos : ['Global']) : [];
  // ideas para Perfil Flash: una por línea; se aceptan títulos "# Modalidad" (como la lista común del cap. 7)
  const sugerencias = sugTxt.split(/\r?\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 300);
  const nIdeas = sugerencias.filter(x => !x.startsWith('#')).length;
  const duplicados = [...new Set(lineas(dupTxt))];
  const dupMalos = duplicados.filter(d => !vinos.includes(d));
  const porSesionEf = esFlash ? Math.max(1, vinos.length) : esNap ? Math.max(1, vinos.length + duplicados.length) : Number(porSesion);
  const dup = vinos.filter((v, i) => vinos.indexOf(v) !== i);

  const generar = () => {
    setMsg(null);
    if (!nombre.trim()) return setMsg({ t: 'error', m: 'Poné un nombre al estudio.' });
    if (vinos.length < 1) return setMsg({ t: 'error', m: 'Pegá al menos un vino.' });
    if (dup.length) return setMsg({ t: 'error', m: 'Hay vinos repetidos: ' + [...new Set(dup)].join(', ') });
    if (vinos.some(v => v.includes('|'))) return setMsg({ t: 'error', m: 'Los nombres de vinos no pueden tener el carácter |' });
    if (!juntas && !atributos.length) return setMsg({ t: 'error', m: 'Agregá al menos un descriptor.' });
    if (esNap && vinos.length + duplicados.length < 4) return setMsg({ t: 'error', m: 'El Napping necesita al menos 4 muestras para ocupar las dos dimensiones de la hoja.' });
    if (esNap && dupMalos.length) return setMsg({ t: 'error', m: 'Estos duplicados no están en la lista de vinos: ' + dupMalos.join(', ') });
    if (esNap && parcial && !focos.length) return setMsg({ t: 'error', m: 'Escribí al menos un foco para el Napping parcial (ej. Aroma).' });
    if (esFlash && vinos.length < 3) return setMsg({ t: 'error', m: 'El Perfil Flash necesita al menos 3 muestras para ordenar.' });
    if (esFlash && vinos.length + duplicados.length > 26) return setMsg({ t: 'error', m: 'En Perfil Flash las copas se codifican con letras: máximo 26 (A–Z), duplicados incluidos.' });
    if (esFlash && dupMalos.length) return setMsg({ t: 'error', m: 'Estos duplicados no están en la lista de vinos: ' + dupMalos.join(', ') });
    if (!juntas && desc.dup.length) return setMsg({ t: 'error', m: 'Hay descriptores repetidos en el mismo grupo: ' + desc.dup.join(', ') });
    if (!juntas && desc.malos.length) return setMsg({ t: 'error', m: 'Descriptores con el carácter | o demasiado largos: ' + desc.malos.join(', ') });
    if (atributos.length > 300) return setMsg({ t: 'error', m: 'Máximo 300 descriptores por estudio.' });
    if (!juntas && Number(porSesion) > vinos.length) return setMsg({ t: 'error', m: `No puede haber más vinos por sesión (${porSesion}) que vinos distintos (${vinos.length}): un vino no se repite dentro de una sesión.` });
    if (vinos.length * reps > 900) return setMsg({ t: 'error', m: 'Demasiadas muestras para códigos de 3 dígitos (máx. 900 vinos × repeticiones).' });
    setPrev(esFlash
      ? generarDisenoFlash({ vinos, reps: Number(reps), duplicados, nPanelistas: Number(nPan), semilla: Number(semilla) })
      : esNap
      // Napping: todas las muestras en la sesión, orden de cata balanceado (Williams), códigos de 3 cifras; duplicados como muestras aparte
      ? generarDiseno({ vinos: [...vinos, ...duplicados.map(d => `${d} (dup)`)], porSesion: porSesionEf, reps: Number(reps), nPanelistas: Number(nPan), parejo: false, semilla: Number(semilla) })
      : generarDiseno({ vinos, porSesion: porSesionEf, reps: Number(reps), nPanelistas: Number(nPan), parejo, semilla: Number(semilla) }));
  };

  const guardar = async () => {
    setOcupado(true); setMsg(null);
    try {
      const id = await datos.crearEstudio({
        nombre: nombre.trim(), tecnica,
        atributos: juntas ? [] : atributos, estructura: juntas ? null : desc.estructura,
        escala: esRata ? Number(escala) : 3, ordenAzar: juntas ? false : ordenAzar,
        sugerencias: esFlash || (esNap && palabras !== 'no') ? sugerencias : [],
        napping: esNap ? { hoja, tareas, palabras } : null,
        sesiones: prev.sesiones.map(s => ({ Sesion: s.Sesion, NMuestras: s.NMuestras, Vinos: s.Vinos })),
        panelistas: Array.from({ length: Number(nPan) }, (_, i) => 'V' + (i + 1)),
        diseno: prev.diseno,
        parametros: { vinos, duplicados: juntas ? duplicados : [], reps: Number(reps), porSesion: porSesionEf, nPanelistas: Number(nPan), parejo, semilla: Number(semilla) },
      });
      LS.set('pf_form', { atrTxt, porSesion, reps, nPan, parejo, tecnica, escala, ordenAzar, sugTxt, hoja, parcial, focosTxt, palabras });
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
            <div className="grid gap-2 mt-1">
              {[['descriptiva', 'Análisis Descriptivo Cuantitativo', 'Escala continua 0–10 para cada atributo.'],
                ['rata', 'RATA', 'Marcar los descriptores presentes y su intensidad (bajo, medio, alto).'],
                ['flash', 'Perfil Flash', 'Cada panelista crea sus descriptores y ordena todas las muestras juntas, de menos a más.'],
                ['napping', 'Napping (mapeo proyectivo)', 'Cada panelista ubica las muestras en una hoja: parecidas cerca, distintas lejos. Con palabras opcionales.']].map(([k, t, d]) => (
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
            <Campo label={juntas ? 'Repeticiones (= sesiones)' : 'Repeticiones'}><input type="number" min="1" className={inp} value={reps} onChange={e => setReps(e.target.value)} /></Campo>
            {juntas
              ? <Campo label="Muestras por sesión"><input disabled className={inp + ' bg-gray-100'} value={(vinos.length + duplicados.length) || '—'} /></Campo>
              : <Campo label="Vinos por sesión"><input type="number" min="1" className={inp} value={porSesion} onChange={e => setPorSesion(e.target.value)} /></Campo>}
            <Campo label="Panelistas"><input type="number" min="1" className={inp} value={nPan} onChange={e => setNPan(e.target.value)} /></Campo>
          </div>
          {esFlash && (
            <div className="text-sm bg-amber-50 text-amber-900 rounded-lg p-3 space-y-1">
              <p>Cada panelista recibe <b>todas las copas juntas</b>, marcadas con <b>letras</b> (A, B, C…): son más fáciles de reportar
                que los números de 3 cifras. Las letras se sortean entre los vinos y son <b>las mismas para todos</b>. No se usa Williams.</p>
              <p>Cada repetición es una sesión con otro sorteo de letras (lo habitual es 1). Se recomiendan al menos 4–5 panelistas.</p>
              {Number(nPan) < 4 && <p className="font-semibold text-red-700">Con menos de 4 panelistas el mapa de consenso es poco estable.</p>}
            </div>
          )}
          {esNap && (
            <div className="space-y-3">
              <div className="text-sm bg-emerald-50 text-emerald-900 rounded-lg p-3 space-y-1">
                <p>Cada panelista prueba las muestras <b>de a una</b>, en un orden balanceado (Williams), y las ubica en una hoja:
                  las que le parecen parecidas, <b>cerca</b>; las distintas, <b>lejos</b>. El criterio lo decide él. Se registran las coordenadas (cm).</p>
                <p>Lo habitual es una sola sesión (evaluación espontánea). Mínimo 4 muestras; en la bibliografía, de 8 a 80 panelistas.</p>
              </div>
              <Campo label="Hoja" ayuda="La forma influye en cómo se ubican las muestras: en la rectangular se tiende a dar más importancia a la dirección horizontal. Sin ejes ni escalas, para una evaluación más holística.">
                <select className={inp} value={hoja} onChange={e => setHoja(e.target.value)}>
                  {Object.entries(HOJAS).map(([k, h]) => <option key={k} value={k}>{h.nombre}</option>)}
                </select>
              </Campo>
              <div>
                <span className="text-sm font-semibold text-gray-700">Tipo de Napping</span>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[[false, 'Global', 'El panelista decide su propio criterio.'], [true, 'Parcial', 'Una hoja por foco (ej. aspecto, aroma, boca), una después de la otra.']].map(([v, t, d]) => (
                    <button key={t} type="button" onClick={() => setParcial(v)}
                      className={`text-left rounded-xl border-2 p-2 ${parcial === v ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200'}`}>
                      <p className="font-bold text-sm">{t}</p><p className="text-xs text-gray-500">{d}</p>
                    </button>))}
                </div>
              </div>
              {parcial && (
                <Campo label={`Focos (${focos.length})`} ayuda="Uno por línea (máximo 6). Cada foco es una hoja aparte en la misma sesión.">
                  <textarea className={inp + ' h-20 text-sm'} value={focosTxt} onChange={e => setFocosTxt(e.target.value)} />
                </Campo>
              )}
              <Campo label="Palabras para cada muestra (Ultra Flash Profile)" ayuda="Después de ubicar las muestras, el panelista escribe algunas palabras que describan cada una.">
                <select className={inp} value={palabras} onChange={e => setPalabras(e.target.value)}>
                  <option value="opcional">Opcionales</option>
                  <option value="obligatorio">Obligatorias (al menos una por muestra)</option>
                  <option value="no">Sin palabras (solo ubicar)</option>
                </select>
              </Campo>
            </div>
          )}
          {juntas && (
            <Campo label={`Duplicados (opcional) · ${duplicados.length}`}
              ayuda="Vinos que se sirven dos veces en la misma sesión, con otra letra, para mirar la repetibilidad en el mapa. Pocos, y el panelista no debe saberlo. Uno por línea, con el mismo nombre que en la lista de vinos.">
              <textarea className={inp + ' h-16 text-sm'} value={dupTxt} onChange={e => setDupTxt(e.target.value)} />
              {dupMalos.length > 0 && <span className="block text-xs text-red-600 mt-1">No están en la lista de vinos: {dupMalos.join(', ')}</span>}
            </Campo>
          )}
          {!juntas && vinos.length > 0 && Number(reps) > 0 && Number(porSesion) > 0 && (
            <p className="text-sm bg-purple-50 text-purple-900 rounded-lg p-3">
              {vinos.length} vinos × {reps} repeticiones = <b>{vinos.length * reps} muestras</b> →{' '}
              <b>{tamaniosSesiones(vinos.length * reps, Number(porSesion), parejo).length} sesiones</b>{' '}
              ({tamaniosSesiones(vinos.length * reps, Number(porSesion), parejo).join(' + ')})
            </p>
          )}
          {!juntas && <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={parejo} onChange={e => setParejo(e.target.checked)} className="w-4 h-4" />
            Repartir parejo entre sesiones (ej. 24 muestras de a 7 → 6+6+6+6 en vez de 7+7+7+3)
          </label>}
          <Campo label="Semilla" ayuda={esFlash ? 'Con la misma semilla y los mismos datos se obtiene el mismo sorteo de letras.' : 'Con la misma semilla y los mismos datos se obtiene exactamente el mismo diseño.'}>
            <input type="number" className={inp} value={semilla} onChange={e => setSemilla(e.target.value)} />
          </Campo>
          {esNap
            ? (palabras !== 'no' && <Campo label={`Lista de ayuda para las palabras (opcional) · ${nIdeas} términos`}
                ayuda={<>El panelista la puede desplegar y tocar los términos que le sirvan. Uno por línea; se pueden agrupar con <code># Aroma</code>…
                  Con consumidores, una lista puede sesgar las respuestas.</>}>
                <textarea className={inp + ' h-24 text-sm font-mono'} value={sugTxt} onChange={e => setSugTxt(e.target.value)} placeholder={'# Aroma\nFrutado\nAmaderado\n# Boca\nÁcido\nSuave'} />
              </Campo>)
            : esFlash
            ? <Campo label={`Lista de ayuda (opcional) · ${nIdeas} términos`}
                ayuda={<>Los descriptores los crea cada panelista. Si querés, cargá una lista de ayuda (de la bibliografía, una rueda de aromas o una sesión previa):
                  el panelista la puede desplegar y tocar los términos que le sirvan. Uno por línea; podés agruparlos por modalidad con <code># Aroma</code>, <code># Boca</code>…
                  (se muestran en orden alfabético). Con consumidores, tené en cuenta que una lista puede sesgar las respuestas.</>}>
                <textarea className={inp + ' h-32 text-sm font-mono'} value={sugTxt} onChange={e => setSugTxt(e.target.value)} placeholder={'# Aroma\nFrutos rojos\nVainilla\n# Boca\nAstringencia'} />
              </Campo>
            : <>
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
            </>}
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
                  <b>{nombreTecnica(tecnica)}</b> · {esNap ? `${HOJAS[hoja].nombre} · ${parcial ? 'parcial: ' + focos.join(', ') : 'global'} · ${palabras === 'no' ? 'sin palabras' : palabras === 'obligatorio' ? 'palabras obligatorias' : 'palabras opcionales'}` : esFlash ? 'descriptores propios de cada panelista' : `${atributos.length} ${esRata ? 'descriptores' : 'atributos'}`}{!juntas && desc.hayGrupos ? ` en ${desc.estructura.filter(i => i.t === 'g1').length || desc.estructura.filter(i => i.t === 'g2').length} grupos` : ''} ·{' '}
                  {prev.totalMuestras} muestras ({vinos.length}{juntas && duplicados.length ? ` + ${duplicados.length} duplicado${duplicados.length > 1 ? 's' : ''}` : ''} vinos × {reps} rep.) · {nPan} panelistas · {prev.diseno.length} evaluaciones en total
                </p>
                {!esFlash && !balanceado && (
                  <p className="text-sm bg-amber-50 text-amber-800 p-3 rounded-lg mb-3">
                    Para que el diseño de Williams quede completamente balanceado, el número de panelistas debería ser múltiplo de {
                      [...new Set(prev.sesiones.map(s => s.filasWilliams))].join(' y ')}. Igual se puede usar.
                  </p>
                )}
                <div className="overflow-auto max-h-[420px] border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0"><tr>
                      <th className="p-2 text-left">Sesión</th><th className="p-2 text-left">N</th><th className="p-2 text-left">{esFlash ? 'Copas (letra: vino)' : 'Vinos (repetición, código)'}</th>
                    </tr></thead>
                    <tbody>{prev.sesiones.map(s => (
                      <tr key={s.Sesion} className="border-t align-top">
                        <td className="p-2 font-bold">{s.Sesion}</td><td className="p-2">{s.NMuestras}</td>
                        <td className="p-2">{s.muestras.map(m => esFlash
                          ? <span key={m.vino} className="inline-block bg-amber-50 border border-amber-200 rounded px-2 py-0.5 mr-1 mb-1"><b className="text-amber-700">{m.codigo}</b>: {m.vino}</span>
                          : <span key={m.vino} className="inline-block bg-gray-100 rounded px-2 py-0.5 mr-1 mb-1">{m.vino} <span className="text-gray-500">r{m.rep}</span> <b>{m.codigo}</b></span>)}</td>
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
      {tab === 'analisis' && (est.tecnica === 'flash' ? <AnalisisFlash eid={eid} est={est} priv={priv} /> : est.tecnica === 'napping' ? <AnalisisNapping eid={eid} est={est} priv={priv} /> : <Analisis eid={eid} est={est} priv={priv} />)}
      {tab === 'resultados' && (est.tecnica === 'flash' ? <ResultadosFlash eid={eid} est={est} priv={priv} /> : est.tecnica === 'napping' ? <ResultadosNapping eid={eid} est={est} priv={priv} /> : <Resultados eid={eid} est={est} priv={priv} />)}
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
      {est.tecnica === 'flash' ? (
        <div>
          <p className="text-sm text-gray-600 mb-3">Perfil Flash: todos los panelistas reciben <b>las mismas copas, juntas</b>, cada una marcada con su letra.
            Servir la misma cantidad, a la misma temperatura, en copas individuales que el panelista pueda mover; dejar agua y, si hace falta, más vino para volver a probar.</p>
          <table className="text-sm border mb-6">
            <thead className="bg-gray-100"><tr><th className="p-2 border">Letra</th><th className="p-2 border">Vino</th></tr></thead>
            <tbody>{Object.keys(clave).map(v => [clave[v].codigo, v]).sort((a, b) => a[0].localeCompare(b[0])).map(([c, v]) => (
              <tr key={c}><td className="p-2 border text-center font-black text-2xl">{c}</td><td className="p-2 border">{v}</td></tr>))}
            </tbody>
          </table>
          <h3 className="font-semibold mb-2">Etiquetas para las copas ({pans.length} juegos)</h3>
          <div className="flex flex-wrap gap-2">{pans.flatMap(v => Object.values(clave).map(x => x.codigo).sort().map(c => (
            <div key={v + c} className="w-16 h-16 border-2 border-gray-800 rounded-lg flex flex-col items-center justify-center">
              <span className="font-black text-3xl leading-none">{c}</span><span className="text-[9px] text-gray-500">{v}</span>
            </div>)))}</div>
        </div>
      ) : (<>
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
      </>)}
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

// ---- Perfil Flash: armado de datos, análisis (AFM) y resultados
function datosFlash(est, priv, respuestas, sesion) {
  const info = {}; priv.filas.forEach(d => { info[`${d.Valuador}_${d.Sesion}_${d.Orden}`] = d; });
  const largo = [], pans = {}, prods = new Set();
  for (const r of respuestas) {
    if (sesion && r.Sesion !== sesion) continue;
    const d = info[`${r.Valuador}_${r.Sesion}_${r.Orden}`] || {};
    const prod = d.NombreProducto || r.CodigoProducto; prods.add(prod);
    const P = (pans[r.Valuador] = pans[r.Valuador] || { attrs: new Set(), def: {}, x: {} });
    Object.entries(r.valores || {}).forEach(([a, v]) => {
      P.attrs.add(a);
      ((P.x[a] = P.x[a] || {})[prod] = P.x[a][prod] || []).push(Number(v));
      largo.push({ Estudio: est.nombre, Sesion: r.Sesion, Valuador: r.Valuador, Orden: r.Orden, NombreProducto: prod, Rep: d.Rep || '',
        CodigoProducto: r.CodigoProducto, Atributo: a, Rango: Number(v), Definicion: (r.def && r.def[a]) || '', timestamp: r.ts || '' });
    });
    Object.assign(P.def, r.def || {});
  }
  const productos = [...prods].sort(ordenNatural);
  const vs = Object.keys(pans).sort(ordenNatural);
  const media = arr => arr && arr.length ? arr.reduce((s, y) => s + y, 0) / arr.length : null;
  const grupos = vs.map(v => {
    const attrs = [...pans[v].attrs].sort((a, b) => a.localeCompare(b, 'es'));
    return { v, def: pans[v].def, cols: attrs.map(a => ({ a, col: `${v}_${a}`, x: productos.map(p => media(pans[v].x[a][p])) })) };
  });
  largo.sort((a, b) => ordenNatural(a.Sesion, b.Sesion) || ordenNatural(a.Valuador, b.Valuador) || a.Atributo.localeCompare(b.Atributo, 'es') || a.Orden - b.Orden);
  return { largo, productos, grupos };
}

// Abre el análisis completo en Shiny (R) y le pasa la sesión del administrador por postMessage,
// solo al sitio configurado y solo a la ventana que se abrió desde acá. El token se renueva cada 45 min.
let temporizadorShiny = null;
function abrirShiny(eid, setMsg) {
  const url = datos.configShiny(); if (!url) return;
  const origen = new URL(url).origin;
  const w = window.open(url + (url.includes('?') ? '&' : '?') + 'e=' + encodeURIComponent(eid), 'pf_shiny_' + eid);
  if (!w) { setMsg && setMsg({ t: 'error', m: 'El navegador bloqueó la ventana nueva: permití ventanas emergentes para este sitio.' }); return; }
  const enviar = async (destino, forzar) => {
    const token = await datos.tokenAdmin(forzar);
    if (token) destino.postMessage({ tipo: 'pf-token', token, proyecto: datos.proyectoId(), eid }, origen);
  };
  const oyente = ev => {
    if (ev.origin !== origen || !ev.data || ev.data.tipo !== 'pf-shiny-listo') return;
    let mia = ev.source === w; try { mia = mia || ev.source.top === w; } catch {}
    if (!mia) return;
    const fuente = ev.source;
    enviar(fuente, false);
    clearInterval(temporizadorShiny);
    temporizadorShiny = setInterval(() => {
      if (w.closed) { clearInterval(temporizadorShiny); window.removeEventListener('message', oyente); return; }
      enviar(fuente, true);
    }, 45 * 60 * 1000);
  };
  window.addEventListener('message', oyente);
}
const BotonShiny = ({ eid, setMsg }) => datos.configShiny()
  ? <button onClick={() => abrirShiny(eid, setMsg)} className={btn + ' bg-indigo-600 hover:bg-indigo-700 text-white'}>Análisis completo en R (Shiny) ↗</button>
  : null;

function AnalisisFlash({ eid, est, priv }) {
  const [resp, setResp] = useState(null);
  const [msg, setMsg] = useState(null);
  const [sesion, setSesion] = useState('');
  const [mostrar, setMostrar] = useState('buenos');
  const [inv1, setInv1] = useState(false), [inv2, setInv2] = useState(false);
  const svgRef = React.useRef(null);
  useEffect(() => datos.observarRespuestas(eid, setResp, e => setMsg({ t: 'error', m: textoError(e) })), [eid]);
  const res = useMemo(() => {
    if (!resp) return null;
    const d = datosFlash(est, priv, resp, sesion);
    const bloques = d.grupos.map(g => ({ nombre: g.v, cols: g.cols.filter(c => c.x.every(v => v != null)).map(c => ({ a: `${g.v}: ${c.a}`, x: c.x })) }));
    const r = afm(d.productos, bloques);
    const terminos = {};
    d.grupos.forEach(g => g.cols.forEach(c => { const k = c.a.toLowerCase(); (terminos[k] = terminos[k] || new Set()).add(g.v); }));
    return { ...d, afm: r, terminos: Object.entries(terminos).map(([t, set]) => [t, set.size]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')) };
  }, [resp, sesion]);
  if (!res) return <div><Mensaje msg={msg}/><p className="text-gray-500">Cargando respuestas…</p></div>;
  const vis = res.afm ? { ...res.afm, vars: mostrar === 'ninguno' ? [] : mostrar === 'todos' ? res.afm.vars : res.afm.vars.filter(v => v.x * v.x + v.y * v.y >= 0.5) } : null;
  const bajarSVG = () => {
    const t = new XMLSerializer().serializeToString(svgRef.current);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'image/svg+xml' }));
    a.download = est.nombre.replace(/[^\w\-]+/g, '_') + '_AFM.svg'; a.click();
  };
  return (
    <div>
      <Mensaje msg={msg}/>
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <span className="text-gray-700"><b>{res.grupos.length}</b> panelistas con datos · <b>{res.productos.length}</b> vinos · <b>{res.grupos.reduce((s, g) => s + g.cols.length, 0)}</b> descriptores en total</span>
        <span className="text-xs text-emerald-600">● en vivo</span>
        <span className="ml-auto"><BotonShiny eid={eid} setMsg={setMsg}/></span>
        {est.sesiones.length > 1 && (
          <select value={sesion} onChange={e => setSesion(e.target.value)} className="border-2 border-gray-200 rounded-lg px-2 py-1">
            <option value="">Todas las sesiones (rango medio)</option>
            {est.sesiones.map(s => <option key={s.Sesion} value={s.Sesion}>Sesión {s.Sesion}</option>)}
          </select>)}
        <select value={mostrar} onChange={e => setMostrar(e.target.value)} className="border-2 border-gray-200 rounded-lg px-2 py-1">
          <option value="buenos">Descriptores bien representados (r² ≥ 0,5)</option>
          <option value="todos">Todos los descriptores</option>
          <option value="ninguno">Solo los vinos</option>
        </select>
      </div>
      <div className="grid xl:grid-cols-2 gap-6">
        <div>
          <h3 className="font-bold text-gray-800 mb-2">Mapa de consenso (Análisis Factorial Múltiple)</h3>
          {vis
            ? <>
                <Biplot pca={vis} inv1={inv1} inv2={inv2} svgRef={svgRef}/>
                <div className="flex flex-wrap gap-4 items-center text-xs text-gray-600 mt-2">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={inv1} onChange={e => setInv1(e.target.checked)}/> Invertir Dim 1</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={inv2} onChange={e => setInv2(e.target.checked)}/> Invertir Dim 2</label>
                  <button onClick={bajarSVG} className="underline text-purple-700">Descargar gráfico (SVG)</button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Cada panelista es un grupo con sus propios descriptores (rangos, empates promediados). Igual que <code>FactoMineR::MFA(..., type = rep("s", {res.afm.grupos.length}))</code>;
                  según Delarue, GPA y MFA dan resultados muy parecidos (para GPA, descargá la matriz en Resultados).
                </p>
                <p className="text-xs text-amber-700 bg-amber-50 rounded p-2 mt-2">
                  El resultado principal es la <b>posición de los vinos</b>. Interpretá las flechas con cuidado: dos panelistas pueden usar la misma palabra
                  para cosas distintas, o palabras distintas para lo mismo.
                </p>
                {res.productos.some(p => / \(dup\)$/.test(p)) && (
                  <p className="text-xs text-indigo-800 bg-indigo-50 rounded p-2 mt-2">
                    <b>Duplicados:</b> si cada “(dup)” queda cerca de su vino, el panel fue repetible. Si queda lejos, puede ser falta de repetibilidad
                    o que los vinos del set son muy parecidos entre sí (el perfil flash es comparativo).
                  </p>)}
              </>
            : <p className="text-gray-500 border-2 border-dashed rounded-xl p-8 text-center">Se necesitan al menos 3 vinos y algún panelista que haya terminado la sesión.</p>}
        </div>
        <div className="space-y-6">
          <div>
            <h3 className="font-bold text-gray-800 mb-2">Términos más usados</h3>
            {!res.terminos.length ? <p className="text-gray-500 text-sm">Todavía no hay datos.</p>
              : <div className="flex flex-wrap gap-1">{res.terminos.slice(0, 60).map(([t, k]) => (
                  <span key={t} className="text-sm rounded-full px-3 py-1 bg-amber-100 text-amber-900" style={{ fontSize: `${Math.min(1.25, 0.8 + 0.1 * k)}rem` }}>{t} <b>{k}</b></span>))}</div>}
            <p className="text-xs text-gray-500 mt-1">El número es cuántos panelistas usaron ese término.</p>
          </div>
          <div>
            <h3 className="font-bold text-gray-800 mb-2">Descriptores de cada panelista y acuerdo con el consenso</h3>
            <div className="overflow-auto max-h-[420px] border rounded-lg">
              <table className="text-sm w-full">
                <thead className="bg-gray-100 sticky top-0 text-xs"><tr><th className="p-2 text-left">Panelista</th><th className="p-2 text-left">RV</th><th className="p-2 text-left">Descriptores</th></tr></thead>
                <tbody>{res.grupos.map(g => {
                  const rv = res.afm && (res.afm.grupos.find(x => x.nombre === g.v) || {}).rv;
                  return (
                  <tr key={g.v} className="border-t align-top">
                    <td className="p-2 font-bold whitespace-nowrap">{g.v}</td>
                    <td className="p-2 whitespace-nowrap">{rv == null ? '—' : (
                      <div className="flex items-center gap-1" title="Coeficiente RV con la configuración de consenso (0 a 1)">
                        <div className="w-14 h-2 bg-gray-200 rounded"><div className={`h-2 rounded ${rv >= 0.7 ? 'bg-emerald-500' : rv >= 0.5 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${Math.max(0, rv) * 100}%` }}/></div>
                        <span className="text-xs">{fmt(rv)}</span>
                      </div>)}</td>
                    <td className="p-2">{g.cols.map(c => (
                      <span key={c.a} title={g.def[c.a] || ''} className={`inline-block rounded px-2 py-0.5 mr-1 mb-1 ${g.def[c.a] ? 'bg-indigo-100 text-indigo-900 underline decoration-dotted' : 'bg-gray-100'}`}>{c.a}</span>))}</td>
                  </tr>); })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-1">RV: parecido entre el mapa de cada panelista y el de consenso (1 = igual). Un valor bajo marca a alguien
              que vio las diferencias de otra manera (no necesariamente “mal”: en perfil flash las percepciones pueden diferir).
              Pasá el mouse sobre los subrayados para ver cómo evalúa cada descriptor.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultadosFlash({ eid, est, priv }) {
  const [resp, setResp] = useState(null);
  const [msg, setMsg] = useState(null);
  const cargar = async () => { setMsg(null); try { setResp(await datos.respuestasEstudio(eid)); } catch (e) { setMsg({ t: 'error', m: textoError(e) }); } };
  useEffect(() => { cargar(); }, [eid]);
  if (!resp) return <div><Mensaje msg={msg}/><p className="text-gray-500">Cargando…</p></div>;
  const d = datosFlash(est, priv, resp, '');
  const base = est.nombre.replace(/[^\w\-]+/g, '_');
  const colsL = ['Estudio', 'Sesion', 'Valuador', 'Orden', 'NombreProducto', 'Rep', 'CodigoProducto', 'Atributo', 'Rango', 'Definicion', 'timestamp'];
  const grupos = d.grupos.filter(g => g.cols.length);
  const colsM = ['Producto', ...grupos.flatMap(g => g.cols.map(c => c.col))];
  const matriz = d.productos.map((p, i) => { const o = { Producto: p }; grupos.forEach(g => g.cols.forEach(c => { o[c.col] = c.x[i] ?? ''; })); return o; });
  const tam = grupos.map(g => g.cols.length);
  // control del cap. 7: la suma de rangos de cada descriptor debe ser p(p+1)/2 por sesión
  const porSes = {}; resp.forEach(r => { Object.entries(r.valores || {}).forEach(([a, v]) => { const k = `${r.Valuador}|${r.Sesion}|${a}`; (porSes[k] = porSes[k] || []).push(Number(v)); }); });
  const malSuma = Object.entries(porSes).filter(([, vs]) => Math.abs(vs.reduce((s, x) => s + x, 0) - vs.length * (vs.length + 1) / 2) > 1e-6).map(([k]) => k.replace(/\|/g, ' · '));
  const codigoR = `library(FactoMineR)
d <- read.csv("${base}_matriz.csv", row.names = 1, check.names = FALSE)
grupos <- c(${tam.join(', ')})
nombres <- c(${grupos.map(g => `"${g.v}"`).join(', ')})
afm <- MFA(d, group = grupos, type = rep("s", length(grupos)), name.group = nombres)
gpa <- GPA(d, group = grupos, name.group = nombres)
afm$group$RV     # acuerdo de cada panelista con el consenso
gpa$consensus    # configuración de consenso (GPA)`;
  return (
    <div>
      <Mensaje msg={msg}/>
      <p className="text-gray-700 mb-4"><b>{new Set(resp.map(r => `${r.Valuador}_${r.Sesion}`)).size}</b> sesiones de panelista enviadas de <b>{est.panelistas.length * est.sesiones.length}</b> · {d.largo.length} rangos.</p>
      {d.largo.length > 0 && (malSuma.length
        ? <p className="text-sm bg-red-50 text-red-700 p-3 rounded-lg mb-3">Revisar: la suma de rangos no da p(p+1)/2 en {malSuma.join(', ')}.</p>
        : <p className="text-sm text-emerald-700 mb-3">✓ Control: en todos los descriptores la suma de rangos es p(p+1)/2.</p>)}
      <div className="flex flex-wrap gap-3 mb-3">
        <button onClick={() => descargar(`${base}_matriz.csv`, aCSV(matriz, colsM, ',', false))} disabled={!grupos.length}
          className={btn + ' bg-emerald-600 hover:bg-emerald-700 text-white'}>Matriz para MFA / GPA (R)</button>
        <button onClick={() => descargar(`${base}_matriz_excel.csv`, aCSV(matriz, colsM, ';', true))} disabled={!grupos.length}
          className={btn + ' bg-emerald-100 hover:bg-emerald-200 text-emerald-800'}>Matriz (Excel)</button>
        <button onClick={() => descargar(`${base}_rangos_largo.csv`, aCSV(d.largo, colsL, ',', false))} disabled={!d.largo.length}
          className={btn + ' bg-emerald-600 hover:bg-emerald-700 text-white'}>Formato largo (R)</button>
        <button onClick={() => descargar(`${base}_rangos_largo_excel.csv`, aCSV(d.largo, colsL, ';', true))} disabled={!d.largo.length}
          className={btn + ' bg-emerald-100 hover:bg-emerald-200 text-emerald-800'}>Formato largo (Excel)</button>
        <button onClick={cargar} className={btn + ' bg-gray-100 hover:bg-gray-200'}>Actualizar</button>
        <BotonShiny eid={eid} setMsg={setMsg}/>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        <b>Matriz:</b> una fila por vino y una columna por descriptor de cada panelista (<code>V1_Frutado</code>…), con el rango
        (1 = menos intenso; empates promediados; si hubo repeticiones, rango medio). Es la entrada de MFA / GPA.
        <b> Formato largo:</b> una fila por panelista × muestra × descriptor, con la sesión, la repetición y cómo evalúa cada descriptor.
      </p>
      {grupos.length > 0 && (
        <>
          <p className="text-sm font-semibold text-gray-700 mb-1">Código R para esta matriz</p>
          <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-auto mb-4">{codigoR}</pre>
          <div className="overflow-auto max-h-[50vh] border rounded-lg">
            <table className="text-xs">
              <thead className="bg-gray-100 sticky top-0"><tr>{colsM.map(c => <th key={c} className="p-2 text-left whitespace-nowrap">{c}</th>)}</tr></thead>
              <tbody>{matriz.map((f, i) => <tr key={i} className="border-t">{colsM.map(c => <td key={c} className="p-2 whitespace-nowrap">{typeof f[c] === 'number' ? fmt(f[c], f[c] % 1 ? 2 : 0) : f[c]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Napping: armado de datos, análisis (AFM con coordenadas sin estandarizar) y resultados
function datosNapping(est, priv, respuestas, { sesion = '', tarea = '' } = {}) {
  const cfg = est.napping || { hoja: 'rect', tareas: ['Global'] };
  const tareas = cfg.tareas && cfg.tareas.length ? cfg.tareas : ['Global'];
  const usar = tarea ? [tarea] : tareas;
  const info = {}; priv.filas.forEach(d => { info[`${d.Valuador}_${d.Sesion}_${d.Orden}`] = d; });
  const largo = [], prods = new Set(), grupos = {}, palabras = {};
  const variasSes = est.sesiones.length > 1;
  for (const r of respuestas) {
    if (sesion && r.Sesion !== sesion) continue;
    const d = info[`${r.Valuador}_${r.Sesion}_${r.Orden}`] || {};
    const prod = d.NombreProducto || r.CodigoProducto; prods.add(prod);
    for (const t of tareas) {
      const x = r.valores && r.valores[claveX(t)], y = r.valores && r.valores[claveY(t)];
      if (x == null || y == null) continue;
      const ws = ((r.def && r.def[t]) || '').split(';').map(w => w.trim()).filter(Boolean);
      largo.push({ Estudio: est.nombre, Sesion: r.Sesion, Valuador: r.Valuador, Tarea: t, Orden: r.Orden, NombreProducto: prod, Rep: d.Rep || '',
        CodigoProducto: r.CodigoProducto, X: x, Y: y, Palabras: ws.join(', '), timestamp: r.ts || '' });
      if (!usar.includes(t)) continue;
      const g = r.Valuador + (variasSes ? '_' + r.Sesion : '') + (usar.length > 1 ? '_' + t : '');
      (grupos[g] = grupos[g] || { v: r.Valuador, s: r.Sesion, t, pos: {} }).pos[prod] = [x, y];
      ws.forEach(w => { const k = usar.length > 1 && tareas.length > 1 ? `${t}: ${w}` : w; ((palabras[k] = palabras[k] || {})[prod] = (palabras[k][prod] || 0) + 1); });
    }
  }
  const productos = [...prods].sort(ordenNatural);
  const nombresG = Object.keys(grupos).sort(ordenNatural).filter(g => productos.every(p => grupos[g].pos[p]));
  largo.sort((a, b) => ordenNatural(a.Sesion, b.Sesion) || ordenNatural(a.Valuador, b.Valuador) || a.Tarea.localeCompare(b.Tarea) || a.Orden - b.Orden);
  return { cfg, tareas, largo, productos, grupos, nombresG, palabras };
}

// índice de desempeño de Hopfer y Heymann (2013): distancia duplicado–original / distancia máxima entre muestras de ese panelista
function indiceDesempeno(d) {
  const dups = d.productos.filter(p => / \(dup\)$/.test(p) && d.productos.includes(p.replace(/ \(dup\)$/, '')));
  if (!dups.length) return null;
  return d.nombresG.map(g => {
    const P = d.grupos[g].pos, dist = (a, b) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
    let mx = 0; d.productos.forEach((a, i) => d.productos.slice(i + 1).forEach(b => { mx = Math.max(mx, dist(a, b)); }));
    const vals = dups.map(p => (mx > 0 ? dist(p, p.replace(/ \(dup\)$/, '')) / mx : null));
    return { g, vals, media: vals.reduce((s, v) => s + v, 0) / vals.length };
  });
}

function MiniHoja({ grupo, productos, hoja, rv }) {
  const H = HOJAS[hoja] || HOJAS.rect, W = 220, h = W * H.alto / H.ancho, pad = 4;
  const X = x => pad + (x / H.ancho) * (W - 2 * pad), Y = y => h - pad - (y / H.alto) * (h - 2 * pad);
  return (
    <div className="border rounded-lg p-2 bg-white">
      <p className="text-xs font-bold text-gray-700 mb-1">{grupo.v}{grupo.s && ` · ${grupo.s}`}{rv != null && <span className="font-normal text-gray-500"> · RV {fmt(rv)}</span>}</p>
      <svg viewBox={`0 0 ${W} ${h}`} className="w-full">
        {H.redonda ? <circle cx={W / 2} cy={h / 2} r={W / 2 - 1} fill="#f8fafc" stroke="#cbd5e1"/> : <rect x="1" y="1" width={W - 2} height={h - 2} fill="#f8fafc" stroke="#cbd5e1" rx="3"/>}
        {productos.map(p => grupo.pos[p] && (
          <g key={p}><circle cx={X(grupo.pos[p][0])} cy={Y(grupo.pos[p][1])} r="3.5" fill={/ \(dup\)$/.test(p) ? 'none' : '#4f46e5'} stroke="#4f46e5"/>
            <text x={X(grupo.pos[p][0]) + 5} y={Y(grupo.pos[p][1]) + 3} fontSize="8" fill="#1e1b4b">{p}</text></g>))}
      </svg>
    </div>
  );
}

function AnalisisNapping({ eid, est, priv }) {
  const [resp, setResp] = useState(null);
  const [msg, setMsg] = useState(null);
  const [sesion, setSesion] = useState('');
  const [tarea, setTarea] = useState('');
  const [verPal, setVerPal] = useState(true);
  const [inv1, setInv1] = useState(false), [inv2, setInv2] = useState(false);
  const svgRef = React.useRef(null);
  useEffect(() => datos.observarRespuestas(eid, setResp, e => setMsg({ t: 'error', m: textoError(e) })), [eid]);
  const tareas = (est.napping && est.napping.tareas) || ['Global'];
  const res = useMemo(() => {
    if (!resp) return null;
    const d = datosNapping(est, priv, resp, { sesion, tarea: tarea || (tareas.length === 1 ? tareas[0] : '') });
    const bloques = d.nombresG.map(g => ({ nombre: g, cols: [{ a: 'X', x: d.productos.map(p => d.grupos[g].pos[p][0]) }, { a: 'Y', x: d.productos.map(p => d.grupos[g].pos[p][1]) }] }));
    const r = afm(d.productos, bloques, { escalar: false });
    // palabras: correlación de su frecuencia con las dimensiones (como variables suplementarias), las usadas al menos 2 veces
    let vars = [];
    if (r) {
      const F1 = r.ind.map(p => p.x), F2 = r.ind.map(p => p.y);
      const cor = (a, b) => { const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
        let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
        return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0; };
      vars = Object.entries(d.palabras).map(([w, f]) => { const x = d.productos.map(p => f[p] || 0); return { a: w, tot: x.reduce((s, v) => s + v, 0), x: cor(x, F1), y: cor(x, F2) }; })
        .filter(v => v.tot >= 2 && v.x * v.x + v.y * v.y >= 0.3);
    }
    const top = d.productos.map(p => ({ p, ws: Object.entries(d.palabras).map(([w, f]) => [w, f[p] || 0]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 6) }));
    return { ...d, afm: r, vars, top, ppi: indiceDesempeno(d) };
  }, [resp, sesion, tarea]);
  if (!res) return <div><Mensaje msg={msg}/><p className="text-gray-500">Cargando respuestas…</p></div>;
  const rvDe = g => res.afm && (res.afm.grupos.find(x => x.nombre === g) || {}).rv;
  const vis = res.afm ? { ...res.afm, vars: verPal ? res.vars : [] } : null;
  const bajarSVG = () => {
    const t = new XMLSerializer().serializeToString(svgRef.current);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'image/svg+xml' }));
    a.download = est.nombre.replace(/[^\w\-]+/g, '_') + '_napping_AFM.svg'; a.click();
  };
  return (
    <div>
      <Mensaje msg={msg}/>
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <span className="text-gray-700"><b>{new Set(res.nombresG.map(g => res.grupos[g].v)).size}</b> panelistas con datos · <b>{res.productos.length}</b> muestras</span>
        <span className="text-xs text-emerald-600">● en vivo</span>
        {tareas.length > 1 && (
          <select value={tarea} onChange={e => setTarea(e.target.value)} className="border-2 border-gray-200 rounded-lg px-2 py-1">
            <option value="">Todos los focos juntos</option>
            {tareas.map(t => <option key={t} value={t}>Napping parcial: {t}</option>)}
          </select>)}
        {est.sesiones.length > 1 && (
          <select value={sesion} onChange={e => setSesion(e.target.value)} className="border-2 border-gray-200 rounded-lg px-2 py-1">
            <option value="">Todas las sesiones</option>
            {est.sesiones.map(s => <option key={s.Sesion} value={s.Sesion}>Sesión {s.Sesion}</option>)}
          </select>)}
        <label className="flex items-center gap-1"><input type="checkbox" checked={verPal} onChange={e => setVerPal(e.target.checked)}/> Palabras en el mapa</label>
      </div>
      <div className="grid xl:grid-cols-2 gap-6">
        <div>
          <h3 className="font-bold text-gray-800 mb-2">Mapa de consenso (Análisis Factorial Múltiple)</h3>
          {vis
            ? <>
                <Biplot pca={vis} inv1={inv1} inv2={inv2} svgRef={svgRef}/>
                <div className="flex flex-wrap gap-4 items-center text-xs text-gray-600 mt-2">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={inv1} onChange={e => setInv1(e.target.checked)}/> Invertir Dim 1</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={inv2} onChange={e => setInv2(e.target.checked)}/> Invertir Dim 2</label>
                  <button onClick={bajarSVG} className="underline text-purple-700">Descargar gráfico (SVG)</button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Cada panelista aporta sus coordenadas X e Y (en cm, sin estandarizar), igual que <code>FactoMineR::MFA(..., type = rep("c", {res.afm.grupos.length}))</code>.
                  Las palabras (usadas al menos 2 veces) se muestran por su correlación con las dimensiones y no influyen en el mapa.
                </p>
                <p className="text-xs text-amber-700 bg-amber-50 rounded p-2 mt-2">El Napping es rápido pero poco preciso: interpretá sobre todo las dos primeras dimensiones y los grupos de muestras, no diferencias finas.</p>
              </>
            : <p className="text-gray-500 border-2 border-dashed rounded-xl p-8 text-center">Se necesitan al menos 3 muestras y algún panelista que haya terminado la sesión.</p>}
        </div>
        <div className="space-y-6">
          <div>
            <h3 className="font-bold text-gray-800 mb-2">Palabras más usadas por muestra</h3>
            {!Object.keys(res.palabras).length ? <p className="text-gray-500 text-sm">Todavía no hay palabras.</p>
              : <table className="text-sm w-full border rounded-lg"><tbody>{res.top.map(t => (
                  <tr key={t.p} className="border-t align-top"><td className="p-2 font-bold whitespace-nowrap">{t.p}</td>
                    <td className="p-2">{t.ws.map(([w, k]) => <span key={w} className="inline-block bg-emerald-50 text-emerald-900 rounded px-2 py-0.5 mr-1 mb-1">{w} <b>{k}</b></span>)}</td></tr>))}
                </tbody></table>}
          </div>
          <div>
            <h3 className="font-bold text-gray-800 mb-2">Panelistas</h3>
            <table className="text-sm w-full border rounded-lg">
              <thead className="bg-gray-100 text-xs"><tr><th className="p-2 text-left">Panelista</th><th className="p-2 text-left">RV con el consenso</th>{res.ppi && <th className="p-2 text-left">Índice de desempeño (duplicados)</th>}</tr></thead>
              <tbody>{res.nombresG.map(g => { const rv = rvDe(g), pp = res.ppi && res.ppi.find(x => x.g === g); return (
                <tr key={g} className="border-t"><td className="p-2 font-bold">{g}</td>
                  <td className="p-2">{rv == null ? '—' : <div className="flex items-center gap-1"><div className="w-16 h-2 bg-gray-200 rounded"><div className={`h-2 rounded ${rv >= 0.7 ? 'bg-emerald-500' : rv >= 0.5 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${Math.max(0, rv) * 100}%` }}/></div><span className="text-xs">{fmt(rv)}</span></div>}</td>
                  {res.ppi && <td className="p-2 text-xs">{pp ? fmt(pp.media) : '—'}</td>}
                </tr>); })}</tbody>
            </table>
            <p className="text-xs text-gray-500 mt-1">RV: parecido del mapa de cada panelista con el consenso (1 = igual).
              {res.ppi && ' Índice de desempeño (Hopfer y Heymann, 2013): distancia entre el duplicado y su muestra dividida por la distancia máxima entre muestras de ese panelista; más bajo = mejor.'}</p>
          </div>
        </div>
      </div>
      <h3 className="font-bold text-gray-800 mt-6 mb-2">Mapas individuales</h3>
      <p className="text-xs text-gray-500 mb-2">Cómo ubicó cada panelista las muestras en su hoja. Sirve para ver estrategias distintas (en línea, en grupos, todas juntas…) que describe Dehlholm.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {res.nombresG.map(g => <MiniHoja key={g} grupo={{ ...res.grupos[g], s: res.grupos[g].s && est.sesiones.length > 1 ? res.grupos[g].s : '' , v: g }} productos={res.productos} hoja={res.cfg.hoja} rv={rvDe(g)} />)}
      </div>
    </div>
  );
}

function ResultadosNapping({ eid, est, priv }) {
  const [resp, setResp] = useState(null);
  const [msg, setMsg] = useState(null);
  const cargar = async () => { setMsg(null); try { setResp(await datos.respuestasEstudio(eid)); } catch (e) { setMsg({ t: 'error', m: textoError(e) }); } };
  useEffect(() => { cargar(); }, [eid]);
  if (!resp) return <div><Mensaje msg={msg}/><p className="text-gray-500">Cargando…</p></div>;
  const d = datosNapping(est, priv, resp);
  const base = est.nombre.replace(/[^\w\-]+/g, '_');
  const colsL = ['Estudio', 'Sesion', 'Valuador', 'Tarea', 'Orden', 'NombreProducto', 'Rep', 'CodigoProducto', 'X', 'Y', 'Palabras', 'timestamp'];
  const palabras = Object.keys(d.palabras).sort((a, b) => a.localeCompare(b, 'es'));
  const colsC = d.nombresG.flatMap(g => [`${g}_X`, `${g}_Y`]);
  const colsM = ['Producto', ...colsC, ...palabras];
  const matriz = d.productos.map(p => { const o = { Producto: p };
    d.nombresG.forEach(g => { o[`${g}_X`] = d.grupos[g].pos[p][0]; o[`${g}_Y`] = d.grupos[g].pos[p][1]; });
    palabras.forEach(w => { o[w] = d.palabras[w][p] || 0; }); return o; });
  const textual = d.largo.filter(r => r.Palabras).map(r => ({ Valuador: r.Valuador, Tarea: r.Tarea, Producto: r.NombreProducto, Palabras: r.Palabras }));
  const k = d.nombresG.length;
  const codigoR = `library(FactoMineR); library(SensoMineR)
d <- read.csv("${base}_matriz.csv", row.names = 1, check.names = FALSE)
k <- ${k}   # grupos de coordenadas (X, Y de cada panelista${d.tareas.length > 1 ? ' y foco' : ''})${palabras.length ? `
afm <- MFA(d, group = c(rep(2, k), ${palabras.length}), type = c(rep("c", k), "f"),
           num.group.sup = k + 1, name.group = c(${d.nombresG.map(g => `"${g}"`).join(', ')}, "Palabras"))` : `
afm <- MFA(d, group = rep(2, k), type = rep("c", k), name.group = c(${d.nombresG.map(g => `"${g}"`).join(', ')}))`}
afm$group$RV                             # acuerdo de cada panelista con el consenso
coord <- d[, 1:(2 * k)]
pmfa(coord)                              # MFA con cada panelista superpuesto (SensoMineR)
boot(coord, method = "napping")          # elipses de confianza${palabras.length ? `
descfreq(d[, (2 * k + 1):ncol(d)])       # palabras que caracterizan a cada muestra` : ''}`;
  return (
    <div>
      <Mensaje msg={msg}/>
      <p className="text-gray-700 mb-4"><b>{new Set(resp.map(r => `${r.Valuador}_${r.Sesion}`)).size}</b> sesiones de panelista enviadas de <b>{est.panelistas.length * est.sesiones.length}</b>.
        Hoja: {(HOJAS[d.cfg.hoja] || HOJAS.rect).nombre}; coordenadas en cm desde la esquina inferior izquierda.</p>
      <div className="flex flex-wrap gap-3 mb-3">
        <button onClick={() => descargar(`${base}_matriz.csv`, aCSV(matriz, colsM, ',', false))} disabled={!k}
          className={btn + ' bg-emerald-600 hover:bg-emerald-700 text-white'}>Matriz para MFA (R)</button>
        <button onClick={() => descargar(`${base}_matriz_excel.csv`, aCSV(matriz, colsM, ';', true))} disabled={!k}
          className={btn + ' bg-emerald-100 hover:bg-emerald-200 text-emerald-800'}>Matriz (Excel)</button>
        <button onClick={() => descargar(`${base}_napping_largo.csv`, aCSV(d.largo, colsL, ',', false))} disabled={!d.largo.length}
          className={btn + ' bg-emerald-600 hover:bg-emerald-700 text-white'}>Formato largo (R)</button>
        <button onClick={() => descargar(`${base}_napping_largo_excel.csv`, aCSV(d.largo, colsL, ';', true))} disabled={!d.largo.length}
          className={btn + ' bg-emerald-100 hover:bg-emerald-200 text-emerald-800'}>Formato largo (Excel)</button>
        <button onClick={() => descargar(`${base}_palabras_textual.csv`, aCSV(textual, ['Valuador', 'Tarea', 'Producto', 'Palabras'], ',', false))} disabled={!textual.length}
          className={btn + ' bg-gray-100 hover:bg-gray-200'}>Palabras (para textual)</button>
        <button onClick={cargar} className={btn + ' bg-gray-100 hover:bg-gray-200'}>Actualizar</button>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        <b>Matriz:</b> una fila por muestra; dos columnas (X, Y) por panelista{d.tareas.length > 1 ? ' y foco' : ''}, y después la tabla de frecuencia de palabras
        (como la fig. 9.3 del capítulo). <b>Formato largo:</b> una fila por panelista × muestra × hoja. <b>Palabras:</b> panelista, muestra y palabras, para <code>FactoMineR::textual</code>.
      </p>
      {k > 0 && (
        <>
          <p className="text-sm font-semibold text-gray-700 mb-1">Código R para esta matriz</p>
          <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-auto mb-4">{codigoR}</pre>
          <div className="overflow-auto max-h-[50vh] border rounded-lg">
            <table className="text-xs">
              <thead className="bg-gray-100 sticky top-0"><tr>{colsM.map(c => <th key={c} className="p-2 text-left whitespace-nowrap">{c}</th>)}</tr></thead>
              <tbody>{matriz.map((f, i) => <tr key={i} className="border-t">{colsM.map(c => <td key={c} className="p-2 whitespace-nowrap">{typeof f[c] === 'number' ? fmt(f[c], f[c] % 1 ? 1 : 0) : f[c]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </>
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
