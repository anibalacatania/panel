// =====================================================================
// Aplicación del panelista: igual a run_panel() de LibreSense-R
// =====================================================================
/* global $ */
import { showNotification, showModal, removeModal, sliderInput, checkboxInput, selectInput, esc } from './shiny.js';

const demo = new URLSearchParams(location.search).has('demo');
const D = await import(demo ? './datos-falso.js' : './datos.js');

const qs = () => Object.fromEntries(new URLSearchParams(location.search));
function updateQueryString(params) {
  const u = new URLSearchParams();
  if (demo) u.set('demo', '');
  for (const [k, v] of Object.entries(params)) u.set(k, v);
  const t = u.toString().replace(/=(&|$)/g, '$1');
  history.replaceState(null, document.title, location.pathname + (t ? '?' + t : ''));
}

let panel, diseno, pid, username = '', actual = null, finished = false, attrs = [], inputs = [];
const productSel = { el: $('#product').closest('.shiny-input-container'), sz: null };

function mensaje(titulo) {
  showModal({ title: titulo, size: 'l' });
}

async function elegirPanel() {
  const activos = await D.panelesActivos();
  if (!activos.length) { mensaje('No hay paneles abiertos en este momento.'); return null; }
  if (activos.length === 1) return activos[0].id;
  return new Promise(res => {
    const sel = selectInput('panel_sel', 'Panel', activos.map(a => a.nombre));
    const btn = $('<button id="submitPanel" type="button" class="btn btn-default action-button">Enviar</button>');
    showModal({ title: 'Bienvenida/o', body: [sel.el, btn], size: 's' });
    sel.iniciar();
    btn.on('click', () => {
      const a = activos.find(x => x.nombre === sel.valor());
      if (!a) return;
      removeModal(true);
      res(a.id);
    });
  });
}

// Pide el nombre del panelista (username_modal de run_panel).
function usernameModal(fixed) {
  let inp;
  if (fixed.length) inp = selectInput('username', 'Tu nombre (es tu identificador)', fixed);
  else {
    inp = { el: $(`<div class="form-group shiny-input-container"><label class="control-label" id="username-label" for="username">Tu nombre (es tu identificador)</label><input id="username" type="text" class="form-control" value=""/></div>`) };
    inp.valor = () => inp.el.find('input').val().trim();
  }
  const btn = $('<button id="submitName" type="button" class="btn btn-default action-button">Enviar</button>');
  showModal({ title: 'Bienvenida/o', body: [inp.el, btn], size: 's' });
  if (inp.iniciar) inp.iniciar();
  btn.on('click', async () => {
    const v = String(inp.valor() || '');
    if (!v.length) {
      showNotification('Ingrese su nombre.', 'error');
      return;
    }
    if (/[\/|]/.test(v) || v.length > 40) { showNotification('Ingrese su nombre.', 'error'); return; }
    removeModal();
    const hechos = await D.leerProgreso(pid, v);
    const mios = JSON.parse(localStorage.getItem('panel_nombres_' + pid) || '[]');
    if (hechos.length && !mios.includes(v)) {
      showNotification('El nombre ya había sido seleccionado, asegúrese que no esté repetido.', 'warning');
    }
    setUsername(v, hechos);
  });
}

