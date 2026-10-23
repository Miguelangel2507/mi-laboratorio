# Architecture: clon personal de Neto (PWA)

Entradas: `replica/recon.md`, `replica/features.csv`.
Decisiones del usuario: PWA instalable en iPhone, uso personal, datos solo en el móvil, sin backend ni login, copia y restauración en JSON, movimientos en CSV, precios de fondos desde su Google Sheet, interfaz en español.

## 1. Stack

| capa | elección | por qué |
| --- | --- | --- |
| app | Vite + React + TypeScript | sin servidor; el código se puede reutilizar en Expo si algún día hace falta |
| PWA | vite-plugin-pwa (service worker + manifest) | instalable y funciona sin conexión |
| estilos | Tailwind con tokens de `replica-design` | tokens propios, no los de Neto |
| datos | IndexedDB con Dexie | base de datos local con índices y transacciones |
| estado | Zustand + consultas vivas de Dexie | poco código |
| gráficas | Recharts | líneas, barras y donut |
| fechas e i18n | date-fns + diccionario propio es/en | empezar solo en español |
| hosting | GitHub Pages o Cloudflare Pages | gratis, HTTPS (necesario para la PWA) |
| tests | Vitest + Playwright | lógica de cálculo y flujos |

Sin Postgres, sin ORM, sin auth, sin pagos y sin email. No hay PRO: todo está desbloqueado.
Carpeta: `app/` en este repositorio.

## 2. Esquema local (IndexedDB)

Dinero en céntimos enteros más código de divisa. Fechas como texto ISO `YYYY-MM-DD`; marcas de tiempo en UTC. No hay `user_id`: un solo usuario por dispositivo.

```ts
// Dexie: "++id" = autoincremental; "&" = único; el resto son índices
db.version(1).stores({
  settings:     "key",                                  // moneda principal, idioma, tema, ocultar saldos, URL de la hoja
  accounts:     "++id, name, archived",                 // balanceCents, currency, color
  categories:   "++id, kind, &[kind+name]",             // kind: expense|income; isDefault, color, icon
  transactions: "++id, date, accountId, categoryId, kind, importBatchId, recurringId, [accountId+date]",
                // kind: expense|income|transfer; amountCents, currency, note, source, transferAccountId
  budgets:      "++id, categoryId, period",             // limitCents, rollover; period: week|month|year
  goals:        "++id, name",                           // targetCents, contributions[]
  recurring:    "++id, nextRun, frequency",             // plantilla de transacción o transferencia; nextRun
  assets:       "++id, type, &key",                     // type: fund|stock|etf|crypto|other|debt; key = ISIN o código; quantity, avgPriceCents, manualValueCents, priceMode: sheet|manual
  trades:       "++id, assetId, date",                  // side: buy|sell, quantity, priceCents
  quotes:       "&key, fetchedAt",                      // caché de la hoja: name, priceCents, priceDate, isManual
  netWorth:     "++id, &[period+label]",                // period: month|year, label '2026-10' o '2026', valueCents, auto:boolean
  fxRates:      "&[base+quote], fetchedAt",             // tipos de cambio diarios
  importBatches:"++id, createdAt"                       // para deshacer una importación entera
});
```

Reglas de integridad (en la capa de datos, porque IndexedDB no tiene claves foráneas):
- Borrar una cuenta con movimientos: pedir confirmación y borrar sus movimientos en una sola transacción de Dexie.
- Una transferencia es un solo registro con `accountId` y `transferAccountId`; no cuenta como gasto ni ingreso.
- Los movimientos importados no cambian el saldo (igual que el original). Los manuales sí.
- Borrar una categoría con movimientos: reasignar a "Otros".
- Saldo calculado de una cuenta = `balanceCents` inicial más los movimientos manuales, de transferencia y recurrentes. Una función pura, probada.

Categorías por defecto (nombres propios, no copiar la lista de Neto): 16 de gasto y 7 de ingreso definidas en `app/src/data/categories.ts`.

## 3. Precios de fondos desde Google Sheets

Fuente: pestaña publicada con columnas `ISIN, Nombre, VL, Fecha`.

- **Importante, CORS:** el navegador solo puede leer la hoja si el servidor envía cabeceras CORS. El enlace `…/export?format=csv` puede fallar desde una web. Usar **Archivo > Compartir > Publicar en la Web > CSV** (URL `…/pub?output=csv`), que sí lo permite. Se verifica en el primer hito; si falla, plan B: proxy mínimo (Cloudflare Worker gratuito).
- El enlace se guarda en `settings`, no en el código. El repositorio no contiene ninguna URL de la hoja.
- Parser: `VL` con coma decimal (`"16,9271"` a 169271 diezmilésimas). Se guarda el precio como entero con 5 decimales (`priceE5`) para no perder precisión.
- Filas con `→ manual` o sin fecha: `isManual = true`; la app pide el precio a mano y lo marca.
- La clave es texto libre: ISIN (`IE00…`) o código de plan de pensiones (`N5546`).
- Caché en `quotes`; se refresca al abrir la cartera y como máximo una vez cada hora. Sin conexión se usa la caché y se muestra "precio del día X".
- Mostrar siempre la fecha del precio: cada fondo tiene la suya.
- Cripto, acciones y divisas: no se necesitan precios automáticos (no los sigues). Quedan como precio manual. Opcional más adelante: CoinGecko, que sí permite CORS.

