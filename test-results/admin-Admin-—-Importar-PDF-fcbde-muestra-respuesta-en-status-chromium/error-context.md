# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin.spec.js >> Admin — Importar PDF >> formulario manual: llenar y hacer clic muestra respuesta en status
- Location: tests/admin.spec.js:84:3

# Error details

```
TimeoutError: page.waitForFunction: Timeout 10000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - generic [ref=e4]:
      - heading "📋 Admin — PParcial 2026-2" [level=1] [ref=e5]
      - text: Fundamentos de Computación · IUB
    - button "Cerrar sesión" [ref=e6] [cursor=pointer]
  - generic [ref=e7]:
    - generic [ref=e8]:
      - button "📊 Dashboard" [ref=e9] [cursor=pointer]
      - button "📥 Importar PDF" [ref=e10] [cursor=pointer]
      - button "👥 Estudiantes" [ref=e11] [cursor=pointer]
      - button "📝 Entregas" [ref=e12] [cursor=pointer]
    - generic [ref=e13]:
      - generic [ref=e14]:
        - heading "📥 Importar estudiantes desde PDF Academusoft" [level=3] [ref=e15]
        - paragraph [ref=e16]: Arrastra uno o varios PDF exportados del sistema Academusoft. El sistema extraerá automáticamente documento, nombre, grupo y horario.
        - generic [ref=e17] [cursor=pointer]:
          - paragraph [ref=e18]: 📄 Arrastra aquí los archivos PDF
          - paragraph [ref=e19]: o haz clic para seleccionar
      - generic [ref=e20]:
        - heading "✏️ Agregar estudiante manual" [level=3] [ref=e21]
        - generic [ref=e22]:
          - generic [ref=e23]:
            - text: Documento
            - textbox [ref=e24]: "99999"
          - generic [ref=e25]:
            - text: Nombre completo
            - textbox [ref=e26]: Test Student
          - generic [ref=e27]:
            - text: Grupo
            - textbox "7_GA_G1" [ref=e28]
        - button "+ Agregar" [active] [ref=e29] [cursor=pointer]
```

# Test source

