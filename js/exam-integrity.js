/* Medidas de integridad del parcial (compartidas por TGA04 y TGA05).
   Una página web NO puede impedir capturas de pantalla ni que el estudiante cambie de aplicación;
   lo que sí hace este módulo es dificultarlo, detectarlo y penalizarlo de forma consistente:
     · Pegar o arrastrar texto: bloqueado, −0.1 por intento.
     · Copiar / cortar / menú contextual / seleccionar el enunciado: bloqueado (se registra, sin penalización).
     · Perder el foco (otra app, otra ventana, otro monitor), ocultar la pestaña o salir de pantalla completa:
       −0.1 por salida. Varios eventos del mismo instante cuentan como UNA sola salida.
     · Pantalla completa + Keyboard Lock (Chrome/Edge en computador). En celulares sin pantalla completa
       (iPhone) no se exige; cambiar de aplicación se detecta igual.
     · Marca de agua con nombre y documento: una captura compartida identifica a quien la tomó. */
(function (root) {
  'use strict';
  var cfg = null, away = false, lastPenalty = 0, lastPaste = 0, installed = false, fsOverlay = null;
  var MERGE_MS = 1500;

  function active() { return !!(cfg && cfg.isActive()); }
  function fsSupported() { return !!(document.documentElement.requestFullscreen && document.fullscreenEnabled); }
  function isTouchDevice() { return (navigator.maxTouchPoints || 0) > 0 && matchMedia('(pointer: coarse)').matches; }

  function penalize(kind, text) {
    var now = Date.now();
    if (now - lastPenalty < MERGE_MS) return;          // mismo incidente detectado por varios eventos
    lastPenalty = now;
    cfg.penalize(kind, text);
  }

  // ── Salidas: foco, pestaña y pantalla completa ──────────────────────────
  function leave(kind, text) {
    if (!active() || away) return;
    away = true;
    penalize(kind, text);
  }
  function back() {
    if (!document.hidden && document.hasFocus()) away = false;
    if (active() && fsSupported() && !document.fullscreenElement && !isTouchDevice()) showFsOverlay();
  }

  function enterFullscreen() {
    if (!fsSupported()) return Promise.resolve(false);
    var p = document.fullscreenElement ? Promise.resolve() : document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return p.then(function () {
      // Chrome/Edge: en pantalla completa, Esc debe mantenerse presionado y se capturan atajos del navegador.
      if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock().catch(function () {});
      hideFsOverlay();
      return true;
    }).catch(function () { return false; });
  }
  function showFsOverlay() {
    if (!fsOverlay) {
      fsOverlay = document.createElement('div');
      fsOverlay.id = 'fsOverlay';
      fsOverlay.setAttribute('role', 'dialog');
      fsOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,8,18,.96);z-index:300;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:inherit';
      fsOverlay.innerHTML = '<div style="max-width:420px;color:#e2e8f0"><h2 style="color:#ef4444;margin-bottom:10px">Saliste de pantalla completa</h2>' +
        '<p style="font-size:.85rem;color:#94a3b8;margin-bottom:16px">El parcial continúa y el tiempo sigue corriendo. Vuelve a pantalla completa para seguir respondiendo.</p>' +
        '<button id="btnFsBack" style="padding:12px 20px;border:none;border-radius:10px;font-weight:700;background:#7c3aed;color:#fff;cursor:pointer">Volver a pantalla completa</button></div>';
      document.body.appendChild(fsOverlay);
      fsOverlay.querySelector('#btnFsBack').addEventListener('click', function () { enterFullscreen(); });
    }
    fsOverlay.style.display = 'flex';
  }
  function hideFsOverlay() { if (fsOverlay) fsOverlay.style.display = 'none'; }

  // ── Pegar, arrastrar, copiar ───────────────────────────────────────────
  function blockPaste(e) {
    if (!active()) return;
    e.preventDefault();
    var now = Date.now();
    if (now - lastPaste < 400) return;                  // paste + beforeinput del mismo intento
    lastPaste = now;
    // Cada intento de pegar cuenta por separado (no se fusiona con una salida de pantalla).
    cfg.penalize('pegar', 'Pegar o arrastrar texto no está permitido en el parcial. Penalización: −0.1 pts.');
  }
  function blockCopy(e) {
    if (!active()) return;
    e.preventDefault();
    cfg.log('copiar');
  }

  function watermark(text) {
    var old = document.getElementById('examWatermark');
    if (old) old.remove();
    if (!text) return;
    var safe = String(text).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220"><text x="20" y="130" transform="rotate(-24 210 110)" ' +
      'font-family="Arial,sans-serif" font-size="17" fill="#ffffff" fill-opacity="0.07">' + safe + '</text></svg>';
    var w = document.createElement('div');
    w.id = 'examWatermark';
    w.setAttribute('aria-hidden', 'true');
    w.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:150;background-repeat:repeat;' +
      'background-image:url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
    document.body.appendChild(w);
  }

  function install(options) {
    cfg = options;
    if (installed) return;
    installed = true;
    window.addEventListener('blur', function () { leave('foco', 'Cambiaste de aplicación o de ventana. Penalización: −0.1 pts.'); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) leave('pestana', 'Saliste de la página del parcial (otra pestaña o aplicación). Penalización: −0.1 pts.');
      else back();
    });
    window.addEventListener('focus', back);
    document.addEventListener('fullscreenchange', function () {
      if (!active()) return;
      if (document.fullscreenElement) { hideFsOverlay(); return; }
      if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
      if (!away) penalize('pantalla', 'Saliste de pantalla completa. Penalización: −0.1 pts.');
      showFsOverlay();
    });
    ['paste', 'drop'].forEach(function (t) { document.addEventListener(t, blockPaste, true); });
    document.addEventListener('dragover', function (e) { if (active()) e.preventDefault(); }, true);
    document.addEventListener('beforeinput', function (e) {
      if (/^insertFrom(Paste|Drop|PasteAsQuotation|Yank)/.test(e.inputType || '')) blockPaste(e);
    }, true);
    ['copy', 'cut'].forEach(function (t) { document.addEventListener(t, blockCopy, true); });
    document.addEventListener('contextmenu', function (e) { if (active()) e.preventDefault(); }, true);
    document.addEventListener('selectstart', function (e) {
      if (active() && !(e.target && e.target.closest && e.target.closest('textarea, input'))) e.preventDefault();
    }, true);
  }

  root.ExamIntegrity = { install: install, enterFullscreen: enterFullscreen, watermark: watermark, fullscreenSupported: fsSupported, isTouchDevice: isTouchDevice };
})(window);