## 4. Divisas

Moneda principal elegible. Cuentas en su divisa. Tipos de cambio del BCE vía Frankfurter (gratis, con CORS), cacheados en `fxRates` una vez al día. Sin conexión se usa el último tipo. Los totales se convierten al calcular, nunca se guardan convertidos.

## 5. Copia de seguridad e importación

**JSON completo** (`neto-clon-backup-AAAA-MM-DD.json`):
```json
{ "app": "mi-neto", "schemaVersion": 1, "exportedAt": "…", "data": { "accounts": [], "transactions": [], "assets": [], "trades": [], "…": [] } }
```
- Validar con un esquema (zod) antes de tocar nada; si falla, no se cambia nada.
- Restaurar: previsualizar lo que hay (nº de cuentas, movimientos…), pedir confirmación, y reemplazar todo dentro de **una transacción**.
- `schemaVersion` con migraciones para versiones futuras.
- Excluir la URL de la hoja si el usuario lo prefiere (opción al exportar).

**CSV de movimientos:** columnas `Fecha,Descripción,Categoría,Tipo,Cuenta,Importe` (fecha AAAA-MM-DD, importe con punto decimal, negativo en gastos). Exportar por rango de fechas. Importar con plantilla descargable, vista previa, quitar filas, cuenta por defecto, máximo 2.000 filas y deshacer por lote.

**Aviso de copia:** iOS puede borrar los datos de una web que no se abre durante semanas. La app pide `navigator.storage.persist()` y recuerda exportar el JSON cada 2 semanas. Se muestra la fecha de la última copia en Ajustes.

## 6. Pantallas y rutas (cliente)

Router por hash (`#/`) para funcionar en cualquier hosting estático.

| ruta | pantalla | flujo |
| --- | --- | --- |
| `/` | S04 Inicio | F02, F06 |
| `/stats` | S05 Estadísticas | |
| `/accounts`, `/accounts/:id` | S06, S07 | F04 |
| `/investments`, `/investments/new`, `/investments/:id` | S08, S09, S10 | F05, F06 |
| `/add` (modal) | S11 | F02 |
| `/settings` y subrutas (`categories`, `budgets`, `goals`, `export`, `import`, `recurring`, `preferences`, `privacy`, `notifications`, `account`) | S13–S24 | F07, F08, F09 |
| `/welcome` | S01 | F01 (sin cuenta: solo alias, moneda y objetivo) |

S02 y S03 (registro/login y paywall) **no se construyen**: no hay cuenta ni suscripción. Widgets (S25), doble toque y Apple Pay/Google Wallet: fuera de alcance en una PWA.

## 7. Lo que muerde

- **Datos locales:** son la única copia. Mitigación: exportación recordada, almacenamiento persistente, pantalla de restauración probada.
- **Notificaciones:** en iOS, Web Push solo funciona con la PWA instalada y desde iOS 16.4. Las notificaciones de presupuestos y recurrentes se calculan al abrir la app (avisos dentro de la app) y push queda como "could".
- **Recurrentes sin servidor:** no hay cron. Al abrir la app se generan los movimientos pendientes desde `nextRun` hasta hoy, de forma idempotente (clave única `recurringId+date`).
- **Redondeo y dinero:** céntimos enteros; participaciones con 6 decimales; precios con 5.
- **Zonas horarias:** fechas de movimientos como día local (`YYYY-MM-DD`), sin hora, para que cambiar de zona no mueva gastos de día.
- **Cambio de versión del service worker:** una app instalada puede quedarse con código viejo; mostrar aviso "hay una versión nueva" con botón de recargar.
- **Privacidad:** sin analítica y sin servidores propios; solo salen peticiones a la hoja publicada y a Frankfurter. La hoja no debe contener cantidades.

## 8. Orden de construcción

1. **Corte vertical (hito 1):** esqueleto PWA, base de datos, crear cuenta, añadir gasto (S11) y verlo en Inicio con el patrimonio (S04). Además, probar la lectura de la hoja con CORS. Tablas: `accounts`, `categories`, `transactions`, `settings`, `quotes`.
2. **Imprescindibles (hito 2):** movimientos (editar, borrar, buscar), transferencias, estadísticas por periodo, inversiones desde la hoja (alta, compras y ventas, P&L), patrimonio con bienes y deudas, ajustes, copia JSON, eliminar y empezar de cero.
3. **Recomendables (hito 3):** presupuestos, metas, recurrentes, CSV importar y exportar, evolución del patrimonio, modo discreto, bloqueo con PIN o WebAuthn, tema oscuro, divisas.
4. **Opcionales (hito 4):** escaneo de recibos con OCR local, racha, notificaciones push, inglés.
5. Después de `replica-design`: tokens y componentes propios antes de pulir las pantallas.

## 9. Riesgos principales

1. **CORS de la hoja de cálculo**: se comprueba en el hito 1.
2. **Pérdida de datos locales en iOS**: exportación recordada y restauración probada.
3. **Cálculo correcto de P&L y precio medio** con compras y ventas parciales: función pura con tests.

## Resumen de números
Tablas: 13. Rutas de cliente: ~20. Endpoints propios: 0. Servicios externos: 2 (tu hoja publicada y Frankfurter).
