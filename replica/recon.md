# Recon map: Neto (iPhone / Android, mobile)

Scope: toda la app, incluidas las inversiones. Sin conexión bancaria (la app original tampoco la tiene).
For: uso personal del usuario. No se vende ni se publica.
Date: 2026-10-22

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | web de marketing | https://netoapp.es/ | pitch, funciones, precios, FAQ |
| 2 | guía de uso | https://netoapp.es/como-usar-neto/ | la fuente más completa: pestañas, ajustes, gratis vs PRO |
| 3 | términos | https://netoapp.es/legal/terminos/ | prohíbe ingeniería inversa y copiar código, diseño, logo, marca, textos y personajes 3D |
| 4 | App Store | https://apps.apple.com/es/app/neto-finanzas-y-patrimonio/id6757704061 | pendiente: capturas de pantalla |
| 5 | Google Play | https://play.google.com/store/apps/details?id=es.neto.finance | pendiente |
| 6 | por leer | /seguimiento-inversiones/, /patrimonio-neto/, /multidivisa/, /presupuestos-personales/, /metas-de-ahorro/ | segunda pasada |

Pendiente: no he visto pantallas reales, solo texto. Las capturas de las tiendas o de la cuenta del usuario completan estados (vacío, error, carga).

## Core loop

Apuntar un gasto en segundos y ver el patrimonio neto (cuentas + inversiones + bienes − deudas) en Inicio.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Onboarding | primer arranque | alias, objetivo, moneda, avisos | formularios paso a paso | pendiente |
| S02 | Registro / login | tras S01 | Apple, Google o email | botones SSO, email+contraseña (mín. 8) | error, recuperar contraseña |
| S03 | Paywall PRO | una vez tras el alta | ofrecer PRO | planes semanal/anual | cerrable |
| S04 | Inicio | pestaña 1 | patrimonio neto, racha, últimos movimientos | cifra grande, lupa de búsqueda, lista | saldos ocultos (pulsación larga), vacío |
| S05 | Estadísticas | pestaña 2 | ingresos/gastos/balance por día, semana, mes, año | selector de periodo, % de cambio, salud del periodo | gratis (totales), PRO (gráficas), datos de ejemplo sin PRO |
| S06 | Cuentas | pestaña 3 (abajo a la derecha según la guía) | lista de cuentas y saldos | lista, botón Nueva cuenta | vacío |
| S07 | Nueva/editar cuenta | desde S06 | nombre, saldo, divisa, color | formulario | saldo negativo |
| S08 | Inversiones (PRO) | pestaña 4 | cartera, valor, P&L, gráfico por tipo, evolución del patrimonio | lista de activos, donut, gráfica meses/años | sin PRO bloqueada |
| S09 | Añadir inversión | desde S08 | tipo (acción, ETF, fondo, cripto, otro, deuda) | buscador por nombre/ticker/ISIN, participaciones, precio medio | no aparece, alta manual |
| S10 | Detalle de activo | desde S08 | compras y ventas, rendimiento | historial de operaciones | |
| S11 | Añadir movimiento | botón + central | gasto, ingreso o transferencia | importe, categoría, cuenta, fecha, nota, repetir, escanear recibo | |
| S12 | Escanear recibo (PRO) | desde S11 | rellenar gasto con foto | cámara/galería, OCR local | |
| S13 | Ajustes | menú | hub | secciones Cuenta, Preferencias, Finanzas, Automatización, Notificaciones, Privacidad | |
| S14 | Categorías | Ajustes > Finanzas | ver y crear (PRO) | lista, selector de color/icono | |
| S15 | Presupuestos | Ajustes > Finanzas | límite por categoría y periodo, arrastre | lista, barra de progreso, avisos 80 % y 100 % | |
| S16 | Metas de ahorro | Ajustes > Finanzas | huchas con objetivo | lista, aportaciones, avisos 50/75/100 % | |
| S17 | Exportar datos | Ajustes > Finanzas | CSV de movimientos, cuentas, inversiones, recurrentes | rango de fechas | gratis 1 vez/30 días |
| S18 | Importar datos | Ajustes > Finanzas | importar CSV (plantilla + instrucciones para IA) | vista previa, quitar filas, cuenta por defecto, deshacer | máx. 2.000 filas |
| S19 | Recurrentes (PRO) | Ajustes > Automatización | frecuencia diaria a anual, transferencias programadas | lista, formulario | |
| S20 | Automatización de pagos (PRO) | Ajustes > Automatización | Apple Pay / Google Wallet | guía de configuración | solo nativo |
| S21 | Preferencias | Ajustes | moneda, idioma (6), tema, racha, icono | selectores | |
| S22 | Privacidad | Ajustes | ocultar saldos, Face ID / huella | interruptores | |
| S23 | Notificaciones | Ajustes | recordatorios, presupuestos, metas, recurrentes | interruptores | |
| S24 | Cuenta | Ajustes | empezar de cero, eliminar cuenta | confirmaciones | irreversible |
| S25 | Widgets | pantalla de inicio del móvil | añadir rápido, balance, ingresos/gastos | 3 widgets por plataforma | saldos ocultos |

