// @ts-check
const { test, expect } = require('@playwright/test');

async function login(page) {
  await page.goto('/admin.html');
  await page.evaluate(() => sessionStorage.removeItem('admin_pparcial'));
  await page.locator('#passInput').fill('sasadfgh2019');
  await page.click('button:has-text("Ingresar")');
  await expect(page.locator('#adminPanel')).toBeVisible({ timeout: 5000 });
}

test.describe('Admin — Login', () => {
  test('muestra pantalla de login al entrar', async ({ page }) => {
    await page.goto('/admin.html');
    await page.evaluate(() => sessionStorage.removeItem('admin_pparcial'));
    await expect(page.locator('#loginScreen')).toBeVisible();
    await expect(page.locator('#passInput')).toBeVisible();
  });

  test('contraseña incorrecta muestra error', async ({ page }) => {
    await page.goto('/admin.html');
    await page.evaluate(() => sessionStorage.removeItem('admin_pparcial'));
    await page.locator('#passInput').fill('wrong');
    await page.click('button:has-text("Ingresar")');
    await expect(page.locator('#loginMsg')).toContainText('incorrecta');
  });

  test('contraseña correcta muestra el panel', async ({ page }) => {
    await login(page);
  });
});

test.describe('Admin — Estructura', () => {
  test('muestra header y 4 pestañas', async ({ page }) => {
    await login(page);
    await expect(page.locator('header h1')).toContainText('PParcial');
    await expect(page.locator('button:has-text("Dashboard")')).toBeVisible();
    await expect(page.locator('button:has-text("Importar PDF")')).toBeVisible();
    await expect(page.locator('button:has-text("Estudiantes")')).toBeVisible();
    await expect(page.locator('button:has-text("Entregas")')).toBeVisible();
  });

  test('dashboard es la pestaña activa por defecto', async ({ page }) => {
    await login(page);
    await expect(page.locator('#tab-dashboard')).toHaveClass(/active/);
  });
});

test.describe('Admin — Cambio de pestañas', () => {
  test('al hacer clic en Importar PDF, se activa esa pestaña', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Importar PDF")');
    await expect(page.locator('button:has-text("Importar PDF")')).toHaveClass(/active/);
    await expect(page.locator('#tab-importar')).toHaveClass(/active/);
    await expect(page.locator('#dropZone')).toBeVisible();
    await expect(page.locator('#dropZone')).toContainText('Arrastra');
  });

  test('al hacer clic en Estudiantes, se activa esa pestaña', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Estudiantes")');
    await expect(page.locator('button:has-text("Estudiantes")')).toHaveClass(/active/);
    await expect(page.locator('#tab-estudiantes')).toHaveClass(/active/);
  });

  test('al hacer clic en Entregas, se activa esa pestaña', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Entregas")');
    await expect(page.locator('button:has-text("Entregas")')).toHaveClass(/active/);
    await expect(page.locator('#tab-entregas')).toHaveClass(/active/);
  });

  test('se puede volver al Dashboard después de cambiar', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Importar PDF")');
    await page.click('button:has-text("Dashboard")');
    await expect(page.locator('button:has-text("Dashboard")')).toHaveClass(/active/);
    await expect(page.locator('#tab-dashboard')).toHaveClass(/active/);
  });
});

test.describe('Admin — Formulario manual', () => {
  test('llenar formulario manual: campos aceptan valores', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Importar PDF")');
    
    await page.locator('#manDoc').fill('99999');
    await page.locator('#manNombre').fill('Test Student');
    await page.locator('#manGrupo').fill('7_GA_G1');
    
    await expect(page.locator('#manDoc')).toHaveValue('99999');
    await expect(page.locator('#manNombre')).toHaveValue('Test Student');
    await expect(page.locator('#manGrupo')).toHaveValue('7_GA_G1');
  });

  test('botón Agregar existe y es clickeable en pestaña Importar PDF', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Importar PDF")');
    await expect(page.locator('button:has-text("Agregar")')).toBeVisible();
  });
});

test.describe('Admin — Logout', () => {
  test('cerrar sesión vuelve a la pantalla de login', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Cerrar sesión")');
    await expect(page.locator('#loginScreen')).toBeVisible();
    await expect(page.locator('#adminPanel')).not.toBeVisible();
  });
});
