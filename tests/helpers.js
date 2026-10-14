// Utilidades compartidas por las pruebas del ejecutor de Python.
const fs = require('fs');
const path = require('path');

// Si PYODIDE_DIR apunta a una copia local de Pyodide 0.25.0 (npm i pyodide@0.25.0),
// se sirve desde disco en lugar del CDN (útil sin internet / en CI).
async function routePyodide(page) {
  const dir = process.env.PYODIDE_DIR;
  if (dir) {
    await page.route('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/**', async (route) => {
      const file = path.join(dir, new URL(route.request().url()).pathname.split('/').pop());
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      const ct = file.endsWith('.wasm') ? 'application/wasm'
        : file.endsWith('.js') ? 'application/javascript'
        : file.endsWith('.json') ? 'application/json' : 'application/octet-stream';
      route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': ct, 'access-control-allow-origin': '*' } });
    });
  }
  // Sin Supabase: la página entra en "modo local" y no escribe en la base real.
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/**', (route) =>
    route.fulfill({ status: 200, body: '/* supabase deshabilitado en pruebas */', headers: { 'content-type': 'application/javascript' } }));
}

async function startExam(page, doc = '1043123456') {
  await page.setViewportSize({ width: 1280, height: 800 });
  await routePyodide(page);
  await page.goto('/');
  await page.locator('#docInput').fill(doc);
  await page.click('#btnStart');
  await page.waitForFunction(() => state.examActive === true);
  await page.evaluate(() => initPy());
}

// Ejecuta código en la pregunta qNum sin tocar la interfaz y devuelve todo lo útil.
async function check(page, qNum, code) {
  return page.evaluate(async ({ qNum, code }) => {
    const res = await executeStudentCode(qNum, code);
    const txt = (res.stdout || '').trim();
    const verdict = gradeOutput(questions[qNum - 1], txt);
    return {
      stdout: res.stdout, error: res.error, autofix: res.autofix,
      ok: !res.error && verdict.ok,
      tip: res.error ? explainError(res.error) : '',
      hint: (!res.error && !verdict.ok && txt) ? wrongAnswerHint(questions[qNum - 1], verdict, txt, code) : '',
    };
  }, { qNum, code });
}

module.exports = { routePyodide, startExam, check };
