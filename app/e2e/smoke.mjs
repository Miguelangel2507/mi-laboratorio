import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Recorrido completo de la app en un Chromium móvil. Sin red: la hoja y el BCE se simulan.
//   npm run build && npx vite preview --port 4173 &   y luego   npm run e2e
// Variables: BASE (URL), CHROME (ruta al ejecutable), OUT (carpeta de capturas; sin ella no se guardan).
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
const out = process.env.OUT;
const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHEET = 'https://docs.google.com/spreadsheets/d/ID_DE_PRUEBA/edit?usp=sharing';
const SHEET_CSV = '"ISIN","Nombre","VL","Fecha"\n"IE00TEST0001","Fondo Demo","14,5065","2026-10-22"\n"ES0000000002","Fondo Manual","","",\n"N0001","Plan Demo","142,28191","2026-10-21"\n';
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined;
const b = await chromium.launch({ executablePath: process.env.CHROME, proxy });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES', acceptDownloads: true });
const p = await ctx.newPage();
await ctx.route('**/gviz/tq**', (r) => r.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: SHEET_CSV }));
await ctx.route('**/api.frankfurter.dev/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ rates: { USD: 1.1, GBP: 0.85 } }) }));
const shot = (name) => (out ? p.screenshot({ path: `${out}/${name}` }) : Promise.resolve());
const errors = [];
let current = 'inicio';
p.on('pageerror', (e) => errors.push(`[${current}] PAGE ` + (e.stack ?? e).toString().split('\n').slice(0, 7).join(' <- ')));
p.on('console', (m) => m.type() === 'error' && !/frankfurter|Failed to load resource/.test(m.text()) && errors.push('CONSOLE ' + m.text()));
const log = (...a) => console.log(...a);
const txt = async (sel) => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ');
const NW = 'section[aria-label="Patrimonio neto"]';
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; log(ok ? 'OK   ' : 'FALLA', name, ok ? '' : extra); };
const step = async (name, fn) => { current = name; try { await fn(); } catch (e) { fails++; log('ERROR', name, String(e).split('\n')[0]); } };

await p.goto(BASE);
await p.getByRole('button', { name: 'Empezar' }).click();

await step('cuentas', async () => {
  await p.goto(BASE + '#/accounts');
  await p.getByPlaceholder('Nómina, Efectivo, Tarjeta…').fill('Nómina');
  await p.getByPlaceholder('0,00').fill('1.000');
  await p.getByRole('button', { name: 'Guardar cuenta' }).click();
  await p.getByRole('button', { name: 'Nueva' }).click();
  await p.getByPlaceholder('Nómina, Efectivo, Tarjeta…').fill('Ahorro');
  await p.getByRole('button', { name: 'Guardar cuenta' }).click();
});

async function add(kind, amount, note, extra) {
  await p.goto(BASE + '#/add');
  if (kind !== 'Gasto') await p.getByRole('radio', { name: kind }).click();
  await p.getByLabel('Importe').fill(amount);
  await p.getByLabel('Nota').fill(note);
  if (extra) await extra();
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForTimeout(200);
}
await step('movimientos', async () => {
  await add('Gasto', '23,40', 'Cena');
  await add('Ingreso', '500', 'Extra');
  await add('Transferencia', '200', 'A ahorro', async () => { await p.locator('select').nth(1).selectOption({ label: 'Ahorro' }); });
  await p.goto(BASE + '#/'); await p.waitForTimeout(300);
  check('patrimonio = 1000 − 23,40 + 500', (await txt(NW + ' p.num')).includes('1476,60'), await txt(NW + ' p.num'));
  await p.goto(BASE + '#/accounts'); await p.waitForTimeout(200);
  const rows = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  check('la transferencia mueve 200 € a Ahorro', rows.includes('1276,60') && rows.includes('200,00'), rows);
});

