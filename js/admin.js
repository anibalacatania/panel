// =====================================================================
// Administración: crear y manejar varios paneles a la vez
// =====================================================================
/* global $ */
import { esc, showNotification, showModal, removeModal } from './shiny.js';
import { leerTexto, parsearCSV, armarDiseno, armarAtributos, tablaRespuestas, aCSV, descargar, zip } from './archivos.js';
import { graficoQR } from './graficos.js';

const demo = new URLSearchParams(location.search).has('demo');
const D = await import(demo ? './datos-falso.js' : './datos.js');
const sufijo = demo ? '&demo' : '';
const base = location.origin + location.pathname.replace(/admin\.html$/, '');
const linkPanel = id => `${base}?p=${id}${sufijo}`;
const linkTablero = id => `${base}tablero.html?p=${id}${sufijo}`;

let usuario = null, paneles = [], progresos = {}, oyentesProg = {}, desuscribir = null;
const $p = $('#principal');

await D.iniciar({ admin: true });

D.observarSesion(u => {
  usuario = u;
  $('#sesion').html(u
    ? `<h6>${esc(u.email)}</h6><button type="button" class="btn btn-default btn-sm" id="salir">Salir</button>`
    : '');
  $('#salir').on('click', () => D.salir());
  if (desuscribir) { desuscribir(); desuscribir = null; }
  Object.values(oyentesProg).forEach(f => f()); oyentesProg = {};
  if (!u) return pantallaEntrar();
  if (!u.rol) {
    $p.html(`<h1>Paneles</h1><div class="alert alert-warning">La cuenta <b>${esc(u.email)}</b> no es administradora.
      Pida a un administrador total de LibreSense que la agregue (Administración de LibreSense → Administradores).</div>`);
    return;
  }
  pantallaPrincipal();
  desuscribir = D.observarPaneles((lista, err) => {
    if (!lista) { $('#lista').html(`<div class="alert alert-danger">No se pudo leer la lista de paneles: ${esc(err?.message || '')}</div>`); return; }
    paneles = u.rol === 'super' ? lista : lista.filter(x => x.dueno === u.email);
    for (const x of paneles) if (!oyentesProg[x.id]) {
      oyentesProg[x.id] = D.observarProgresos(x.id, pr => { progresos[x.id] = pr; dibujarLista(); });
    }
    dibujarLista();
  });
});

function pantallaEntrar() {
  $p.html(`<h1>Paneles</h1><p>Entrá con la misma cuenta de Google que usás en LibreSense.</p>
    <button type="button" class="btn btn-primary" id="entrar">Entrar con Google</button>`);
  $('#entrar').on('click', () => D.entrar().catch(e => showNotification('No se pudo entrar: ' + e.message, 'error')));
}

function pantallaPrincipal() {
  $p.html(`
    <h1>Paneles</h1>
    <ul class="nav nav-tabs">
      <li class="active"><a href="#t-lista" data-toggle="tab">Paneles</a></li>
      <li><a href="#t-nuevo" data-toggle="tab">Nuevo panel</a></li>
    </ul>
    <div class="tab-content">
      <div class="tab-pane active" id="t-lista"><br/><div id="uso"></div><div id="lista"><p>Cargando…</p></div></div>
      <div class="tab-pane" id="t-nuevo"><br/>${formularioNuevo()}</div>
    </div>`);
  conectarFormulario();
  dibujarUso();
}