function mezclar(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// Crea la interfaz de cada atributo (create_ui).
function crearAtributos() {
  const rango = panel.rango || [0, 10], paso = panel.paso ?? 0.01;
  const lista = panel.azar ? mezclar(panel.atributos) : panel.atributos;
  const $a = $('#attributes').empty();
  inputs = lista.map(at => {
    const i = panel.atributos.indexOf(at);
    const id = 'at' + i;
    const tipo = String(at.Valores || 'Numeric').split(/[:,]/)[0].trim();
    let c;
    if (tipo === 'Check') c = checkboxInput(id, at.Nombre);
    else if (tipo === 'Text') { c = selectInput(id, at.Nombre, [], { multiple: true, create: true }); }
    else c = sliderInput(id, at.Nombre, rango[0], rango[1], 0, paso);
    $a.append(c.el);
    if (c.iniciar) c.iniciar();
    return { at, tipo, c };
  });
}

function misMuestras() {
  return diseno.filter(f => f.Valuador === username).sort((a, b) => a.Orden - b.Orden);
}

function setUsername(v, hechos = []) {
  username = v;
  $('#panelist_name').val(v);
  try {
    const mios = JSON.parse(localStorage.getItem('panel_nombres_' + pid) || '[]');
    if (!mios.includes(v)) localStorage.setItem('panel_nombres_' + pid, JSON.stringify([...mios, v]));
  } catch (e) { /* sin almacenamiento */ }
  const mias = misMuestras();
  const sz = productSel.sz;
  sz.clearOptions();
  mias.forEach(m => sz.addOption({ value: m.Etiqueta, text: m.Etiqueta }));
  sz.refreshOptions(false);
  // producto: el del link, o el primero que falta responder
  const q = qs();
  let prod = mias.find(m => m.Etiqueta === q.product);
  if (!prod) prod = mias.find(m => !hechos.includes(m.Orden)) || null;
  if (!prod) { terminar(); return; }
  setProduct(prod);
}

function setProduct(m) {
  actual = m;
  updateQueryString({ p: pid, user: username, product: m.Etiqueta });
  productSel.sz.setValue(m.Etiqueta, true);
}

function terminar() {
  finished = true;
  updateQueryString({ p: pid, finished: '' });
  showModal({ title: 'Muchas gracias, ha finalizado la evaluación.', size: 'l' });
}

function enviar() {
  if (!username || !actual || finished) return;
  const valores = {};
  for (const { at, tipo, c } of inputs) {
    let v = c.valor();
    if (tipo === 'Text') v = (Array.isArray(v) ? v : [v]).filter(Boolean).join(', ');
    valores[at.Nombre] = v;
  }
  D.guardarRespuesta(pid, { Valuador: username, Orden: actual.Orden, Etiqueta: actual.Etiqueta, valores })
    .catch(e => { console.error(e); showNotification('No se pudo guardar. Avise al coordinador del panel.', 'error', 0); });
  const mias = misMuestras();
  const k = mias.findIndex(m => m.Orden === actual.Orden);
  if (k < mias.length - 1) {
    inputs.forEach(({ c }) => c.reset());
    setProduct(mias[k + 1]);
  } else {
    terminar();
  }
  window.scrollTo(0, 0);
  if (panel.azar && !finished) crearAtributos();
  showNotification('Valuación guardada', 'message');
}

async function main() {
  await D.iniciar();
  const q = qs();
  pid = q.p || await elegirPanel();
  if (!pid) return;
  panel = await D.leerPanel(pid);
  if (!panel) { mensaje('El panel no existe. Revise el link.'); return; }
  if (!panel.activo) { mensaje('El panel no está abierto en este momento.'); return; }
  diseno = await D.disenoPublico(pid);

  $('#product-label').text(panel.etiqueta || 'Copa');
  productSel.sz = $('#product').selectize({})[0].selectize;
  productSel.sz.disable();
  crearAtributos();
  $('#submit').on('click', enviar);

  if ('finished' in q) { finished = true; showModal({ title: 'Muchas gracias, ha finalizado la evaluación.', size: 'l' }); return; }
  const fixed = [...new Set(diseno.map(f => f.Valuador))];
  if (q.user && (fixed.includes(q.user))) {
    const hechos = await D.leerProgreso(pid, q.user);
    setUsername(q.user, hechos);
  } else {
    if (pid !== q.p) updateQueryString({ p: pid });
    usernameModal(fixed);
  }
}

main().catch(e => {
  console.error(e);
  showNotification('No se pudo conectar. Revise la conexión a internet y vuelva a cargar la página.', 'error', 0);
});

export { esc };