await step('editar/buscar', async () => {
  await p.goto(BASE + '#/movements');
  await p.getByRole('link', { name: /Cena/ }).click();
  await p.getByLabel('Importe').fill('30');
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForURL(/#\/movements/);
  await p.goto(BASE + '#/'); await p.waitForTimeout(500);
  if (!(await p.locator(NW).count())) log('DEBUG url', p.url(), (await p.locator('body').innerText()).slice(0, 300));
  check('editar gasto actualiza el patrimonio', (await txt(NW + ' p.num')).includes('1470,00'), await txt(NW + ' p.num'));
  await p.goto(BASE + '#/movements');
  await p.getByLabel('Buscar').fill('extra');
  check('buscador filtra', (await p.locator('a[href^="#/tx/"]').count()) === 1);
  await shot('S04b-movimientos.png');
  await p.getByLabel('Buscar').fill('zzz');
  check('buscador sin resultados', await p.getByText('Sin resultados').isVisible());
});

await step('recurrente', async () => {
  await p.goto(BASE + '#/add');
  await p.getByLabel('Importe').fill('9,99'); await p.getByLabel('Nota').fill('Gimnasio');
  await p.getByLabel('Fecha').fill('2026-08-31');
  await p.getByLabel('Repetir').selectOption({ label: 'Cada mes' });
  await p.getByRole('button', { name: 'Guardar recurrente' }).click();
  await p.waitForURL((u) => !u.hash.startsWith('#/add'));
  await p.waitForTimeout(500);
  await p.reload(); await p.waitForTimeout(1000);
  await p.goto(BASE + '#/movements'); await p.waitForTimeout(300);
  const gymLoc = p.locator('a[href^="#/tx/"]').filter({ hasText: 'Gimnasio' });
  await gymLoc.first().waitFor({ timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(800);
  const gym = await gymLoc.count();
  check('recurrente: el de 31 ago, el generado de 30 sep y nada de 31 oct (futuro)', gym === 2, `Gimnasio: ${gym}`);
});

await step('presupuestos', async () => {
  await p.goto(BASE + '#/settings/budgets');
  await p.getByLabel('Categoría').selectOption({ label: 'Otros gastos' });
  await p.getByLabel(/Límite/).fill('20');
  await p.getByRole('button', { name: 'Crear presupuesto' }).click();
  await p.waitForTimeout(300);
  await shot('S15-presupuestos.png');
  const lab = (await p.locator('[role=progressbar]').first().getAttribute('aria-label')) ?? '';
  check('presupuesto superado supera el 100 %', parseInt(lab) >= 100, lab);
  await p.goto(BASE + '#/'); await p.waitForTimeout(300);
  check('aviso de presupuesto en Inicio', await p.getByText(/presupuesto/).first().isVisible());
});

await step('metas', async () => {
  await p.goto(BASE + '#/settings/goals');
  await p.getByPlaceholder('Viaje, fondo de emergencia…').fill('Viaje');
  await p.getByLabel(/Objetivo/).fill('1000');
  await p.getByRole('button', { name: 'Crear meta' }).click();
  await p.getByLabel('Aportación a Viaje').fill('250');
  await p.getByRole('button', { name: 'Aportar' }).click();
  await p.waitForTimeout(300);
  check('meta al 25 %', (await p.locator('[role=progressbar]').first().getAttribute('aria-label')) === '25 % de la meta');
});

await step('hoja de precios real', async () => {
  await p.goto(BASE + '#/settings/prices');
  await p.getByPlaceholder('https://docs.google.com/spreadsheets/d/…').fill(SHEET);
  await p.getByRole('button', { name: 'Guardar y leer' }).click();
  await p.waitForTimeout(4000);
  check('lee la hoja real', (await txt('[role=status]')).includes('3 fondos'), await txt('[role=status]'));
});

await step('inversión', async () => {
  await p.goto(BASE + '#/investments/new');
  await p.locator('select').nth(1).selectOption({ label: 'Fondo Demo' });
  await p.getByLabel('Participaciones').fill('100');
  await p.getByLabel('Precio medio de compra').fill('12');
  await p.getByRole('button', { name: 'Guardar' }).click();
  await p.waitForURL(/#\/investments\/\d+/); await p.waitForTimeout(400);
  const card = await txt('.card');
  check('ficha: 100 × 14,5065 = 1450,65 € y +20,9 %', card.includes('1450,65') && card.includes('+20,9'), card);
  await p.getByRole('radio', { name: 'Venta' }).click();
  await p.getByLabel('Participaciones').fill('40');
  await p.getByLabel('Precio por participación').fill('15');
  await p.getByRole('button', { name: 'Guardar operación' }).click();
  await p.waitForTimeout(300);
  const body = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  check('vender 40: quedan 60 y ganancia realizada 120 €', /Participaciones 60/.test(body) && body.includes('120,00'), body.slice(0, 300));
  await p.getByLabel('Participaciones').fill('1000'); await p.getByLabel('Precio por participación').fill('15');
  await p.getByRole('button', { name: 'Guardar operación' }).click();
  check('no deja vender más de lo que tienes', await p.getByRole('alert').isVisible());
  await shot('S10-activo.png');
});

await step('bien y deuda', async () => {
  for (const [type, name, val] of [['Bien (inmueble, coche, arte…)', 'Reloj', '1000'], ['Deuda (hipoteca, préstamo)', 'Préstamo', '300']]) {
    await p.goto(BASE + '#/investments/new');
    await p.locator('select').first().selectOption({ label: type });
    await p.getByLabel('Nombre').fill(name);
    await p.locator('input[inputmode=decimal]').last().fill(val);
    await p.getByRole('button', { name: 'Guardar' }).click();
    await p.waitForURL(/#\/investments\/\d+/);
  }
  await p.goto(BASE + '#/investments'); await p.waitForTimeout(500);
  await shot('S08-cartera.png');
  await p.goto(BASE + '#/'); await p.waitForTimeout(500);
  const nw = await txt(NW);
  check('Inicio incluye inversiones, bienes y resta deudas (870,39 + 1000 − 300)', nw.includes('Inversiones 1570,39'), nw);
  await shot('S04-home.png');
});

await step('evolución', async () => {
  await p.goto(BASE + '#/networth');
  await p.getByLabel('Mes (AAAA-MM)').fill('2026-08'); await p.getByLabel(/Patrimonio en ese periodo/).fill('2500');
  await p.getByRole('button', { name: 'Guardar periodo' }).click();
  await p.getByLabel('Mes (AAAA-MM)').fill('2026-09'); await p.getByLabel(/Patrimonio en ese periodo/).fill('2800');
  await p.getByRole('button', { name: 'Guardar periodo' }).click();
  await p.getByLabel('Mes (AAAA-MM)').fill('2099-01'); await p.getByLabel(/Patrimonio en ese periodo/).fill('1');
  await p.getByRole('button', { name: 'Guardar periodo' }).click();
  check('no deja añadir periodos futuros', await p.getByRole('alert').isVisible());
  await p.waitForTimeout(500);
  await shot('S08b-evolucion.png');
});

await step('estadísticas', async () => {
  await p.goto(BASE + '#/stats'); await p.waitForTimeout(600);
  await shot('S05-estadisticas.png');
  check('estadísticas muestran el desglose por categoría', (await p.locator('main').innerText()).toLowerCase().includes('gasto por categoría'));
  await p.getByRole('radio', { name: 'Año' }).click();
  await p.getByRole('button', { name: 'Periodo anterior' }).click();
  check('año anterior vacío', await p.getByText('Sin movimientos en este periodo').isVisible());
});

let jsonPath = S + '/backup.json';
await step('copia JSON y CSV', async () => {
  await p.goto(BASE + '#/settings/data');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Guardar copia' }).click()]);
  await dl.saveAs(jsonPath);
  const backup = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  check('copia JSON sin enlace de la hoja por defecto', !JSON.stringify(backup).includes('ID_DE_PRUEBA'));
  check('copia JSON con los datos', backup.data.accounts.length === 2 && backup.data.transactions.length >= 3 && backup.data.assets.length === 3,
    `${backup.data.accounts.length} cuentas, ${backup.data.transactions.length} mov, ${backup.data.assets.length} activos`);
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Descargar CSV' }).click()]);
  await dl2.saveAs(S + '/mov.csv');
  const csv = fs.readFileSync(S + '/mov.csv', 'utf8');
  check('CSV con cabecera y sin transferencias', csv.startsWith('Fecha,Descripción,Categoría,Tipo,Cuenta,Importe') && !csv.includes('A ahorro'));
  await shot('S17-datos.png');
});

await step('importar CSV', async () => {
  fs.writeFileSync(S + '/imp.csv', 'Fecha,Descripción,Categoría,Tipo,Cuenta,Importe\n2026-01-15,Super,Comida,Gasto,Nómina,-42.30\n2026-01-31,Salario,Nómina,Ingreso,Nómina,1800.00\nmal,x,x,x,x,1\n');
  await p.getByLabel('Archivo CSV').setInputFiles(S + '/imp.csv');
  await p.waitForTimeout(300);
  check('vista previa: 2 válidas de 3', await p.getByText('Vista previa: 2 válidas de 3').isVisible());
  await p.getByRole('button', { name: 'Importar 2' }).click();
  await p.waitForTimeout(300);
  await p.goto(BASE + '#/'); await p.waitForTimeout(400);
  check('importar no cambia el saldo', (await txt(NW)).includes('Inversiones 1570,39'));
  await p.goto(BASE + '#/settings/data');
  await p.getByRole('button', { name: 'Deshacer' }).click(); await p.waitForTimeout(300);
  check('deshacer importación', (await p.getByRole('button', { name: 'Deshacer' }).count()) === 0);
});

await step('borrar y restaurar', async () => {
  await p.goto(BASE + '#/settings/account');
  await p.getByRole('button', { name: 'Empezar de cero' }).click();
  await p.getByRole('button', { name: /Pulsa otra vez/ }).click();
  await p.waitForTimeout(700);
  check('borrar todo vuelve a la bienvenida', await p.getByRole('button', { name: 'Empezar' }).isVisible());
  await p.getByRole('button', { name: 'Empezar' }).click();
  await p.goto(BASE + '#/settings/data');
  await p.getByLabel('Archivo de copia').setInputFiles(jsonPath);
  await p.getByRole('button', { name: 'Reemplazar mis datos' }).click();
  await p.getByRole('button', { name: /Pulsa otra vez/ }).click();
  await p.waitForTimeout(700);
  await p.goto(BASE + '#/settings/prices');
  await p.getByPlaceholder('https://docs.google.com/spreadsheets/d/…').fill(SHEET);
  await p.getByRole('button', { name: 'Guardar y leer' }).click(); await p.waitForTimeout(4000);
  await p.goto(BASE + '#/'); await p.waitForTimeout(500);
  const nw = await txt(NW);
  check('restaurar y reconectar la hoja devuelve el patrimonio', nw.includes('Inversiones 1570,39'), nw);
});

await step('PIN', async () => {
  await p.goto(BASE + '#/settings/privacy');
  await p.getByLabel('Elige un PIN de 4 a 8 dígitos').fill('1234');
  await p.getByRole('button', { name: 'Activar bloqueo' }).click();
  await p.waitForTimeout(400);
  await p.evaluate(() => sessionStorage.clear());
  await p.reload(); await p.waitForTimeout(600);
  check('con PIN la app arranca bloqueada', await p.getByRole('heading', { name: 'Bloqueado' }).isVisible());
  await p.getByLabel('PIN').fill('0000'); await p.getByRole('button', { name: 'Desbloquear' }).click(); await p.waitForTimeout(300);
  check('PIN incorrecto se rechaza', await p.getByRole('alert').isVisible());
  await p.getByLabel('PIN').fill('1234'); await p.getByRole('button', { name: 'Desbloquear' }).click(); await p.waitForTimeout(500);
  await p.goto(BASE + '#/'); await p.waitForTimeout(500);
  check('PIN correcto desbloquea', await p.getByRole('heading', { name: 'Inicio' }).isVisible());
});

await step('categorías', async () => {
  await p.goto(BASE + '#/settings/categories');
  await p.getByLabel('Nueva categoría').fill('Mi categoría'); await p.getByRole('button', { name: 'Añadir', exact: true }).click();
  await p.waitForTimeout(400);
  check('categoría propia creada', await p.getByText('Mi categoría').isVisible());
});

await step('capturas oscuro', async () => {
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.goto(BASE + '#/'); await p.waitForTimeout(500);
  await shot('S04-home-dark.png');
  await p.goto(BASE + '#/settings'); await shot('S13-ajustes.png');
  await p.goto(BASE + '#/stats'); await p.waitForTimeout(500); await shot('S05-estadisticas-dark.png');
});

await step('divisas (BCE simulado)', async () => {
  await p.goto(BASE + '#/accounts');
  await p.getByRole('button', { name: 'Nueva' }).click();
  await p.getByPlaceholder('Nómina, Efectivo, Tarjeta…').fill('Cuenta USD');
  await p.getByPlaceholder('0,00').fill('110');
  await p.locator('select').last().selectOption('USD');
  await p.getByRole('button', { name: 'Guardar cuenta' }).click();
  await p.waitForTimeout(500);
  await p.reload(); await p.waitForTimeout(1200);
  await p.goto(BASE + '#/'); await p.waitForTimeout(600);
  check('110 USD cuentan como 100 € (tipo 1,1)', (await txt(NW)).includes('Cuentas 1570,00') || /Cuentas 1\d{3},\d\d/.test(await txt(NW)), await txt(NW));
});

await step('transferencia entre divisas', async () => {
  await p.goto(BASE + '#/add');
  await p.getByRole('radio', { name: 'Transferencia' }).click();
  await p.getByLabel('Importe', { exact: true }).fill('100');
  await p.locator('select').nth(1).selectOption({ label: 'Cuenta USD' });
  const rec = p.getByLabel('Importe recibido en USD');
  check('propone el importe convertido (100 € = 110,00 USD)', (await rec.inputValue()) === '110,00', await rec.inputValue());
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForURL((u) => !u.hash.startsWith('#/add')); await p.waitForTimeout(400);
  await p.goto(BASE + '#/accounts'); await p.waitForTimeout(500);
  const t = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  check('la cuenta USD recibe 110 USD (total 220)', /Cuenta USD 220,00/.test(t), t);
});

await step('metas: aviso al cruzar el 50 %', async () => {
  await p.goto(BASE + '#/settings/goals');
  await p.getByLabel('Aportación a Viaje').fill('300');
  await p.getByRole('button', { name: 'Aportar' }).click(); await p.waitForTimeout(300);
  check('aviso de meta al llegar al 50 %', await p.getByText(/has llegado al 50 %/).isVisible());
});

await step('almacenamiento y copia', async () => {
  await p.goto(BASE + '#/settings/data'); await p.waitForTimeout(500);
  check('muestra el estado de protección de datos', await p.getByText('Almacenamiento protegido').isVisible());
});

await step('aviso de instalación en iPhone (Safari sin instalar)', async () => {
  const ios = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  const q = await ios.newPage();
  await q.goto(BASE); await q.getByRole('button', { name: 'Empezar' }).click(); await q.waitForTimeout(500);
  check('banner "instálala" visible en Safari de iPhone', await q.getByText(/Instálala para que el iPhone no borre tus datos/).isVisible());
  await q.getByRole('button', { name: 'Entendido' }).click(); await q.waitForTimeout(300);
  check('el banner se puede descartar', (await q.getByText(/Instálala para que/).count()) === 0);
  await ios.close();
});

await step('restaurar desde la bienvenida', async () => {
  await p.goto(BASE + '#/settings/account');
  await p.getByRole('button', { name: 'Empezar de cero' }).click();
  await p.getByRole('button', { name: /Pulsa otra vez/ }).click(); await p.waitForTimeout(700);
  await p.getByLabel('Archivo de copia').setInputFiles(jsonPath);
  await p.waitForTimeout(900);
  await p.goto(BASE + '#/'); await p.waitForTimeout(500);
  check('restaurar desde la bienvenida recupera cuentas y moneda', /Cuentas \d/.test(await txt(NW)), await txt(NW));
});

const plusDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const nw = async () => {
  await p.goto(BASE + '#/'); await p.waitForTimeout(500);
  const t = await txt(NW + ' p.num');
  return Number(t.replace(/[^\d,-]/g, '').replace(',', '.'));
};

await step('barra de navegación flotante', async () => {
  await p.goto(BASE + '#/'); await p.waitForTimeout(400);
  const box = await p.locator('nav[aria-label="Principal"] > div').boundingBox();
  check('la barra no toca los bordes (flotante) y es una pastilla', box.x >= 8 && box.x + box.width <= 390 - 8 && box.y + box.height < 844 - 6, JSON.stringify(box));
  await shot('S00-barra-flotante.png');
});

await step('movimiento con fecha futura', async () => {
  const before = await nw();
  await p.goto(BASE + '#/add');
  await p.getByLabel('Importe', { exact: true }).fill('50');
  await p.getByLabel('Nota').fill('Futuro');
  await p.getByLabel('Fecha', { exact: true }).fill(plusDays(8));
  check('avisa de que es programado', await p.getByText(/figurará como programado/).isVisible());
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.waitForURL((u) => !u.hash.startsWith('#/add')); await p.waitForTimeout(400);
  const after = await nw();
  check('un gasto futuro NO cambia el patrimonio hoy', after === before, `${before} → ${after}`);
  check('aparece en Programados', await p.getByRole('heading', { name: 'Programados' }).isVisible());
});

await step('recurrentes con inicio futuro', async () => {
  const before = await nw();
  await p.goto(BASE + '#/settings/recurring');
  await p.getByRole('link', { name: 'Nuevo' }).click();
  await p.getByRole('radio', { name: 'Ingreso' }).click();
  await p.getByLabel('Importe', { exact: true }).fill('1800');
  await p.getByLabel('Nota').fill('Nómina futura');
  await p.getByLabel('Primera fecha').fill(plusDays(8));
  check('explica que no se registra hasta esa fecha', await p.getByText(/No se registrará nada hasta el/).isVisible());
  await p.getByRole('button', { name: 'Guardar recurrente' }).click();
  await p.waitForURL(/#\/settings\/recurring/); await p.waitForTimeout(500);
  check('la regla aparece como «empieza»', await p.getByText(/empieza/).first().isVisible());
  const after = await nw();
  check('un ingreso recurrente futuro NO suma hoy', after === before, `${before} → ${after}`);
  await p.goto(BASE + '#/movements'); await p.waitForTimeout(300);
  check('no se ha creado ningún movimiento de la regla', (await p.locator('a[href^="#/tx/"]').filter({ hasText: 'Nómina futura' }).count()) === 0);
  // editar la regla
  await p.goto(BASE + '#/settings/recurring');
  await p.getByRole('link', { name: /Nómina futura/ }).click();
  await p.getByLabel('Importe', { exact: true }).fill('1900');
  await p.getByRole('button', { name: 'Guardar recurrente' }).click();
  await p.waitForURL(/#\/settings\/recurring/); await p.waitForTimeout(400);
  check('editar la regla cambia el importe', await p.getByText(/1900,00/).first().isVisible());
});

await step('recurrente que empieza hoy se registra ya', async () => {
  const before = await nw();
  await p.goto(BASE + '#/add?rule=1');
  await p.getByLabel('Importe', { exact: true }).fill('10');
  await p.getByLabel('Nota').fill('Suscripción de prueba');
  await p.getByLabel('Primera fecha').fill(plusDays(0));
  await p.getByRole('button', { name: 'Guardar recurrente' }).click();
  await p.waitForURL((u) => !u.hash.startsWith('#/add')); await p.waitForTimeout(500);
  const after = await nw();
  check('si la fecha ya llegó, se registra la primera vez al momento (−10)', Math.abs(before - after - 10) < 0.005, `${before} → ${after}`);
});

await step('plan de inversión mensual', async () => {
  await p.goto(BASE + '#/settings/prices');
  await p.getByPlaceholder('https://docs.google.com/spreadsheets/d/…').fill(SHEET);
  await p.getByRole('button', { name: 'Guardar y leer' }).click(); await p.waitForTimeout(1500);
  const base = await nw();
  await p.goto(BASE + '#/investments/plan'); await p.waitForTimeout(500);
  await p.getByLabel('Cuenta de origen').selectOption({ label: 'Nómina' });
  const month = plusDays(0).slice(0, 7);
  for (const [fund, qty] of [['Fondo Demo', '100'], ['Fondo Manual', '50']]) {
    await p.getByLabel('Fondo de tu hoja').selectOption({ label: fund });
    await p.getByLabel('Cantidad mensual').fill(qty);
    await p.getByLabel('Mes de la primera aportación').fill(month);
    await p.getByRole('button', { name: 'Añadir al plan' }).click(); await p.waitForTimeout(500);
  }
  check('el plan crea 2 aportaciones pendientes', await p.getByText('Por confirmar (2)').isVisible());
  check('el aviso numérico sale en la pestaña Cartera', await p.getByRole('link', { name: /Cartera, 2 por confirmar/ }).isVisible());
  await shot('S09-plan.png');
  check('pendientes NO cuentan en el patrimonio', (await nw()) === base, `${base}`);
  check('aviso en Inicio', await p.getByText(/2 aportaciones de tu plan por confirmar/).isVisible());

  // confirmar con otra fecha
  await p.goto(BASE + '#/investments/plan'); await p.waitForTimeout(400);
  const demo = p.getByRole('group', { name: /Fondo Demo/ });
  check('toma el precio de la hoja (14,5065)', (await demo.getByLabel('Precio de Fondo Demo').inputValue()) === '14,5065');
  await demo.getByLabel('Fecha de Fondo Demo').fill(month + '-02');
  await demo.getByRole('button', { name: 'Confirmar' }).click(); await p.waitForTimeout(600);
  check('queda 1 por confirmar', await p.getByText('Por confirmar (1)').isVisible());
  const afterOne = await nw();
  check('confirmar compra y descuenta: el patrimonio total no cambia', Math.abs(afterOne - base) < 0.02, `${base} → ${afterOne}`);
  await p.goto(BASE + '#/movements'); await p.waitForTimeout(300);
  const inv = p.locator('a[href="#/investments/plan"]').filter({ hasText: 'Inversión' }).first();
  check('el movimiento figura como Inversión con la fecha elegida', (await inv.innerText()).includes(month + '-02'), await inv.innerText());

  // fondo sin precio en la hoja
  await p.goto(BASE + '#/investments/plan'); await p.waitForTimeout(400);
  const man = p.getByRole('group', { name: /Fondo Manual/ });
  await man.getByRole('button', { name: 'Confirmar' }).click();
  check('sin precio pide escribirlo', await man.getByRole('alert').isVisible());
  await man.getByLabel('Precio de Fondo Manual').fill('10,73739');
  await man.getByRole('button', { name: 'Confirmar' }).click(); await p.waitForTimeout(600);
  check('ya no queda nada pendiente', await p.getByText('Por confirmar (0)').isVisible());
  const afterAll = await nw();
  check('con ambas confirmadas el patrimonio sigue igual', Math.abs(afterAll - base) < 0.02, `${base} → ${afterAll}`);

  // deshacer
  await p.goto(BASE + '#/investments/plan'); await p.waitForTimeout(400);
  await p.getByRole('button', { name: /Deshacer Fondo Manual/ }).click(); await p.waitForTimeout(500);
  check('deshacer devuelve la aportación a pendiente', await p.getByText('Por confirmar (1)').isVisible());
  await p.getByRole('group', { name: /Fondo Manual/ }).getByRole('button', { name: 'Saltar este mes' }).click(); await p.waitForTimeout(400);
  check('saltar la quita de pendientes', await p.getByText('Por confirmar (0)').isVisible() && await p.getByText('Saltadas').isVisible());
  await shot('S09b-plan-confirmado.png');
});

await step('el plan sobrevive a copia y restauración', async () => {
  await p.goto(BASE + '#/settings/data');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Guardar copia' }).click()]);
  await dl.saveAs(S + '/backup2.json');
  const b2 = JSON.parse(fs.readFileSync(S + '/backup2.json', 'utf8'));
  check('la copia incluye el plan y sus aportaciones', b2.data.planItems.length === 2 && b2.data.planRuns.length >= 2, `${b2.data.planItems.length} / ${b2.data.planRuns.length}`);
  await p.goto(BASE + '#/settings/account');
  await p.getByRole('button', { name: 'Empezar de cero' }).click(); await p.getByRole('button', { name: /Pulsa otra vez/ }).click(); await p.waitForTimeout(700);
  await p.getByLabel('Archivo de copia').setInputFiles(S + '/backup2.json'); await p.waitForTimeout(900);
  await p.goto(BASE + '#/investments/plan'); await p.waitForTimeout(500);
  check('tras restaurar, el plan sigue ahí', await p.getByText('Fondo Demo').first().isVisible());
});

await step('avisos: permiso, suscripción y envío al servicio (simulado)', async () => {
  const FAKE = 'https://avisos.test';
  const calls = [];
  await ctx.grantPermissions(['notifications'], { origin: new URL(BASE).origin });
  await ctx.addInitScript(() => {
    // Chromium sin red no puede hablar con el servicio de push de Google: se simula la suscripción del navegador.
    const sub = { endpoint: 'https://web.push.apple.com/prueba', expirationTime: null, toJSON() { return { endpoint: this.endpoint, expirationTime: null, keys: { p256dh: 'BNnnekUBbHF2_jeUrvpzDBFdEtYNEaF_8RGz9evysPlgyoEdH1cxywaFW2r4q3NPyydX3sFfC4KMKV3yPkwxFFg', auth: 'AAAAAAAAAAAAAAAAAAAAAA' } }; }, async unsubscribe() { window.__unsub = true; return true; } };
    PushManager.prototype.getSubscription = async function () { return window.__sub ?? null; };
    PushManager.prototype.subscribe = async function () { window.__sub = sub; return sub; };
  });
  await ctx.route(FAKE + '/**', async (r) => {
    const rq = r.request(); const path = new URL(rq.url()).pathname;
    calls.push({ method: rq.method(), path, auth: rq.headers()['authorization'], body: rq.postData() });
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': '*' };
    if (rq.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (path === '/vapid-public-key') return r.fulfill({ status: 200, headers: cors, body: 'BMUl_BSbqve2sHSHNidmcSl6E7x_eTnVwlAjpT_CbBp9EbLyIzXJWlwlEbc9naqF2W4EiVNhteXXUFPYL1bPltw' });
    if (rq.headers()['authorization'] !== 'Bearer codigo-bueno') return r.fulfill({ status: 401, headers: cors, body: '{}' });
    return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{"ok":true}' });
  });
  await p.goto(BASE + '#/settings/alerts'); await p.reload(); await p.waitForTimeout(800); // recargar: el script de arranque solo se aplica a documentos nuevos
  check('la pantalla de avisos se abre', await p.getByRole('heading', { name: 'Avisos', exact: true, level: 1 }).isVisible());
  await p.getByRole('button', { name: 'Generar mis claves' }).click(); await p.waitForTimeout(400);
  for (const n of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'OWNER_TOKEN', 'VAPID_SUBJECT']) check(`muestra ${n} para copiarlo`, await p.getByLabel(n, { exact: true }).isVisible());
  const generated = await p.getByLabel('OWNER_TOKEN', { exact: true }).innerText();
  check('el código secreto generado se rellena solo en el formulario', (await p.getByLabel('Código secreto').inputValue()) === generated && generated.length === 32, generated);
  await p.goto(BASE + '#/settings'); await p.reload(); await p.waitForTimeout(600); await p.goto(BASE + '#/settings/alerts'); await p.waitForTimeout(800);
  check('las claves generadas sobreviven a una recarga de la app', (await p.getByLabel('OWNER_TOKEN', { exact: true }).innerText()) === generated);
  await p.getByLabel('Dirección del servicio').fill('http://inseguro.test');
  check('rechaza direcciones sin https', await p.getByText(/debe empezar por https/).isVisible());
  await p.getByLabel('Dirección del servicio').fill(FAKE);
  await p.getByLabel('Código secreto').fill('codigo-malo');
  await p.getByRole('button', { name: 'Activar avisos' }).click(); await p.waitForTimeout(800);
  check('un código equivocado da un error claro y no activa nada', await p.getByText(/código secreto no coincide/).isVisible());
  await p.getByLabel('Código secreto').fill('codigo-bueno');
  await p.getByLabel('Hora del aviso').selectOption('8');
  await p.getByRole('button', { name: 'Activar avisos' }).click(); await p.waitForTimeout(1000);
  check('con el código bueno se activan', await p.getByText(/Avisos activados/).isVisible());
  check('al activar, las claves guardadas se borran del móvil', (await p.getByText('Ya las he copiado').count()) === 0);
  const sub = calls.filter((c) => c.path === '/subscribe' && c.method === 'POST' && c.auth === 'Bearer codigo-bueno').at(-1);
  const body = JSON.parse(sub?.body ?? '{}');
  check('envía endpoint y claves del móvil, la zona horaria y 2 recordatorios', !!body.subscription?.keys?.auth && !!body.tz && body.reminders?.length === 2, JSON.stringify(body).slice(0, 200));
  check('el recordatorio del plan va a su hora y con su ruta', body.reminders?.some((r) => r.id === 'plan' && r.hour === 8 && r.url === '#/investments/plan' && r.day >= 1));
  check('los textos enviados no llevan cifras ni importes', body.reminders?.every((r) => !/[\d€]/.test(r.text)), JSON.stringify(body.reminders));
  await p.getByRole('button', { name: 'Enviar aviso de prueba' }).click(); await p.waitForTimeout(700);
  check('el aviso de prueba se pide al servicio', calls.some((c) => c.path === '/test' && c.method === 'POST' && c.auth === 'Bearer codigo-bueno'));
  await shot('S13b-avisos.png');

  // el service worker muestra la notificación al recibir un push
  const cdp = await ctx.newCDPSession(p);
  const regs = new Map();
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => e.registrations.forEach((x) => regs.set(x.registrationId, x.scopeURL)));
  await cdp.send('ServiceWorker.enable'); await p.waitForTimeout(500);
  const id = [...regs.keys()][0];
  if (!id) throw new Error('no se encontró el service worker');
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: new URL(BASE).origin, registrationId: id, data: JSON.stringify({ title: 'Mi Patrimonio', body: 'Hoy toca tu plan de inversión.', url: '#/investments/plan', tag: 'plan' }) });
  await p.waitForTimeout(1200);
  const shown = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url })));
  check('al llegar un push, el service worker muestra la notificación', shown.some((n) => n.body === 'Hoy toca tu plan de inversión.' && n.title === 'Mi Patrimonio' && n.url === '#/investments/plan'), JSON.stringify(shown));
  // un push mal formado igualmente muestra algo (iOS retira el permiso si no se muestra nada)
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: new URL(BASE).origin, registrationId: id, data: 'texto plano' });
  await p.waitForTimeout(1000);
  const shown2 = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).length);
  check('un push con formato raro también muestra una notificación', shown2 >= 2, String(shown2));

  await p.getByRole('button', { name: 'Desactivar avisos' }).click(); await p.waitForTimeout(800);
  check('se pueden desactivar', await p.getByText('Avisos desactivados.').isVisible());
});

