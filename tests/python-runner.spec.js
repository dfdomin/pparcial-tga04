// @ts-check
// Pruebas del ejecutor de Python del parcial: soluciones de estudiantes correctas
// (en varios estilos), incorrectas y con errores típicos de principiante.
const { test, expect } = require('@playwright/test');
const { startExam, check } = require('./helpers');

test.describe.configure({ mode: 'serial' });

/** @type {import('@playwright/test').Page} */
let page;
let v; // valores aleatorios del estudiante de prueba
let q9; // abril, mayo, junio

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const dots = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // 45000 -> 45.000
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); // 45000 -> 45,000

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await startExam(page);
  v = await page.evaluate(() => examVars);
  q9 = await page.evaluate(() => [rng2(examVars, 55, 95), rng2(examVars, 50, 98), rng2(examVars, 40, 90)]);
});
test.afterAll(async () => { await page.close(); });

async function expectOk(q, code) {
  const r = await check(page, q, code);
  expect(r.error, `Error inesperado en Q${q}:\n${code}\n${JSON.stringify(r.error)}`).toBeNull();
  expect(r.ok, `Q${q} debería ser CORRECTA:\n${code}\nSalida: ${r.stdout}`).toBe(true);
  return r;
}
async function expectWrong(q, code, hintRe) {
  const r = await check(page, q, code);
  expect(r.error, `Error inesperado en Q${q}:\n${code}\n${JSON.stringify(r.error)}`).toBeNull();
  expect(r.ok, `Q${q} debería ser INCORRECTA:\n${code}\nSalida: ${r.stdout}`).toBe(false);
  if (hintRe) expect(r.hint).toMatch(hintRe);
  return r;
}
async function expectError(q, code, { type, line, tip } = {}) {
  const r = await check(page, q, code);
  expect(r.error, `Q${q} debería dar error:\n${code}\nSalida: ${r.stdout}`).not.toBeNull();
  if (type) expect(r.error.type).toBe(type);
  if (line !== undefined) expect(r.error.line).toBe(line);
  if (tip) expect(r.tip).toMatch(tip);
  expect(r.tip, 'todo error común debe tener una explicación en español').not.toBe('');
  return r;
}

// ─────────────────────────────────────────────
test.describe('Intérprete: aislamiento y salida', () => {
  test('dos print() salen en líneas separadas (antes se pegaban: 9540)', async () => {
    const r = await check(page, 1, 'print(95)\nprint(40)');
    expect(r.stdout).toBe('95\n40\n');
  });

  test('print = ... no daña las ejecuciones siguientes', async () => {
    const r1 = await check(page, 1, `print = "${v.empresa}"`);
    expect(r1.error).toBeNull();
    expect(r1.stdout).toBe('');
    await expectOk(1, `empresa = "${v.empresa}"\nprint(empresa)`);
    await expectOk(2, 'print("Empresa:", empresa)');
  });

  test('max = ... en una pregunta no afecta la siguiente', async () => {
    await check(page, 7, 'max = 3');
    await expectOk(7, 'print(max(enero, febrero, marzo))\nprint(min(enero, febrero, marzo))');
  });

  test('las variables de una ejecución no aparecen en otra', async () => {
    await check(page, 4, 'secreto = 123\nprint(secreto)');
    await expectError(5, 'print(secreto)', { type: 'NameError', line: 1 });
  });

  test('el número de línea es el del editor del estudiante (no cuenta el código base)', async () => {
    await expectError(5, 'x = 1\ny = 2\nprint(z)', { type: 'NameError', line: 3 });
    await expectError(6, 'a = 1\nb = (2\nc = 3', { type: 'SyntaxError', line: 2 });
  });

  test('muestra la salida parcial antes del error', async () => {
    const r = await check(page, 4, 'print("hola")\nprint(1/0)');
    expect(r.stdout).toBe('hola\n');
    expect(r.error.type).toBe('ZeroDivisionError');
    expect(r.error.line).toBe(2);
  });

  test('ciclo infinito se detiene con mensaje y Python sigue funcionando', async () => {
    const t0 = Date.now();
    await expectError(1, 'x = 0\nwhile True:\n    x = x + 1', { type: '_PPTimeout', tip: /tardó demasiado/ });
    expect(Date.now() - t0).toBeLessThan(10000);
    await expectOk(1, `print("${v.empresa}")`);
  });

  test('ciclo infinito con print se detiene por exceso de salida', async () => {
    await expectError(1, 'while True:\n    print("hola")', { tip: /demasiado texto|tardó demasiado/ });
    await expectOk(1, `print("${v.empresa}")`);
  });

  test('recursión infinita no rompe Python', async () => {
    await expectError(1, 'def f():\n    return f()\nf()', { type: 'RecursionError' });
    await expectOk(1, `print("${v.empresa}")`);
  });

  test('input() da un mensaje claro en vez de abrir una ventana', async () => {
    await expectError(8, 'total_compra = input("Total: ")', { type: '_PPInputUsed', tip: /no se usa/ });
  });

  test('exit() no rompe nada y conserva la salida', async () => {
    const r = await check(page, 1, `print("${v.empresa}")\nexit()\nprint("no")`);
    expect(r.error).toBeNull();
    expect(r.stdout.trim()).toBe(v.empresa);
  });

  test('Python sigue funcionando después de todos los errores anteriores', async () => {
    await expectOk(4, `ventas_enero = ${v.ventas_ene}\nventas_febrero = ${v.ventas_feb}\nprint(ventas_enero + ventas_febrero)`);
  });
});

