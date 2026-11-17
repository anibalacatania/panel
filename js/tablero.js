// =====================================================================
// Tablero: igual a run_board() de LibreSense-R (Datos, ACP, Cajas, Anova, Radar)
// =====================================================================
/* global $ */
import { esc, showNotification } from './shiny.js';
import { tablaRespuestas } from './archivos.js';
import { mediasAjustadas, acp, lsdBonferroni, mediana, niveles, ordenR } from './estadistica.js';
import { graficoCajas, graficoBarras, graficoACP, graficoRadar, graficoQR } from './graficos.js';

const params = new URLSearchParams(location.search);
const demo = params.has('demo');
const D = await import(demo ? './datos-falso.js' : './datos.js');
const pid = params.get('p');
const base = location.origin + location.pathname.replace(/tablero\.html$/, '');

let panel = null, privado = [], answers = [], numericas = [], rango = [0, 10], seleccion = null, cancelar = null;
const sel1 = $('#attribute_selector').selectize({})[0].selectize;
const sel2 = $('#attribute_selector_2').selectize({})[0].selectize;

await D.iniciar({ admin: true });

if (!pid) {
  $('#data').html('<p>Falta el panel en la dirección (tablero.html?p=…). Abra el tablero desde la página de administración.</p>');
} else {
  D.observarSesion(async u => {
    $('#sesion').html(u ? `<h6>${esc(u.email)}</h6>` : '');
    if (cancelar) { cancelar(); cancelar = null; }
    if (!u) {
      $('#data').html('<p>Para ver los resultados hay que entrar con una cuenta de administrador.</p><button type="button" class="btn btn-default" id="entrar">Entrar con Google</button>');
      $('#entrar').on('click', () => D.entrar().catch(e => showNotification(e.message, 'error')));
      return;
    }
    try {
      panel = await D.leerPanel(pid);
      if (!panel) { $('#data').html('<p>El panel no existe.</p>'); return; }
      document.title = panel.nombre;
      $('#nombre-panel').text(panel.nombre);
      rango = panel.rango || [0, 10];
      privado = await D.disenoPrivado(pid);
      numericas = panel.atributos.filter(a => String(a.Valores).split(/[:,]/)[0].trim() === 'Numeric').map(a => a.Nombre);
      dibujarQR();
      cancelar = D.observarRespuestas(pid, r => { answers = ordenar(tablaRespuestas(r, privado, panel.atributos)); programar(); },
        e => $('#data').html(`<p>No se pudieron leer las respuestas (${esc(e.message)}). ¿La cuenta es administradora de este panel?</p>`));
    } catch (e) {
      $('#data').html(`<p>No se pudo abrir el panel: ${esc(e.message)}</p>`);
    }
  });
}

// arrange(answers, Producto, Valuador)
const ordenar = f => f.sort((a, b) => ordenR(a.Producto, b.Producto) || ordenR(a.Valuador, b.Valuador));

let pendiente = null;
function programar() {
  if (pendiente) return;
  pendiente = setTimeout(() => { pendiente = null; dibujarTodo(); }, 400);
}

function ancho(id) { return Math.max(300, Math.floor($('#' + id).width() || $('.tab-content').width() || 800)); }

function dibujarQR() {
  const l = `${base}?p=${pid}${demo ? '&demo' : ''}`;
  const w = Math.max(80, Math.floor($('#qrcode').width() || 150));
  $('#qrcode').html(`<div style="height:400px;display:flex;align-items:center;justify-content:center">${graficoQR(l, w)}</div>`);
}

function dibujarTodo() {
  dibujarDatos();
  actualizarSelectores();
  const activa = $('.tab-pane.active').data('value');
  if (activa === 'ACP') dibujarACP();
  if (activa === 'Cajas') dibujarCajas();
  if (activa === 'Anova') dibujarAnova();
  if (activa === 'Radar') dibujarRadar();
}

// renderTable(answers()) : números con 2 decimales, alineados a la derecha
function dibujarDatos() {
  if (!answers.length) { $('#data').html(''); return; }
  const cols = ['Producto', 'Valuador', ...panel.atributos.map(a => a.Nombre)];
  const esNum = c => numericas.includes(c);
  const celda = (v, c) => {
    if (v === undefined || v === null || v === '') return 'NA';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (esNum(c) && typeof v === 'number') return v.toFixed(2);
    return esc(v);
  };
  $('#data').html(`<table class="table shiny-table table- spacing-s" style="width:auto;">
    <thead><tr>${cols.map(c => `<th style="text-align: ${esNum(c) ? 'right' : 'left'};">${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${answers.map(f => `<tr>${cols.map(c => `<td${esNum(c) ? ' style="text-align: right;"' : ''}>${celda(f[c], c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
}

function actualizarSelectores() {
  if (!answers.length || !numericas.length) return;
  const actual = seleccion && numericas.includes(seleccion) ? seleccion : numericas[0];
  for (const s of [sel1, sel2]) {
    const tiene = Object.keys(s.options);
    if (tiene.join('|') !== numericas.join('|')) {
      s.clearOptions();
      numericas.forEach(n => s.addOption({ value: n, text: n }));
      s.refreshOptions(false);
    }
    if (s.getValue() !== actual) s.setValue(actual, true);
  }
  seleccion = actual;
}
const alCambiar = (v, otro) => { if (!v) return; seleccion = v; if (otro.getValue() !== v) otro.setValue(v, true); dibujarCajas(); dibujarAnova(); };
sel1.on('change', v => alCambiar(v, sel2));
sel2.on('change', v => alCambiar(v, sel1));

const hay = () => answers.length > 0 && numericas.length > 0;
const variosProd = () => niveles(answers.map(a => a.Producto)).length > 1;
const variosVal = () => niveles(answers.map(a => a.Valuador)).length > 1;

function dibujarACP() {
  const $o = $('#answer_acp');
  if (!(hay() && variosProd() && variosVal() && numericas.length > 1)) { $o.html(''); return; }
  const ma = mediasAjustadas(answers, numericas);
  const r = acp(ma.productos, ma.adjmean, numericas);
  $o.html(graficoACP(r, ancho('answer_acp'), 400));
}
function dibujarCajas() {
  const $o = $('#answer_box');
  if (!hay() || !seleccion) { $o.html(''); return; }
  $o.html(graficoCajas(answers, seleccion, rango, ancho('answer_box'), 400));
}
function dibujarAnova() {
  const $o = $('#answer_anova');
  if (!(hay() && variosProd() && variosVal()) || !seleccion) { $o.html(''); return; }
  const r = lsdBonferroni(answers, seleccion);
  if (!(r.df > 0)) { $o.html(''); return; }
  $o.html(graficoBarras(r.grupos, rango, ancho('answer_anova'), 400));
}
function dibujarRadar() {
  const $o = $('#answers_radar');
  if (!hay()) { $o.html(''); return; }
  const prods = niveles(answers.map(a => a.Producto));
  const val = {};
  for (const n of numericas) val[n] = prods.map(p => mediana(answers.filter(a => a.Producto === p && typeof a[n] === 'number').map(a => a[n])));
  $o.html(graficoRadar(prods, numericas, val, rango, ancho('answers_radar'), 400));
}

$('a[data-toggle="tab"]').on('shown.bs.tab', () => dibujarTodo());
let rz = null;
$(window).on('resize', () => { clearTimeout(rz); rz = setTimeout(() => { dibujarQR(); dibujarTodo(); }, 250); });
// como el reactiveTimer de 15 s del tablero original (por si se corta la conexión en vivo)
setInterval(() => { if (answers.length) dibujarTodo(); }, 15000);
