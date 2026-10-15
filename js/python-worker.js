/* Dedicated Pyodide worker. It deliberately has no DOM dependencies. */
(function () {
  'use strict';
  var pyodide = null;
  var ready = false;

  function send(type, extra) {
    var msg = extra || {};
    msg.type = type;
    self.postMessage(msg);
  }

  self.onmessage = async function (event) {
    var data = event.data || {};
    try {
      if (data.type === 'init') {
        ready = false;
        pyodide = null;
        importScripts(data.pyodideScript || 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js');
        if (typeof loadPyodide !== 'function') throw new Error('PYODIDE_SCRIPT_NO_CARGO');
        pyodide = await loadPyodide({ indexURL: data.indexURL || 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/' });
        pyodide.runPython(String(data.runnerSource || ''));
        ready = true;
        send('ready');
        return;
      }
      if (data.type === 'run') {
        if (!ready || !pyodide) throw new Error('PYODIDE_NOT_READY');
        var fn = pyodide.globals.get('__pp_run');
        try {
          var value = fn(String(data.base || ''), String(data.user || ''), 3.0);
          send('result', { requestId: data.requestId, value: String(value) });
        } finally {
          try { fn.destroy(); } catch (_) {}
        }
      }
    } catch (error) {
      send(data.type === 'run' ? 'runError' : 'initError', {
        requestId: data.requestId,
        message: error && error.message ? error.message : String(error),
        name: error && error.name ? error.name : 'Error',
        stack: error && error.stack ? error.stack : ''
      });
    }
  };
}());