// ─────────────────────────────────────────────
test.describe('Corrección automática de texto copiado', () => {
  test('comillas tipográficas “ ” (Word / WhatsApp)', async () => {
    const r = await expectOk(1, `empresa = “${v.empresa}”\nprint(empresa)`);
    expect(r.autofix).toBe(true);
  });
  test("comillas simples tipográficas ‘ ’", async () => {
    await expectOk(1, `empresa = ‘${v.empresa}’\nprint(empresa)`);
  });
  test('guion largo – en una resta', async () => {
    await expectOk(8, `total_compra = ${v.total_compra}\npago_con = ${v.pago_con}\nvuelto = pago_con – total_compra\nprint(vuelto)`);
  });
  test('espacios invisibles (no-break space)', async () => {
    await expectOk(4, `ventas_enero = ${v.ventas_ene} \nventas_febrero = ${v.ventas_feb}\nprint(ventas_enero + ventas_febrero)`);
  });
  test('todo el código con sangría (pegado desde otro lado)', async () => {
    await expectOk(1, `    empresa = "${v.empresa}"\n    print(empresa)`);
  });
  test('saltos de línea de Windows (\\r\\n)', async () => {
    await expectOk(1, `empresa = "${v.empresa}"\r\nprint(empresa)\r\n`);
  });
  test('comillas tipográficas dentro de un texto que sí compila se respetan', async () => {
    const r = await check(page, 1, `print("${v.empresa} “líder”")`);
    expect(r.autofix).toBe(false);
    expect(r.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────
test.describe('Q1 — Crear variable y mostrarla', () => {
  test('respuestas correctas en varios estilos', async () => {
    await expectOk(1, `empresa = "${v.empresa}"\nprint(empresa)`);
    await expectOk(1, `empresa = '${v.empresa}'\nprint(empresa)`);
    await expectOk(1, `empresa = "${v.empresa}"\nprint("La empresa es:", empresa)`);
    await expectOk(1, `empresa = "${strip(v.empresa)}"\nprint(empresa)`); // sin tildes
    await expectOk(1, `empresa="${v.empresa}"\n\n\nprint( empresa )\n\n`);
    await expectOk(1, `# mi respuesta\nempresa = "${v.empresa}"  # texto\nprint(empresa)`);
  });
  test('respuesta incorrecta da pista útil', async () => {
    await expectWrong(1, 'empresa = "Otra empresa"\nprint(empresa)', /exactamente/);
  });
  test('errores típicos con explicación', async () => {
    await expectError(1, `empresa = "${v.empresa}\nprint(empresa)`, { type: 'SyntaxError', line: 1, tip: /cerrar unas comillas/ });
    await expectError(1, 'empresa = TecnoLogica\nprint(empresa)', { type: 'NameError', line: 1, tip: /entre comillas/ });
    await expectError(1, `empresa = "${v.empresa}"\nPrint(empresa)`, { type: 'NameError', line: 2, tip: /mayúsculas/ });
    await expectError(1, `empresa = "${v.empresa}"\nprint(Empresa)`, { type: 'NameError', line: 2, tip: /Quisiste decir <code>empresa/ });
    await expectError(1, `empresa = "${v.empresa}"\nprint empresa`, { type: 'SyntaxError', line: 2, tip: /lleva paréntesis/ });
    await expectError(1, `empresa = "${v.empresa}"\n  print(empresa)`, { type: 'IndentationError', line: 2, tip: /espacios al inicio/ });
    await expectError(1, `nombre empresa = "${v.empresa}"`, { type: 'SyntaxError', line: 1, tip: /sin espacios|no pueden tener espacios/ });
    await expectError(1, `empresa = "${v.empresa}"\nprint(empresa))`, { type: 'SyntaxError', line: 2, tip: /Sobra un paréntesis/ });
  });
  test('print = ... muestra aviso específico', async () => {
    const html = await page.evaluate(async (code) => {
      document.getElementById('codeEditor').value = code;
      return renderRunResult(await executeStudentCode(1, code));
    }, `empresa = "${v.empresa}"\nprint = empresa`);
    expect(html).toContain('print =');
    expect(html).toContain('sin el signo igual');
    await page.evaluate(() => { document.getElementById('codeEditor').value = ''; });
  });
});

test.describe('Q2 — Mensaje junto al valor', () => {
  test('respuestas correctas en varios estilos', async () => {
    await expectOk(2, 'print("Empresa: ", empresa)');
    await expectOk(2, 'print("Empresa:", empresa)');
    await expectOk(2, 'print("Empresa: " + empresa)');
    await expectOk(2, 'print(f"Empresa: {empresa}")');
    await expectOk(2, 'print("Empresa: {}".format(empresa))');
    await expectOk(2, `empresa = "${v.empresa}"\nprint("Empresa:", empresa)`);
  });
  test('variable entre comillas → incorrecta con pista', async () => {
    await expectWrong(2, 'print("Empresa: empresa")', /sin comillas/);
  });
  test('falta la coma', async () => {
    await expectError(2, 'print("Empresa: " empresa)', { type: 'SyntaxError', line: 1, tip: /coma/ });
  });
});

test.describe('Q3 — Número vs texto', () => {
  test('respuestas correctas', async () => {
    await expectOk(3, `codigo = ${v.precio_a}\ncodigo_str = "${v.precio_a}"\nprint(type(codigo))\nprint(type(codigo_str))`);
    await expectOk(3, `codigo = ${v.precio_a}\ncodigo_str = "${v.precio_a}"\nprint(type(codigo), type(codigo_str))`);
    await expectOk(3, `codigo = ${v.precio_a}\ncodigo_str = '${v.precio_a}'\nprint("codigo:", type(codigo))\nprint("codigo_str:", type(codigo_str))`);
  });
  test('solo muestra un tipo → incorrecta con pista del que falta', async () => {
    await expectWrong(3, `codigo = ${v.precio_a}\nprint(type(codigo))`, /codigo_str/);
    await expectWrong(3, `codigo = "${v.precio_a}"\ncodigo_str = "${v.precio_a}"\nprint(type(codigo))\nprint(type(codigo_str))`, /numérica/);
  });
  test('paréntesis sin cerrar', async () => {
    await expectError(3, `codigo = ${v.precio_a}\nprint(type(codigo)`, { type: 'SyntaxError', tip: /nunca cerraste/ });
  });
});

test.describe('Q4 — Suma de ventas', () => {
  const base = () => `ventas_enero = ${v.ventas_ene}\nventas_febrero = ${v.ventas_feb}\n`;
  test('respuestas correctas en varios estilos', async () => {
    await expectOk(4, base() + 'total_bimestre = ventas_enero + ventas_febrero\nprint(total_bimestre)');
    await expectOk(4, base() + 'print("Total:", ventas_enero + ventas_febrero)');
    await expectOk(4, base() + 'total = ventas_enero + ventas_febrero\nprint(f"Total bimestre: {total}")');
    await expectOk(4, base() + 'total = ventas_enero + ventas_febrero\nprint("Total: " + str(total))');
    await expectOk(4, base() + 'print(sum([ventas_enero, ventas_febrero]))');
    await expectOk(4, `ventas_enero, ventas_febrero = ${v.ventas_ene}, ${v.ventas_feb}\nprint(ventas_enero + ventas_febrero)`);
  });
  test('respuestas incorrectas', async () => {
    await expectWrong(4, `ventas_enero = "${v.ventas_ene}"\nventas_febrero = "${v.ventas_feb}"\nprint(ventas_enero + ventas_febrero)`); // concatena
    await expectWrong(4, base() + 'print("total")', /ningún número/);
    await expectWrong(4, base() + 'print(ventas_enero, ventas_febrero)');
    await expectWrong(4, base() + 'print(ventas_febrero - ventas_enero)');
  });
  test('errores típicos', async () => {
    await expectError(4, base() + 'total = ventas_enero + ventas_febrero\nprint("Total: " + total)', { type: 'TypeError', line: 4, tip: /coma/ });
    await expectError(4, `print(ventas_enero + ventas_febrero)\nventas_enero = ${v.ventas_ene}\nventas_febrero = ${v.ventas_feb}`, { type: 'NameError', line: 1, tip: /antes de crearla/ });
    await expectError(4, base() + 'print(total_bimestre)', { type: 'NameError', line: 3, tip: /no existe/ });
    await expectError(4, base() + 'print(total = ventas_enero + ventas_febrero)', { type: 'TypeError', tip: /no se crean variables/ });
    await expectError(4, `ventas enero = ${v.ventas_ene}`, { type: 'SyntaxError', tip: /espacios/ });
    await expectError(4, `1ventas = ${v.ventas_ene}`, { type: 'SyntaxError', tip: /no puede empezar con un número/ });
    await expectError(4, `ventas_enero = ${v.ventas_ene}\nventas_febrero = "${v.ventas_feb}"\nprint(ventas_enero + ventas_febrero)`, { type: 'TypeError', tip: /entre comillas/ });
  });
});

test.describe('Q5 — Suma de tres meses', () => {
  test('respuestas correctas', async () => {
    await expectOk(5, 'total_trimestre = enero + febrero + marzo\nprint(total_trimestre)');
    await expectOk(5, 'print(sum([enero, febrero, marzo]))');
    await expectOk(5, 'print("Total del trimestre:", enero + febrero + marzo)');
    await expectOk(5, `enero = ${v.ventas_ene}\nfebrero = ${v.ventas_feb}\nmarzo = ${v.ventas_mar}\nprint(enero + febrero + marzo)`);
  });
  test('respuestas incorrectas', async () => {
    await expectWrong(5, 'print(enero + febrero)');
    await expectWrong(5, 'print(enero, febrero, marzo)');
  });
  test('variable mal escrita sugiere la correcta', async () => {
    await expectError(5, 'print(Enero + febrero + marzo)', { type: 'NameError', tip: /Quisiste decir <code>enero/ });
    await expectError(5, 'print(enero + febreo + marzo)', { type: 'NameError', tip: /Quisiste decir <code>febrero/ });
  });
});

test.describe('Q6 — Promedio', () => {
  test('respuestas correctas (sin redondear, round 2 y 1 decimal, f-string)', async () => {
    await expectOk(6, 'promedio = total_trimestre / 3\nprint(promedio)');
    await expectOk(6, 'print((enero + febrero + marzo) / 3)');
    await expectOk(6, 'promedio = total_trimestre / 3\nprint(round(promedio, 2))');
    await expectOk(6, 'promedio = total_trimestre / 3\nprint(round(promedio, 1))');
    await expectOk(6, 'promedio = total_trimestre / 3\nprint(f"Promedio: {promedio:.2f}")');
    await expectOk(6, 'import statistics\nprint(statistics.mean([enero, febrero, marzo]))');
  });
  test('errores de precedencia o división entera → incorrecta', async () => {
    const exact = (v.ventas_ene + v.ventas_feb + v.ventas_mar) / 3;
    await expectWrong(6, 'promedio = enero + febrero + marzo / 3\nprint(promedio)');
    if (!Number.isInteger(exact)) await expectWrong(6, 'print(total_trimestre // 3)');
    await expectWrong(6, 'print(total_trimestre / 2)');
  });
  test('división entre cero', async () => {
    await expectError(6, 'print(total_trimestre / 0)', { type: 'ZeroDivisionError', line: 1, tip: /entre cero/ });
  });
});

test.describe('Q7 — Máximo y mínimo', () => {
  test('respuestas correctas', async () => {
    await expectOk(7, 'print(max(enero, febrero, marzo))\nprint(min(enero, febrero, marzo))');
    await expectOk(7, 'print("Mayor:", max(enero, febrero, marzo), "Menor:", min(enero, febrero, marzo))');
    await expectOk(7, 'mayor = max([enero, febrero, marzo])\nmenor = min([enero, febrero, marzo])\nprint(mayor, menor)');
    await expectOk(7, 'max = max(enero, febrero, marzo)\nmin = min(enero, febrero, marzo)\nprint(max)\nprint(min)');
  });
  test('falta el mínimo / el máximo → pista', async () => {
    const vals = [v.ventas_ene, v.ventas_feb, v.ventas_mar];
    if (Math.max(...vals) !== Math.min(...vals)) {
      await expectWrong(7, 'print(max(enero, febrero, marzo))', /menor/);
      await expectWrong(7, 'print(min(enero, febrero, marzo))', /mayor/);
    }
  });
  test('usar max como variable y luego como función', async () => {
    await expectError(7, 'max = max(enero, febrero, marzo)\nprint(max(enero, marzo))', { type: 'TypeError', line: 2, tip: /nombre de una función/ });
  });
  test('comparar texto con número', async () => {
    await expectError(7, 'print(max(enero, "febrero", marzo))', { type: 'TypeError', tip: /comparando/ });
  });
});

test.describe('Q8 — Vuelto', () => {
  const ok8 = () => `total_compra = ${v.total_compra}\npago_con = ${v.pago_con}\nvuelto = pago_con - total_compra\n`;
  test('respuestas correctas', async () => {
    await expectOk(8, ok8() + 'print(vuelto)');
    await expectOk(8, ok8() + 'print("Su vuelto es:", vuelto)');
    await expectOk(8, ok8() + 'print(f"Vuelto: ${vuelto:,}")'); // $55,000
    await expectOk(8, ok8() + 'print("Vuelto: $" + str(vuelto))');
    await expectOk(8, ok8() + 'print(f"Vuelto: {vuelto:,}".replace(",", "."))'); // 55.000
    await expectOk(8, `total_compra = ${v.total_compra}.0\npago_con = ${v.pago_con}.0\nprint(pago_con - total_compra)`);
  });
  test('números con punto de miles (45.000) → pista específica', async () => {
    await expectWrong(8, `total_compra = ${dots(v.total_compra)}\npago_con = ${dots(v.pago_con)}\nvuelto = pago_con - total_compra\nprint(vuelto)`, /sin puntos/);
  });
  test('números con coma de miles (45,000) → explicación', async () => {
    await expectError(8, `total_compra = ${commas(v.total_compra)}\npago_con = ${commas(v.pago_con)}\nvuelto = pago_con - total_compra\nprint(vuelto)`, { type: 'TypeError', line: 3, tip: /separador de miles/ });
  });
  test('resta invertida → incorrecta', async () => {
    await expectWrong(8, `total_compra = ${v.total_compra}\npago_con = ${v.pago_con}\nprint(total_compra - pago_con)`);
  });
  test('variable usada antes de crearla', async () => {
    await expectError(8, `vuelto = pago_con - total_compra\ntotal_compra = ${v.total_compra}\npago_con = ${v.pago_con}\nprint(vuelto)`, { type: 'NameError', line: 1, tip: /antes de crearla/ });
  });
});

test.describe('Q9 — Integrador', () => {
  const vars = () => `abril = ${q9[0]}\nmayo = ${q9[1]}\njunio = ${q9[2]}\n`;
  test('respuestas correctas en varios estilos', async () => {
    await expectOk(9, vars() + 'total_q2 = abril + mayo + junio\npromedio_q2 = total_q2 / 3\nprint("Total:", total_q2)\nprint("Promedio:", promedio_q2)');
    await expectOk(9, vars() + 'total = abril + mayo + junio\npromedio = total / 3\nprint("Total:", total, "— Promedio:", round(promedio, 2))');
    await expectOk(9, vars() + 'total = abril + mayo + junio\nprint(f"Total: {total} — Promedio: {total/3:.2f}")');
    await expectOk(9, vars() + 'total = abril + mayo + junio\nprint("total del trimestre:", total)\nprint("promedio mensual:", round(total / 3, 1))');
  });
  test('falta un mensaje o un valor → pista concreta', async () => {
    await expectWrong(9, vars() + 'total = abril + mayo + junio\nprint(total)\nprint("Promedio:", total / 3)', /Total/);
    await expectWrong(9, vars() + 'total = abril + mayo + junio\nprint("Total:", total)\nprint(total / 3)', /Promedio/);
    await expectWrong(9, vars() + 'total = abril + mayo + junio\nprint("Total")\nprint("Promedio:", total / 3)', /total no aparece/);
    await expectWrong(9, vars() + 'total = abril + mayo + junio\nprint("Total:", total)\nprint("Promedio:", total / 2)', /promedio no aparece/);
  });
});

// ─────────────────────────────────────────────
test.describe('Valores aleatorios: 300 estudiantes distintos', () => {
  test('la solución modelo es CORRECTA y una respuesta vacía de números es INCORRECTA para todos', async () => {
    const result = await page.evaluate(async () => {
      const saved = examVars;
      const fails = [];
      for (let k = 0; k < 300; k++) {
        const doc = String(1000000000 + k * 7919 + (k % 13) * 104729);
        examVars = generateExamVars(doc);
        const x = examVars;
        const [ab, my, jn] = [rng2(x, 55, 95), rng2(x, 50, 98), rng2(x, 40, 90)];
        const sols = [
          `empresa = "${x.empresa}"\nprint(empresa)`,
          'print("Empresa:", empresa)',
          `codigo = ${x.precio_a}\ncodigo_str = "${x.precio_a}"\nprint(type(codigo))\nprint(type(codigo_str))`,
          `ventas_enero = ${x.ventas_ene}\nventas_febrero = ${x.ventas_feb}\ntotal_bimestre = ventas_enero + ventas_febrero\nprint(total_bimestre)`,
          'total_trimestre = enero + febrero + marzo\nprint(total_trimestre)',
          'promedio = total_trimestre / 3\nprint(promedio)',
          'print(max(enero, febrero, marzo))\nprint(min(enero, febrero, marzo))',
          `total_compra = ${x.total_compra}\npago_con = ${x.pago_con}\nvuelto = pago_con - total_compra\nprint(vuelto)`,
          `abril = ${ab}\nmayo = ${my}\njunio = ${jn}\ntotal_q2 = abril + mayo + junio\npromedio_q2 = total_q2 / 3\nprint("Total:", total_q2, "— Promedio:", round(promedio_q2, 2))`,
        ];
        if (!(x.pago_con > x.total_compra)) fails.push(`${doc}: pago_con <= total_compra`);
        for (let q = 1; q <= 9; q++) {
          const res = await executeStudentCode(q, sols[q - 1]);
          if (res.error) { fails.push(`${doc} Q${q}: error ${res.error.type} ${res.error.msg}`); continue; }
          if (!gradeOutput(questions[q - 1], res.stdout.trim()).ok) fails.push(`${doc} Q${q}: modelo marcado incorrecto -> ${res.stdout}`);
          const bad = await executeStudentCode(q, 'print("respuesta: 1")');
          if (gradeOutput(questions[q - 1], bad.stdout.trim()).ok) fails.push(`${doc} Q${q}: respuesta basura marcada correcta`);
        }
      }
      examVars = saved;
      return fails;
    });
    expect(result).toEqual([]);
  });
});
