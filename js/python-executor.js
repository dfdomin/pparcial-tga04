/* Pyodide runs off the UI thread; one execution at a time, with an external watchdog. */
(function (root) {
  'use strict';
  var scriptURL = document.currentScript && document.currentScript.src || document.baseURI;
  var current = null, serial = Promise.resolve(), nextId = 0;
  function failure(message, name) { var e = new Error(message); e.name = name || '_PPWorkerError'; return e; }
  function stop(s, error) {
    if (!s || s.closed) return;
    s.closed = true;
    if (current === s) current = null;
    clearTimeout(s.loadTimer);
    if (s.rejectInit) s.rejectInit(error);
    if (s.pending) { clearTimeout(s.pending.timer); s.pending.reject(error); s.pending = null; }
    if (s.worker) s.worker.terminate();
  }
  function init(source) {
    if (current) return current.promise;
    var s = { worker: null, pending: null, closed: false, ready: false };
    s.promise = new Promise(function (resolve, reject) { s.resolveInit = resolve; s.rejectInit = reject; });
    current = s;
    try {
      s.worker = new Worker(new URL('python-worker.js', scriptURL).href);
      s.worker.onmessage = function (event) {
        if (s.closed) return;
        var m = event.data || {};
        if (m.type === 'ready') {
          clearTimeout(s.loadTimer); s.ready = true; s.resolveInit(); s.rejectInit = null; return;
        }
        if (m.type === 'initError') { stop(s, failure(m.message || 'No se pudo cargar Python.')); return; }
        var p = s.pending;
        if (!p || m.requestId !== p.id) return;
        if (m.type === 'runError') { stop(s, failure(m.message || 'El ejecutor necesita reiniciarse.')); return; }
        if (m.type !== 'result') return;
        try {
          var result = JSON.parse(m.value);
          if (!result || typeof result.stdout !== 'string' || !('error' in result)) throw new Error('Respuesta inválida del ejecutor.');
          clearTimeout(p.timer); s.pending = null; p.resolve(result);
        } catch (e) { stop(s, failure(e.message, '_PPWorkerMessageError')); }
      };
      s.worker.onerror = function (e) { stop(s, failure(e.message || 'No se pudo cargar Python.')); };
      s.worker.onmessageerror = function () { stop(s, failure('No se pudo leer la respuesta de Python.', '_PPWorkerMessageError')); };
      // This is a network/loading limit, separate from the student's 3-second execution limit.
      s.loadTimer = setTimeout(function () { stop(s, failure('La descarga de Python tardó demasiado. Revisa tu conexión y vuelve a ejecutar.')); }, 45000);
      s.worker.postMessage({ type: 'init', runnerSource: String(source || '') });
    } catch (e) { stop(s, failure(e.message)); }
    return s.promise;
  }
  function execute(base, user, source) {
    return init(source).then(function () {
      var s = current;
      if (!s || s.closed || !s.ready) throw failure('El ejecutor se reinició. Vuelve a ejecutar.');
      return new Promise(function (resolve, reject) {
        var id = ++nextId;
        s.pending = { id: id, resolve: resolve, reject: reject, timer: setTimeout(function () {
          stop(s, failure('Tu código tardó más de 3 segundos y se detuvo. Puedes corregirlo y volver a ejecutar.', '_PPTimeout'));
        }, 3000) };
        try { s.worker.postMessage({ type: 'run', requestId: id, base: String(base || ''), user: String(user || '') }); }
        catch (e) { stop(s, failure(e.message)); }
      });
    });
  }
  function run(base, user, source) {
    var result = serial.then(function () { return execute(base, user, source); });
    serial = result.catch(function () {});
    return result;
  }
  root.PPPython = { init: init, run: run, reset: function () { stop(current, failure('El ejecutor se reinició.', '_PPWorkerReset')); } };
})(window);
