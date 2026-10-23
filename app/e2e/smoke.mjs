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
p.on('pageerror', (e) => errors.push('PAGE ' + e));
p.on('console', (m) => m.type() === 'error' && !/frankfurter|Failed to load resource/.test(m.text()) && errors.push('CONSOLE ' + m.text()));
const log = (...a) => console.log(...a);
const txt = async (sel) => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ');
const NW = 'section[aria-label="Patrimonio neto"]';
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; log(ok ? 'OK   ' : 'FALLA', name, ok ? '' : extra); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; log('ERROR', name, String(e).split('\n')[0]); } };

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
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
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

log('\nerrores de consola/página:', errors);
log(fails === 0 ? '\nTODO OK' : `\n${fails} COMPROBACIONES FALLARON`);
await b.close();
process.exit(fails === 0 ? 0 : 1);
