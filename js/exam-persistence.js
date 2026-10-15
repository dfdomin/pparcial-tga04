/* Serialized Supabase operations; a local journal is a recovery copy, never proof of delivery. */
(function (global) {
  'use strict';
  var PERIOD = '2026-3', documentId = null, revision = 0, serial = Promise.resolve(), pending = 0;
  function key(kind, doc) { return 'pparcial_' + kind + '_' + PERIOD + '_' + String(doc); }
  function token(doc) {
    var t = sessionStorage.getItem(key('token',doc));
    if (!t) { t = crypto.randomUUID(); sessionStorage.setItem(key('token',doc),t); }
    return t;
  }
  function journal(doc, value) {
    if (arguments.length === 1) {
      try { return JSON.parse(sessionStorage.getItem(key('recovery',doc)) || 'null'); } catch (_) { return null; }
    }
    if (value == null) sessionStorage.removeItem(key('recovery',doc));
    else sessionStorage.setItem(key('recovery',doc),JSON.stringify(value));
  }
  function rpc(name,args) {
    var timer;
    var request = Promise.resolve().then(function () {
      var c = global.getSupabase();
      if (!c || typeof c.rpc !== 'function') throw new Error('CONNECTION_UNAVAILABLE');
      return c.rpc(name,args);
    }).then(function (r) {
      if (!r || r.error) throw new Error(r && r.error && r.error.message || 'CONNECTION_UNAVAILABLE');
      var d = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!d || d.ok === false) throw new Error('SAVE_NOT_CONFIRMED');
      return d;
    });
    return Promise.race([request,new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error('CONNECTION_TIMEOUT')); },10000);
    })]).finally(function () { clearTimeout(timer); });
  }
  function args(doc) { return {p_documento:doc,p_periodo:PERIOD,p_session_token:token(doc)}; }
  function enqueue(work) {
    pending++;
    var result = serial.then(work);
    serial = result.catch(function () {}).then(function () { pending--; });
    return result;
  }
  function accept(d) { if (d.revision != null) revision = Number(d.revision); return d; }
  function begin(doc, nombre) {
    return enqueue(function () {
      return rpc('pparcial_begin_session',Object.assign(args(doc),{p_nombre:nombre || null,p_snapshot:{}})).then(function (d) { documentId = doc; return accept(d); });
    });
  }
  function mutate(name, value, payload) {
    return enqueue(function () {
      if (value.documento !== documentId) throw new Error('SESSION_INVALID');
      var a = Object.assign(args(documentId),payload());
      if (name === 'pparcial_save_snapshot' || name === 'pparcial_finalize_session') a.p_revision = revision;
      return rpc(name,a).then(accept);
    });
  }
  function snapshot(v) { return mutate('pparcial_save_snapshot',v,function(){return {p_snapshot:v.snapshot};}); }
  function answer(v) {
    return mutate('pparcial_append_answer',v,function(){return {p_event_id:v.eventId,p_pregunta_num:v.preguntaNum,p_correcta:v.correcta,p_puntos:v.correcta?1:0,p_intentos:v.intentos,p_codigo:v.codigo,p_snapshot:v.snapshot};});
  }
  function finalize(v) {
    return mutate('pparcial_finalize_session',v,function(){return {p_nota_final:null,p_respuestas:[],p_snapshot:{}};}).then(function(d){
      if(d.estado!=='finalizado' || typeof d.nota_final!=='number' || !Number.isFinite(d.nota_final)) throw new Error('SAVE_NOT_CONFIRMED');
      return d;
    });
  }
  function extension(v) { return mutate('pparcial_request_extension',v,function(){return {p_event_id:v.eventId};}); }
  global.ExamPersistence={PERIOD:PERIOD,token:token,journal:journal,begin:begin,snapshot:snapshot,answer:answer,finalize:finalize,extension:extension,flush:function(){return serial;},pending:function(){return pending;}};
})(window);