// ----------------------------------------------------------------- uso de Firebase (plan gratuito Spark)
const consolaUso = 'https://console.firebase.google.com/project/panel-sensorial-ef729/firestore/databases/-default-/usage';
const fmtBytes = b => b < 1024 ** 2 ? (b / 1024).toFixed(0) + ' KB' : (b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 2 : 1) + ' MB';
const barra = (pct) => {
  const c = pct < 60 ? 'progress-bar-success' : pct < 85 ? 'progress-bar-warning' : 'progress-bar-danger';
  return `<div class="progress" style="margin-bottom:4px"><div class="progress-bar ${c}" role="progressbar" style="width:${Math.max(pct, 0.5).toFixed(1)}%;min-width:2.5em">${pct < 1 ? '<1' : pct.toFixed(0)}%</div></div>`;
};
var calculandoUso = false;   // var: se usa antes de esta línea al iniciar
async function dibujarUso() {
  const $u = $('#uso');
  if (!$u.length || calculandoUso) return;
  calculandoUso = true;
  $u.html(`<div class="panel panel-default"><div class="panel-body text-muted">Calculando el uso de Firebase…</div></div>`);
  try {
    const { LIMITES } = await import('./tamano.js');
    const u = await D.estimarUso();
    const pa = (100 * u.bytes) / LIMITES.almacenamiento, pe = (100 * u.escriturasHoy) / LIMITES.escrituras;
    const reinicio = new Date(u.desde.getTime() + 24 * 3600 * 1000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    const libres = Math.floor((LIMITES.escrituras - u.escriturasHoy) / 2);
    $u.html(`<div class="panel panel-default"><div class="panel-heading"><b>Uso de Firebase</b> (plan gratuito)
        <button type="button" class="btn btn-default btn-xs pull-right" id="uso-actualizar">Actualizar</button></div>
      <div class="panel-body"><div class="row">
        <div class="col-sm-6"><b>Almacenamiento</b> (estimado): ${fmtBytes(u.bytes)} de 1 GB · ${u.docs.toLocaleString('es-AR')} documentos
          ${barra(pa)}<small class="text-muted">Lugar para unas ${Math.floor((LIMITES.almacenamiento - u.bytes) / Math.max(1, u.bytes / Math.max(1, u.docs)) / 1000).toLocaleString('es-AR')} mil documentos más</small></div>
        <div class="col-sm-6"><b>Escrituras de hoy</b> (aprox.): ${u.escriturasHoy.toLocaleString('es-AR')} de 20.000
          ${barra(pe)}<small class="text-muted">Quedan para unas ${Math.max(0, libres).toLocaleString('es-AR')} respuestas más hoy · se reinicia a las ${reinicio} h</small></div>
      </div>
      <small class="text-muted">Incluye paneles y estudios de LibreSense (comparten la base).${u.parcial ? ' <b>Parcial:</b> hay datos que esta cuenta no puede leer.' : ''}
        Cifras exactas: <a href="${consolaUso}" target="_blank" rel="noopener">uso en la consola de Firebase</a>.</small></div></div>`);
    $('#uso-actualizar').on('click', dibujarUso);
  } catch (e) {
    $u.html(`<div class="alert alert-warning">No se pudo calcular el uso de Firebase (${esc(e.message)}). <a href="${consolaUso}" target="_blank" rel="noopener">Ver en la consola</a>.</div>`);
  } finally { calculandoUso = false; }
}

// ----------------------------------------------------------------- nuevo panel
function formularioNuevo() {
  return `
  <div class="row"><div class="col-md-6">
    <div class="form-group"><label class="control-label" for="n-nombre">Nombre del panel</label>
      <input id="n-nombre" type="text" class="form-control" placeholder="Ej.: Grupo F1 — Malbec 2025"/></div>
    <div class="form-group"><label class="control-label" for="n-diseno">Diseño (.csv: Valuador, Muestra, NombreProducto, CodigoProducto)</label>
      <input id="n-diseno" type="file" accept=".csv,text/csv"/></div>
    <div class="form-group"><label class="control-label" for="n-atrib">Atributos (.csv: Nombre, Valores)</label>
      <input id="n-atrib" type="file" accept=".csv,text/csv"/></div>
    <div class="form-group"><label class="control-label" for="n-mostrar">El panelista ve</label>
      <select id="n-mostrar" class="form-control">
        <option value="CodigoProducto">CodigoProducto (código de cada producto)</option>
        <option value="CodigoMuestra">CodigoMuestra (código distinto por panelista)</option>
        <option value="NombreProducto">NombreProducto (nombre del vino, sin ciego)</option>
      </select></div>
    <div class="form-group"><label class="control-label" for="n-etiqueta">Título del selector de muestra</label>
      <input id="n-etiqueta" type="text" class="form-control" value="Copa"/></div>
    <div class="row">
      <div class="col-xs-4"><div class="form-group"><label class="control-label" for="n-min">Escala desde</label><input id="n-min" type="number" class="form-control" value="0"/></div></div>
      <div class="col-xs-4"><div class="form-group"><label class="control-label" for="n-max">hasta</label><input id="n-max" type="number" class="form-control" value="10"/></div></div>
      <div class="col-xs-4"><div class="form-group"><label class="control-label" for="n-paso">Paso</label><input id="n-paso" type="number" class="form-control" value="0.01" step="0.01" min="0.01"/></div></div>
    </div>
    <div class="checkbox"><label><input id="n-azar" type="checkbox"/> Atributos en orden al azar en cada muestra</label></div>
    <button type="button" class="btn btn-primary" id="n-crear" disabled>Crear y abrir panel</button>
  </div>
  <div class="col-md-6"><div id="n-previa" class="text-muted">Subí el diseño y los atributos para ver la vista previa.</div></div>
  </div>`;
}

let previa = null;
function conectarFormulario() {
  const actualizar = async () => {
    const fd = $('#n-diseno')[0].files[0], fa = $('#n-atrib')[0].files[0];
    previa = null;
    $('#n-crear').prop('disabled', true);
    if (!fd || !fa) { $('#n-previa').html('<span class="text-muted">Subí el diseño y los atributos para ver la vista previa.</span>'); return; }
    const d = armarDiseno(parsearCSV(await leerTexto(fd)), $('#n-mostrar').val());
    const a = armarAtributos(parsearCSV(await leerTexto(fa)));
    const errores = [...d.errores, ...a.errores];
    const mn = Number($('#n-min').val()), mx = Number($('#n-max').val()), paso = Number($('#n-paso').val());
    if (!(mx > mn)) errores.push('La escala no es válida.');
    if (!(paso > 0)) errores.push('El paso no es válido.');
    let h = '';
    if (errores.length) h += `<div class="alert alert-danger"><ul>${errores.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
    if (d.avisos.length) h += `<div class="alert alert-warning">${d.avisos.map(esc).join('<br/>')}</div>`;
    if (d.filas.length && a.atributos.length) {
      const v1 = d.valuadores[0];
      h += `<h4>Vista previa</h4>
        <p><b>${d.valuadores.length}</b> panelistas · <b>${d.muestras.length}</b> muestras · <b>${d.filas.length}</b> evaluaciones en total</p>
        <p><b>Atributos:</b> ${a.atributos.map(x => `${esc(x.Nombre)} <span class="text-muted">(${esc(x.Valores)})</span>`).join(', ')}</p>
        <p><b>Bandeja de ${esc(v1)}</b> (en orden de servicio):</p>
        <div class="vista-previa"><table class="table table-condensed table-striped"><thead><tr><th>Orden</th><th>Muestra</th><th>NombreProducto</th><th>CodigoProducto</th><th>CodigoMuestra</th><th>Ve</th></tr></thead><tbody>
        ${d.filas.filter(f => f.Valuador === v1).map(f => `<tr><td>${f.Orden}</td><td>${esc(f.Muestra)}</td><td>${esc(f.NombreProducto)}</td><td>${esc(f.CodigoProducto)}</td><td>${esc(f.CodigoMuestra)}</td><td><b>${esc(f.Etiqueta)}</b></td></tr>`).join('')}
        </tbody></table></div>`;
    }
    $('#n-previa').html(h);
    if (!errores.length) {
      previa = { d, a, mn, mx, paso };
      $('#n-crear').prop('disabled', false);
    }
  };
  $('#n-diseno, #n-atrib, #n-mostrar, #n-min, #n-max, #n-paso').on('change', actualizar);
  $('#n-crear').on('click', async () => {
    if (!previa) return;
    const nombre = $('#n-nombre').val().trim() || ('Panel ' + new Date().toLocaleString('es-AR'));
    const { d, a, mn, mx, paso } = previa;
    $('#n-crear').prop('disabled', true).text('Creando…');
    try {
      const id = await D.crearPanel(usuario.email, {
        nombre, atributos: a.atributos, etiqueta: $('#n-etiqueta').val().trim() || 'Copa',
        mostrar: $('#n-mostrar').val(), rango: [mn, mx], paso, azar: $('#n-azar').prop('checked'),
        panelistas: d.valuadores, nMuestras: d.filas.length,
      }, d.filas);
      showNotification('Panel creado y abierto.', 'message');
      setTimeout(dibujarUso, 1500);
      $('#n-nombre').val(''); $('#n-diseno').val(''); $('#n-atrib').val(''); previa = null;
      $('#n-previa').html('');
      $('a[href="#t-lista"]').tab('show');
      setTimeout(() => mostrarQR(id), 300);
    } catch (e) {
      showNotification('No se pudo crear el panel: ' + e.message, 'error', 0);
    } finally {
      $('#n-crear').text('Crear y abrir panel');
    }
  });
}

// ----------------------------------------------------------------- lista
function dibujarLista() {
  const $l = $('#lista');
  if (!$l.length) return;
  if (!paneles.length) { $l.html('<p class="text-muted">Todavía no hay paneles. Creá uno en <b>Nuevo panel</b>.</p>'); return; }
  const abiertos = paneles.filter(x => x.activo).length;
  let h = `<p>${paneles.length} paneles · <b>${abiertos}</b> abiertos.</p>`;
  for (const x of paneles) {
    const pr = progresos[x.id] || {};
    const hechas = Object.values(pr).reduce((s, a) => s + a.length, 0);
    const porV = (x.nMuestras && x.panelistas?.length) ? x.nMuestras / x.panelistas.length : 0;
    const terminados = (x.panelistas || []).filter(v => porV && (pr[v] || []).length >= porV).length;
    h += `<div class="panel-fila" data-id="${x.id}">
      <h4>${esc(x.nombre)} <span class="label ${x.activo ? 'label-success' : 'label-default'}">${x.activo ? 'abierto' : 'cerrado'}</span></h4>
      <p class="text-muted" style="margin-bottom:6px">${(x.atributos || []).length} atributos · ${(x.panelistas || []).length} panelistas ·
        respuestas <b>${hechas}</b> de ${x.nMuestras || '?'} · terminaron <b>${terminados}</b> de ${(x.panelistas || []).length}
        ${usuario.rol === 'super' && x.dueno !== usuario.email ? ` · de ${esc(x.dueno)}` : ''}</p>
      <div class="input-group input-group-sm" style="max-width:560px;margin-bottom:6px">
        <input type="text" class="form-control link-panel" readonly value="${esc(linkPanel(x.id))}"/>
        <span class="input-group-btn"><button class="btn btn-default" data-a="copiar" type="button">Copiar link</button></span>
      </div>
      <div class="acciones">
        <a class="btn btn-primary btn-sm" href="${esc(linkTablero(x.id))}" target="_blank" rel="noopener">Tablero</a>
        <button class="btn btn-default btn-sm" data-a="qr">QR</button>
        <button class="btn btn-default btn-sm" data-a="progreso">Progreso</button>
        <div class="btn-group">
          <button type="button" class="btn btn-default btn-sm dropdown-toggle" data-toggle="dropdown">Descargar <span class="caret"></span></button>
          <ul class="dropdown-menu">
            <li><a href="#" data-a="csv">CSV para R (coma)</a></li>
            <li><a href="#" data-a="csv-es">CSV para Excel (punto y coma)</a></li>
            <li><a href="#" data-a="answers">Carpeta Answers (.zip) para run_board()</a></li>
            <li><a href="#" data-a="diseno">Diseño con códigos (.csv)</a></li>
          </ul>
        </div>
        <button class="btn btn-default btn-sm" data-a="estado">${x.activo ? 'Cerrar' : 'Abrir'}</button>
        <button class="btn btn-default btn-sm" data-a="renombrar">Renombrar</button>
        <button class="btn btn-warning btn-sm" data-a="borrar-datos">Borrar respuestas</button>
        <button class="btn btn-danger btn-sm" data-a="borrar">Borrar panel</button>
      </div>
      <div class="progreso-caja" style="display:none"></div>
    </div>`;
  }
  const abiertosProg = new Set($l.find('.progreso-caja:visible').closest('.panel-fila').map((_, e) => e.dataset.id).get());
  $l.html(h);
  for (const id of abiertosProg) dibujarProgreso(id, true);
}

function dibujarProgreso(id, mostrar) {
  const x = paneles.find(p => p.id === id); if (!x) return;
  const $c = $(`.panel-fila[data-id="${id}"] .progreso-caja`);
  const pr = progresos[id] || {};
  const porV = x.nMuestras / (x.panelistas.length || 1);
  $c.html(`<br/><table class="table table-bordered table-condensed progreso-tabla" style="width:auto"><thead><tr><th>Panelista</th><th>Muestras</th></tr></thead><tbody>
    ${x.panelistas.map(v => { const n = (pr[v] || []).length; return `<tr><td>${esc(v)}</td><td class="${n >= porV ? 'ok' : ''}">${n} / ${porV}</td></tr>`; }).join('')}
    </tbody></table>`);
  if (mostrar) $c.show(); else $c.toggle();
}

function mostrarQR(id) {
  const x = paneles.find(p => p.id === id) || { nombre: '' };
  const l = linkPanel(id);
  const $b = $(`<div><h3 style="margin-top:0">${esc(x.nombre)}</h3><div id="qr-grande">${graficoQR(l, 420)}</div>
    <p class="link-panel" style="word-break:break-all">${esc(l)}</p>
    <button type="button" class="btn btn-default no-imprimir" id="qr-imprimir">Imprimir</button>
    <button type="button" class="btn btn-default no-imprimir" id="qr-cerrar">Cerrar</button></div>`);
  showModal({ title: '', body: $b, size: 'm' });
  $('#qr-cerrar').on('click', () => removeModal());
  $('#qr-imprimir').on('click', () => {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${esc(x.nombre)}</title></head><body style="font-family:Helvetica,Arial,sans-serif;text-align:center">
      <h1>${esc(x.nombre)}</h1>${graficoQR(l, 500)}<p style="font-family:monospace">${esc(l)}</p><script>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  });
}

async function datosPanel(id) {
  const x = paneles.find(p => p.id === id);
  const [priv, resp] = await Promise.all([D.disenoPrivado(id), D.leerRespuestas(id)]);
  return { x, priv, filas: tablaRespuestas(resp, priv, x.atributos) };
}
const nombreArchivo = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'panel';

$(document).on('click', '.panel-fila [data-a]', async function (ev) {
  ev.preventDefault();
  const id = $(this).closest('.panel-fila').data('id'), a = this.dataset.a;
  const x = paneles.find(p => p.id === id);
  try {
    if (a === 'copiar') {
      const t = linkPanel(id);
      try { await navigator.clipboard.writeText(t); } catch (e) { $(this).closest('.input-group').find('input').select(); document.execCommand('copy'); }
      showNotification('Link copiado.', 'message', 2500);
    } else if (a === 'qr') mostrarQR(id);
    else if (a === 'progreso') dibujarProgreso(id);
    else if (a === 'csv' || a === 'csv-es') {
      const { filas } = await datosPanel(id);
      filas.sort((p, q) => String(p.Producto).localeCompare(q.Producto) || String(p.Valuador).localeCompare(q.Valuador));
      const cols = ['Producto', 'Valuador', 'Muestra', 'CodigoProducto', 'CodigoMuestra', 'Orden', ...x.atributos.map(t => t.Nombre), 'Fecha'];
      const es = a === 'csv-es';
      descargar(`${nombreArchivo(x.nombre)}${es ? '_excel' : ''}.csv`, (es ? '﻿' : '') + aCSV(filas, cols, es ? { sep: ';', dec: ',' } : {}));
    } else if (a === 'answers') {
      const { filas, priv } = await datosPanel(id);
      const at = x.atributos.map(t => t.Nombre);
      const arch = filas.map(f => ({ nombre: `Answers/${f.Valuador}/${String(f.Producto).replace(/[\/\\]/g, '_')}.csv`, texto: aCSV([f], at) }));
      arch.push({ nombre: 'Answers/diseno.csv', texto: aCSV(priv, ['Valuador', 'Muestra', 'NombreProducto', 'CodigoProducto', 'CodigoMuestra']) });
      descargar(`${nombreArchivo(x.nombre)}_Answers.zip`, zip(arch));
    } else if (a === 'diseno') {
      const priv = await D.disenoPrivado(id);
      descargar(`${nombreArchivo(x.nombre)}_diseno.csv`, aCSV(priv, ['Valuador', 'Orden', 'Muestra', 'NombreProducto', 'CodigoProducto', 'CodigoMuestra']));
    } else if (a === 'estado') {
      await D.actualizarPanel(id, { activo: !x.activo });
    } else if (a === 'renombrar') {
      const n = prompt('Nuevo nombre del panel', x.nombre);
      if (n && n.trim()) await D.actualizarPanel(id, { nombre: n.trim() });
    } else if (a === 'borrar-datos') {
      if (prompt(`Se borran TODAS las respuestas de "${x.nombre}" (el diseño y el link se mantienen).\nEscriba BORRAR para confirmar.`) === 'BORRAR') {
        await D.borrarDatos(id); showNotification('Respuestas borradas.', 'message'); dibujarUso();
      }
    } else if (a === 'borrar') {
      if (prompt(`Se borra el panel "${x.nombre}" con todas sus respuestas.\nEscriba BORRAR para confirmar.`) === 'BORRAR') {
        if (oyentesProg[id]) { oyentesProg[id](); delete oyentesProg[id]; }
        await D.borrarPanel(id); showNotification('Panel borrado.', 'message'); dibujarUso();
      }
    }
  } catch (e) {
    console.error(e);
    showNotification('Error: ' + e.message, 'error', 0);
  }
});