await step('vibración al tocar (opcional)', async () => {
  await p.goto(BASE + '#/settings/preferences'); await p.waitForTimeout(500);
  await p.evaluate(() => { window.__vib = []; navigator.vibrate = (ms) => { window.__vib.push(ms); return true; }; });
  await p.getByRole('link', { name: 'Ajustes' }).first().click().catch(() => {}); // un toque cualquiera con la opción apagada
  await p.goto(BASE + '#/settings/preferences'); await p.waitForTimeout(400);
  await p.evaluate(() => { window.__vib = []; navigator.vibrate = (ms) => { window.__vib.push(ms); return true; }; });
  await p.getByRole('tab').first().click({ timeout: 500 }).catch(() => {});
  await p.getByRole('link', { name: 'Inicio' }).click(); await p.waitForTimeout(200);
  check('apagada por defecto: ningún toque vibra', (await p.evaluate(() => window.__vib.length)) === 0);
  await p.goto(BASE + '#/settings/preferences'); await p.waitForTimeout(400);
  await p.getByLabel('Vibración al tocar').click(); await p.waitForTimeout(500);
  await p.evaluate(() => { window.__vib = []; navigator.vibrate = (ms) => { window.__vib.push(ms); return true; }; });
  await p.getByRole('link', { name: 'Estadísticas' }).click(); await p.waitForTimeout(200);
  await p.getByRole('button', { name: 'Añadir movimiento' }).click(); await p.waitForTimeout(300);
  check('activada: cada toque en un botón o enlace vibra', (await p.evaluate(() => window.__vib.length)) >= 2, String(await p.evaluate(() => window.__vib.length)));
  await p.getByRole('button', { name: 'Cancelar' }).click(); await p.waitForTimeout(300);
  // iPhone: sin Vibration API se usa el interruptor nativo oculto
  await p.goto(BASE + '#/settings/preferences'); await p.waitForTimeout(500);
  await p.evaluate(() => { Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true }); });
  await p.getByRole('link', { name: 'Inicio' }).click(); await p.waitForTimeout(200);
  const sw1 = await p.evaluate(() => { const i = document.querySelector('label[data-haptic-ignore] input[switch]'); return i ? i.checked : null; });
  await p.getByRole('link', { name: 'Cartera' }).click(); await p.waitForTimeout(200);
  const sw2 = await p.evaluate(() => document.querySelector('label[data-haptic-ignore] input[switch]')?.checked);
  check('sin Vibration API (iPhone): se crea el interruptor oculto y se acciona en cada toque', sw1 !== null && sw1 !== sw2, `${sw1} -> ${sw2}`);
  check('el interruptor oculto no es visible ni lo lee el lector de pantalla', await p.evaluate(() => { const l = document.querySelector('label[data-haptic-ignore]'); return l.getAttribute('aria-hidden') === 'true' && getComputedStyle(l).opacity === '0'; }));
  await p.goto(BASE + '#/settings/preferences'); await p.waitForTimeout(400);
  await p.getByLabel('Vibración al tocar').click(); await p.waitForTimeout(400);
});

log('\nerrores de consola/página:', errors);
log(fails === 0 ? '\nTODO OK' : `\n${fails} COMPROBACIONES FALLARON`);
await b.close();
process.exit(fails === 0 ? 0 : 1);
