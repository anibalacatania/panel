// =====================================================================
// Réplica de los componentes de Shiny que usa run_panel():
// showNotification, showModal/removeModal, sliderInput, checkboxInput, selectInput, selectizeInput
// (mismo HTML y mismas clases, con los mismos CSS/JS que trae Shiny)
// =====================================================================
/* global $ */
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let nNotif = 0;
export function showNotification(texto, type = 'default', duracion = 5000) {
  let panel = document.getElementById('shiny-notification-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'shiny-notification-panel';
    document.body.appendChild(panel);
  }
  const id = 'shiny-notification-' + (++nNotif);
  const $n = $(`<div id="${id}" class="shiny-notification${type !== 'default' ? ' shiny-notification-' + type : ''}">
    <div class="shiny-notification-close">&times;</div>
    <div class="shiny-notification-content">
      <div class="shiny-notification-content-text">${esc(texto)}</div>
      <div class="shiny-notification-content-action"></div>
    </div></div>`);
  $n.hide().appendTo(panel).fadeIn(250);
  const quitar = () => $n.fadeOut(250, () => { $n.remove(); if (!panel.children.length) panel.remove(); });
  $n.find('.shiny-notification-close').on('click', quitar);
  if (duracion) setTimeout(quitar, duracion);
}

// modalDialog(..., title, footer = NULL, size, align = "center"); easyClose = FALSE
export function showModal({ title = '', body = '', size = 'm', align = 'center' }) {
  removeModal(true);
  const tam = size === 's' ? ' modal-sm' : size === 'l' ? ' modal-lg' : '';
  const $w = $(`<div id="shiny-modal-wrapper"><div id="shiny-modal" class="modal fade" tabindex="-1" data-backdrop="static" data-keyboard="false">
    <div class="modal-dialog${tam}"><div class="modal-content">
      ${title ? `<div class="modal-header"><h4 class="modal-title">${esc(title)}</h4></div>` : ''}
      <div class="modal-body"${align ? ` align="${align}"` : ''}></div>
    </div></div></div></div>`);
  $w.find('.modal-body').append(body);
  $('body').append($w);
  $('#shiny-modal').modal({ backdrop: 'static', keyboard: false }).focus();
  return $w;
}
export function removeModal(inmediato = false) {
  const $m = $('#shiny-modal');
  if (!$m.length) return;
  const $w = $('#shiny-modal-wrapper');
  if (inmediato) {
    $m.removeClass('fade').modal('hide');
    $w.remove();
    $('.modal-backdrop').remove();
    $('body').removeClass('modal-open').css('padding-right', '');
    return;
  }
  $m.on('hidden.bs.modal', () => $w.remove());
  $m.modal('hide');
}

// sliderInput(id, label, min, max, value = 0, step, ticks = FALSE)
export function sliderInput(id, label, min, max, value, step) {
  const $c = $(`<div class="form-group shiny-input-container">
    <label class="control-label" id="${id}-label" for="${id}">${esc(label)}</label>
    <input class="js-range-slider" id="${id}" data-skin="shiny" data-min="${min}" data-max="${max}" data-from="${value}" data-step="${step}" data-grid="false" data-grid-num="10" data-grid-snap="false" data-prettify-separator="," data-prettify-enabled="true" data-keyboard="true" data-data-type="number"/>
  </div>`);
  const fmtNum = (n, sep) => {
    const p = String(n).split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    return p.join('.');
  };
  setTimeout(() => $c.find('input').ionRangeSlider({ prettify(n) { return fmtNum(n, this.prettify_separator); } }), 0);
  return {
    el: $c,
    valor: () => { const v = Number($c.find('input').data('ionRangeSlider')?.result.from ?? value); return Math.round(v * 1e6) / 1e6; },
    reset: () => $c.find('input').data('ionRangeSlider')?.update({ from: value }),
  };
}

export function checkboxInput(id, label) {
  const $c = $(`<div class="form-group shiny-input-container"><div class="checkbox"><label>
    <input id="${id}" type="checkbox" class="shiny-input-checkbox"/><span>${esc(label)}</span></label></div></div>`);
  return { el: $c, valor: () => $c.find('input').prop('checked'), reset: () => $c.find('input').prop('checked', false) };
}

// selectInput (selectize = TRUE)
export function selectInput(id, label, choices = [], { multiple = false, create = false } = {}) {
  const $c = $(`<div class="form-group shiny-input-container">
    <label class="control-label" id="${id}-label" for="${id}">${esc(label)}</label>
    <div><select id="${id}" class="shiny-input-select"${multiple ? ' multiple="multiple"' : ''}>${choices.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>
  </div>`);
  let sz = null;
  const iniciar = () => {
    if (sz) return sz;
    const $s = $c.find('select').selectize(multiple ? { create, persist: false, plugins: [] } : {});
    sz = $s[0].selectize;
    return sz;
  };
  return {
    el: $c,
    iniciar,
    valor: () => { const v = iniciar().getValue(); return Array.isArray(v) ? v : v; },
    reset: () => iniciar().clear(true),
  };
}