```ts
  1   | // @ts-check
  2   | const { test, expect } = require('@playwright/test');
  3   | 
  4   | async function login(page) {
  5   |   await page.goto('/admin.html');
  6   |   await page.evaluate(() => sessionStorage.removeItem('admin_pparcial'));
  7   |   await page.locator('#passInput').fill('sasadfgh2019');
  8   |   await page.click('button:has-text("Ingresar")');
  9   |   await expect(page.locator('#adminPanel')).toBeVisible({ timeout: 5000 });
  10  | }
  11  | 
  12  | test.describe('Admin — Login', () => {
  13  |   test('muestra pantalla de login al entrar', async ({ page }) => {
  14  |     await page.goto('/admin.html');
  15  |     await page.evaluate(() => sessionStorage.removeItem('admin_pparcial'));
  16  |     await expect(page.locator('#loginScreen')).toBeVisible();
  17  |     await expect(page.locator('#passInput')).toBeVisible();
  18  |   });
  19  | 
  20  |   test('contraseña incorrecta muestra error', async ({ page }) => {
  21  |     await page.goto('/admin.html');
  22  |     await page.evaluate(() => sessionStorage.removeItem('admin_pparcial'));
  23  |     await page.locator('#passInput').fill('wrong');
  24  |     await page.click('button:has-text("Ingresar")');
  25  |     await expect(page.locator('#loginMsg')).toContainText('incorrecta');
  26  |   });
  27  | 
  28  |   test('contraseña correcta muestra el panel', async ({ page }) => {
  29  |     await login(page);
  30  |   });
  31  | });
  32  | 
  33  | test.describe('Admin — Estructura', () => {
  34  |   test('muestra header y 4 pestañas', async ({ page }) => {
  35  |     await login(page);
  36  |     await expect(page.locator('header h1')).toContainText('PParcial');
  37  |     await expect(page.locator('button:has-text("Dashboard")')).toBeVisible();
  38  |     await expect(page.locator('button:has-text("Importar PDF")')).toBeVisible();
  39  |     await expect(page.locator('button:has-text("Estudiantes")')).toBeVisible();
  40  |     await expect(page.locator('button:has-text("Entregas")')).toBeVisible();
  41  |   });
  42  | 
  43  |   test('dashboard es la pestaña activa por defecto', async ({ page }) => {
  44  |     await login(page);
  45  |     await expect(page.locator('#tab-dashboard')).toHaveClass(/active/);
  46  |   });
  47  | });
  48  | 
  49  | test.describe('Admin — Cambio de pestañas', () => {
  50  |   test('al hacer clic en Importar PDF, se activa esa pestaña', async ({ page }) => {
  51  |     await login(page);
  52  |     await page.click('button:has-text("Importar PDF")');
  53  |     await expect(page.locator('button:has-text("Importar PDF")')).toHaveClass(/active/);
  54  |     await expect(page.locator('#tab-importar')).toHaveClass(/active/);
  55  |     await expect(page.locator('#dropZone')).toBeVisible();
  56  |     await expect(page.locator('#dropZone')).toContainText('Arrastra');
  57  |   });
  58  | 
  59  |   test('al hacer clic en Estudiantes, se activa esa pestaña', async ({ page }) => {
  60  |     await login(page);
  61  |     await page.click('button:has-text("Estudiantes")');
  62  |     await expect(page.locator('button:has-text("Estudiantes")')).toHaveClass(/active/);
  63  |     await expect(page.locator('#tab-estudiantes')).toHaveClass(/active/);
  64  |     await expect(page.locator('button:has-text("Exportar Excel")')).toBeVisible();
  65  |   });
  66  | 
  67  |   test('al hacer clic en Entregas, se activa esa pestaña', async ({ page }) => {
  68  |     await login(page);
  69  |     await page.click('button:has-text("Entregas")');
  70  |     await expect(page.locator('button:has-text("Entregas")')).toHaveClass(/active/);
  71  |     await expect(page.locator('#tab-entregas')).toHaveClass(/active/);
  72  |   });
  73  | 
  74  |   test('se puede volver al Dashboard después de cambiar', async ({ page }) => {
  75  |     await login(page);
  76  |     await page.click('button:has-text("Importar PDF")');
  77  |     await page.click('button:has-text("Dashboard")');
  78  |     await expect(page.locator('button:has-text("Dashboard")')).toHaveClass(/active/);
  79  |     await expect(page.locator('#tab-dashboard')).toHaveClass(/active/);
  80  |   });
  81  | });
  82  | 
  83  | test.describe('Admin — Importar PDF', () => {
  84  |   test('formulario manual: llenar y hacer clic muestra respuesta en status', async ({ page }) => {
  85  |     await login(page);
  86  |     await page.click('button:has-text("Importar PDF")');
  87  |     
  88  |     await page.locator('#manDoc').fill('99999');
  89  |     await page.locator('#manNombre').fill('Test Student');
  90  |     await page.locator('#manGrupo').fill('7_GA_G1');
  91  |     await page.click('button:has-text("Agregar")');
  92  |     
  93  |     // El status debe mostrar algún mensaje (éxito o error de conexión)
> 94  |     await page.waitForFunction(() => {
      |                ^ TimeoutError: page.waitForFunction: Timeout 10000ms exceeded.
  95  |       var el = document.getElementById('manualStatus');
  96  |       return el && el.textContent.trim().length > 0;
  97  |     }, { timeout: 5000 });
  98  |     
  99  |     const status = await page.locator('#manualStatus').textContent();
  100 |     expect(status).toBeTruthy();
  101 |     expect(status.length).toBeGreaterThan(0);
  102 |   });
  103 | });
  104 | 
  105 | test.describe('Admin — Logout', () => {
  106 |   test('cerrar sesión vuelve a la pantalla de login', async ({ page }) => {
  107 |     await login(page);
  108 |     await page.click('button:has-text("Cerrar sesión")');
  109 |     await expect(page.locator('#loginScreen')).toBeVisible();
  110 |     await expect(page.locator('#adminPanel')).not.toBeVisible();
  111 |   });
  112 | });
  113 | 
```