## Flows

```
F01 Alta
    S01 -> S02 -> S03 (cerrar) -> S04
    happy path clicks: ~8 (según preguntas)
    edge: email ya usado, contraseña corta, olvido de contraseña

F02 Apuntar un gasto
    S04 -> + -> S11 -> guardar -> S04
    happy path clicks: 4 (importe, categoría, cuenta, guardar)
    edge: fecha pasada, cuenta en otra divisa, sin cuentas creadas

F03 Apuntar gasto sin abrir la app (iPhone: doble toque; Apple Pay PRO; Google Wallet PRO)
    fuera de la app. Solo nativo, no replicable en web.

F04 Crear cuenta y transferir
    S06 -> S07 -> S11 (transferencia). No cuenta como gasto ni ingreso.

F05 Añadir inversión (PRO)
    S08 -> S09 (buscar) -> participaciones + precio medio -> S10
    edge: activo no encontrado -> alta manual sin precio automático

F06 Ver patrimonio
    S04 (cuentas + inversiones + bienes - deudas) -> S08 (evolución)
    edge: el historial pasado lo escribe el usuario

F07 Presupuesto y meta
    S13 -> S15 / S16 -> avisos por notificación

F08 Importar historial
    S18: descargar plantilla -> pasar extracto a una IA -> subir CSV -> vista previa -> importar (deshacible)

F09 Exportar y borrar
    S17 / S24
```

## Components

Botón + central, tarjeta de patrimonio con ocultar al mantener pulsado, lista de movimientos con buscador, selector de periodo, selector de categoría con +, selector de cuenta, formulario de importe, barra de progreso (presupuestos/metas), donut de cartera, gráfica meses/años, interruptores de ajustes, mascota Neto (personaje propio de Neto: **no copiar**), widgets.

## Inferred data model

```
User         id, alias (único), email|apple|google id, currency, language, theme, timezone, push_token, is_pro
             evidence: S01, S02, S21. confidence: high
Account      id, user_id, name, balance (puede ser negativo), currency, color
             evidence: S07. sin tipos de cuenta. confidence: high
Transaction  id, user_id, account_id, kind (expense|income|transfer), amount, category_id, date, note, source (manual|scan|apple_pay|google_wallet|import|recurring), import_batch_id
             evidence: S11, S18. las importadas no modifican el saldo. confidence: high
Category     id, user_id nullable, kind, name, color/icon, is_default
             evidence: 16 de gasto + 7 de ingreso por defecto; propias en PRO. confidence: high
Budget       id, user_id, category_id, period (week|month|year), limit, rollover. confidence: high
SavingsGoal  id, user_id, name, target, contributions[]. confidence: medium
Recurring    id, template, frequency (daily|weekly|biweekly|monthly|yearly), next_run. confidence: high
Asset        id, user_id, type (stock|etf|fund|crypto|other|debt), symbol/isin, quantity, avg_price, manual_value, currency
             evidence: S09. confidence: medium
AssetTrade   id, asset_id, side (buy|sell), qty, price, date. confidence: medium
NetWorthSnapshot id, user_id, period (month|year), value
             el periodo actual se calcula; los pasados los escribe el usuario. confidence: high
FxRate       currency, rate, date (diario). 62 divisas. confidence: high
PriceQuote   symbol, price, updated_at. cripto cada hora, acciones/ETF 2 veces al día, fondos 1 vez al día. confidence: high
```

## What cannot be cloned

Ver filas `skip` en features.csv. Resumen: marca, logo, textos, mascota y personajes 3D de Neto (sus términos lo prohíben); los datos y la base de usuarios; la integración nativa con Apple Pay / Google Wallet / doble toque, que exige app nativa y no hay equivalente web; datos de mercado de pago.

## Size

Pantallas: 25. Flujos: 9. Entidades: 12.
Partes difíciles: (1) precios automáticos de acciones, ETFs y fondos (proveedor de datos con límites); (2) multidivisa con tipos de cambio diarios y totales convertidos; (3) empaquetar como app móvil real (iOS/Android) y, si se quiere, la captura automática de pagos.
Tamaño: **M** como PWA o app móvil (Expo/React Native), sin las automatizaciones nativas. **L** con ellas.
