// Medidas de integridad (js/exam-integrity.js): pegar, copiar, foco, celular y marca de agua.
const { test, expect, devices } = require('@playwright/test');
const { startExam } = require('./helpers');
const integ = (page) => page.evaluate(() => ({ penal: state.penalSalidas, ...state.integridad }));

test('pegar se bloquea y resta −0.1; copiar se bloquea y solo se registra; llega al servidor', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const backend = await startExam(page);
  await page.evaluate(() => navigator.clipboard.writeText('print("pegado")'));
  await page.click('#codeEditor');
  await page.keyboard.type('a = 1');
  await page.keyboard.press('Control+V');
  await expect(page.locator('#codeEditor')).toHaveValue('a = 1');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+C');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('print("pegado")');
  expect(await integ(page)).toMatchObject({ penal: 1, pegar: 1, copiar: 1 });
  await expect(page.locator('#integrityWarning')).toContainText('Pegar');
  await page.waitForTimeout(800);
  const s = [...backend.sessions.values()][0];
  expect(s.snapshot.penalSalidas).toBe(1);
  expect(s.snapshot.integridad).toMatchObject({ pegar: 1, copiar: 1 });
});

test('perder el foco resta una vez por salida y la marca de agua muestra nombre y documento', async ({ page }) => {
  await startExam(page, '1043123456');
  const wm = await page.locator('#examWatermark').evaluate(el => decodeURIComponent(getComputedStyle(el).backgroundImage));
  expect(wm).toContain('Estudiante de prueba · 1043123456');
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('blur')); });
  expect(await integ(page)).toMatchObject({ penal: 1, foco: 1 });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await integ(page)).toMatchObject({ penal: 2, foco: 2 });
});

test.describe('celular', () => {
  const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
  test.use(pixel);
  test('se puede presentar y cambiar de app se penaliza', async ({ page }) => {
    await startExam(page);
    await expect(page.locator('#codeEditor')).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await integ(page)).toMatchObject({ penal: 1, pestana: 1 });
  });
});
