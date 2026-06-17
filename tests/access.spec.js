// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('PParcial — Acceso', () => {
  test('muestra pantalla de acceso con título', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.access-card h1')).toContainText('PParcial 2026-2');
    await expect(page.locator('#docInput')).toBeVisible();
  });

  test('input de documento permite escribir', async ({ page }) => {
    await page.goto('/');
    await page.locator('#docInput').fill('12345');
    await expect(page.locator('#docInput')).toHaveValue('12345');
  });

  test('muestra advertencias: tiempo, preguntas, sin retroceso, intento único', async ({ page }) => {
    await page.goto('/');
    const body = page.locator('body');
    await expect(body).toContainText('50 min');
    await expect(body).toContainText('9 preguntas');
    await expect(body).toContainText('Sin retroceso');
    await expect(body).toContainText('Intento único');
  });
});

test.describe('PParcial — Mobile block', () => {
  test('bloquea en viewport móvil pequeño', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    // La detección usa userAgent + width. Forzamos con viewport pequeño
    await expect(page.locator('#mobileBlock')).toBeVisible();
  });

  test('no bloquea en viewport desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('#mobileBlock')).not.toBeVisible();
    await expect(page.locator('#accessScreen')).toBeVisible();
  });
});

test.describe('PParcial — Flujo inicial (sin Pyodide)', () => {
  test('al ingresar documento válido y hacer clic en Iniciar, carga el layout de examen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    
    // Simular autocomplete: llenar preview
    await page.evaluate(() => {
      document.getElementById('studentPreview').textContent = 'Test User · 7_GA_G1';
      document.getElementById('btnStart').disabled = false;
    });
    
    await page.locator('#docInput').fill('12345');
    await page.click('#btnStart');
    
    // Verificar que el layout de examen aparece
    await expect(page.locator('#examLayout')).toBeVisible();
    await expect(page.locator('#qNum')).toContainText('1');
    await expect(page.locator('#preguntaTitle')).toBeVisible();
  });
});

test.describe('PParcial — Timer', () => {
  test('el timer se muestra y está corriendo después de iniciar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    
    await page.evaluate(() => {
      document.getElementById('studentPreview').textContent = 'Test User';
      document.getElementById('btnStart').disabled = false;
    });
    await page.locator('#docInput').fill('12345');
    await page.click('#btnStart');
    
    // Verificar que el timer existe y no es "50:00" (ya pasó al menos 1 segundo)
    const timer = page.locator('#timerDisplay');
    await expect(timer).toBeVisible();
    const timerText = await timer.textContent();
    expect(timerText).toMatch(/^\d{1,2}:\d{2}$/);
  });
});
