// Conexión con la app "panel": la administración abre esta app y le pasa la sesión del administrador
// (token de Firebase, válido 1 hora y renovado por la app) con postMessage.
// Solo se aceptan mensajes del sitio de la app; el aviso "listo" no lleva datos.
(function () {
  var ORIGENES = ['https://anibalacatania.github.io'].concat(window.PF_ORIGENES_EXTRA || []);
  var pendiente = null;
  function aShiny(d) {
    if (window.Shiny && Shiny.setInputValue) Shiny.setInputValue('fb', d, { priority: 'event' });
    else pendiente = d;
  }
  window.addEventListener('message', function (ev) {
    if (ORIGENES.indexOf(ev.origin) < 0) return;
    var d = ev.data || {};
    if (d.tipo !== 'pf-token' || !d.token || !d.eid || !d.proyecto) return;
    aShiny({ token: String(d.token), proyecto: String(d.proyecto), eid: String(d.eid), t: Date.now() });
  });
  function abridor() {
    try { return window.top.opener || window.opener; } catch (e) { return window.opener; }
  }
  $(document).on('shiny:connected', function () {
    if (pendiente) { Shiny.setInputValue('fb', pendiente, { priority: 'event' }); pendiente = null; }
    var o = abridor();
    if (o) o.postMessage({ tipo: 'pf-shiny-listo' }, '*');
    Shiny.setInputValue('hay_abridor', !!o);
  });
})();
