// @ts-check
// Flujo del parcial con la interfaz real: Ejecutar, Enviar, intentos y avance.
const { test, expect } = require('@playwright/test');
const { startExam } = require('./helpers');

async function type(page, code) {
  await page.locator('#codeEditor').fill(code);
}
async function run(page) {
  await page.click('#btnRun');
  await expect(page.locator('#btnRun')).toBeEnabled();
}

function solutions(v, q9) {
  return [
    `empresa = "${v.empresa}"\nprint(empresa)`,
    'print("Empresa:", empresa)',
    `codigo = ${v.precio_a}\ncodigo_str = "${v.precio_a}"\nprint(type(codigo))\nprint(type(codigo_str))`,
    `ventas_enero = ${v.ventas_ene}\nventas_febrero = ${v.ventas_feb}\nprint(ventas_enero + ventas_febrero)`,
    'print(enero + febrero + marzo)',
    'print(total_trimestre / 3)',
    'print(max(enero, febrero, marzo))\nprint(min(enero, febrero, marzo))',
    `total_compra = ${v.total_compra}\npago_con = ${v.pago_con}\nprint(pago_con - total_compra)`,
    `abril = ${q9[0]}\nmayo = ${q9[1]}\njunio = ${q9[2]}\ntotal = abril + mayo + junio\nprint("Total:", total)\nprint("Promedio:", round(total / 3, 2))`,
  ];
}

test.describe('Flujo del parcial (interfaz)', () => {
  test('dos print() se ven en dos líneas en el panel de salida', async ({ page }) => {
    await startExam(page);
    await type(page, 'print(95)\nprint(40)');
    await run(page);
    await expect(page.locator('#outputPanel')).toHaveText('95\n40');
  });

  test('error en Ejecutar: mensaje en español con la línea y sin traceback interno', async ({ page }) => {
    await startExam(page);
    await type(page, 'empresa = "X"\nprint(Empresa)');
    await run(page);
    const out = page.locator('#outputPanel');
    await expect(out).toContainText('Error en la línea 2');
    await expect(out).toContainText('¿Quisiste decir empresa?');
    await expect(out).not.toContainText('_pyodide');
    await expect(out).not.toContainText('Traceback');
  });

  test('Ctrl+Enter ejecuta el código', async ({ page }) => {
    await startExam(page);
    await type(page, 'print("atajo")');
    await page.locator('#codeEditor').press('Control+Enter');
    await expect(page.locator('#outputPanel')).toHaveText('atajo');
  });

  test('enviar con error de Python NO gasta intento', async ({ page }) => {
    await startExam(page);
    await type(page, 'print("hola)');
    await run(page);
    await page.click('#btnSubmit');
    await expect(page.locator('#outputPanel')).toContainText('no cuenta como intento');
    await expect(page.locator('#retryCount')).toHaveText('0');
    await expect(page.locator('#qNum')).toHaveText('1');
  });

  test('enviar sin salida (sin print) NO gasta intento', async ({ page }) => {
    await startExam(page);
    const v = await page.evaluate(() => examVars);
    await type(page, `empresa = "${v.empresa}"`);
    await run(page);
    await page.click('#btnSubmit');
    await expect(page.locator('#outputPanel')).toContainText('no cuenta como intento');
    await expect(page.locator('#retryCount')).toHaveText('0');
  });

  test('respuesta incorrecta gasta un intento y da pista', async ({ page }) => {
    await startExam(page);
    await type(page, 'empresa = "Otra"\nprint(empresa)');
    await run(page);
    await page.click('#btnSubmit');
    await expect(page.locator('#outputPanel')).toContainText('Intento 2 de 7');
    await expect(page.locator('#outputPanel')).toContainText('💡');
    await expect(page.locator('#retryCount')).toHaveText('1');
  });

  test('doble clic en Enviar con respuesta correcta avanza UNA sola pregunta', async ({ page }) => {
    await startExam(page);
    const v = await page.evaluate(() => examVars);
    await type(page, `empresa = "${v.empresa}"\nprint(empresa)`);
    await run(page);
    await page.locator('#btnSubmit').dblclick({ force: true });
    await page.locator('#btnSubmit').click({ force: true }).catch(() => {});
    await expect(page.locator('#qNum')).toHaveText('2', { timeout: 5000 });
    await page.waitForTimeout(2500);
    await expect(page.locator('#qNum')).toHaveText('2');
    expect(await page.evaluate(() => state.respuestas.filter(Boolean).length)).toBe(1);
  });

  test('print = "..." en Q1 no rompe Q2', async ({ page }) => {
    await startExam(page);
    const v = await page.evaluate(() => examVars);
    await type(page, `print = "${v.empresa}"`);
    await run(page);
    await expect(page.locator('#outputPanel')).toContainText('sin el signo igual');
    await type(page, `empresa = "${v.empresa}"\nprint(empresa)`);
    await run(page);
    await page.click('#btnSubmit');
    await expect(page.locator('#qNum')).toHaveText('2', { timeout: 5000 });
    await type(page, 'print("Empresa:", empresa)');
    await run(page);
    await expect(page.locator('#outputPanel')).toContainText(v.empresa);
  });

  test('ciclo infinito: la página no se congela y se puede seguir', async ({ page }) => {
    await startExam(page);
    await type(page, 'while True:\n    pass');
    await run(page);
    await expect(page.locator('#outputPanel')).toContainText('tardó demasiado');
    await type(page, 'print("sigo vivo")');
    await run(page);
    await expect(page.locator('#outputPanel')).toHaveText('sigo vivo');
  });

  test('Saltar necesita confirmación con un segundo clic', async ({ page }) => {
    await startExam(page);
    await page.click('#btnSkip');
    await expect(page.locator('#btnSkip')).toContainText('¿Seguro?');
    await expect(page.locator('#qNum')).toHaveText('1');
    await page.click('#btnSkip');
    await expect(page.locator('#qNum')).toHaveText('2');
    await expect(page.locator('#btnSkip')).toHaveText('Saltar →');
  });

  test('cambiar de pestaña ANTES de iniciar no penaliza', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await page.evaluate(() => state.penalSalidas)).toBe(0);
  });

  test('parcial completo con las 9 respuestas correctas → 5.0', async ({ page }) => {
    test.setTimeout(120000);
    await startExam(page);
    const v = await page.evaluate(() => examVars);
    const q9 = await page.evaluate(() => [rng2(examVars, 55, 95), rng2(examVars, 50, 98), rng2(examVars, 40, 90)]);
    const sols = solutions(v, q9);
    for (let q = 1; q <= 9; q++) {
      await expect(page.locator('#qNum')).toHaveText(String(q), { timeout: 5000 });
      await type(page, sols[q - 1]);
      await run(page);
      await expect(page.locator('#outputPanel .err')).toHaveCount(0);
      await page.click('#btnSubmit');
      await expect(page.locator('#outputPanel')).toContainText('¡Correcto!');
    }
    await expect(page.locator('body')).toContainText('Parcial Finalizado', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('9/9');
    await expect(page.locator('body')).toContainText('5.0 / 5.0');
  });
});
