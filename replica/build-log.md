# Build log

| hito | fecha | estado | falta | notas |
| --- | --- | --- | --- | --- |
| M1 corte vertical (S01 S04 S06 S08 lectura de hoja S11 ajustes) | 2026-10-23 | hecho | editar/borrar movimientos, buscador, estadísticas, alta de inversiones, copia JSON/CSV, divisas, iconos PNG para iOS | |

Notas
- La hoja de Google se lee con la URL `gviz/tq?tqx=out:csv`, que devuelve cabeceras CORS. No hace falta "Publicar en la Web". Verificado en Chromium con la hoja real: 8 fondos.
- Bug encontrado por los tests: `toCents('1,005')` daba 100 por coma flotante; ahora redondea sobre el texto.
- Bug encontrado en la prueba de navegador: el formulario de cuenta no se abría desde el estado vacío de Inicio; ahora se abre solo si no hay cuentas.
- Capturas en `replica/clone-screens/` (390 px, claro y oscuro).
- Pruebas: 10 unitarias (dinero, hoja, saldos, semillas de la base) y un recorrido E2E manual con Playwright.

| M2+M3 todo lo demás (ver abajo) | 2026-10-23 | hecho | OCR de recibos, idiomas, push, buscador global de activos, avisos de metas | |

Qué entró en M2/M3: editar y borrar movimientos y buscador; ficha de cuenta; cartera completa (altas, compras/ventas, precio medio ponderado, ganancia realizada, bienes y deudas, donut por tipo); patrimonio total con divisas (BCE); evolución del patrimonio; estadísticas con periodos y salud; presupuestos y metas; recurrentes; categorías propias; copia JSON (validada, restauración atómica); CSV importar/exportar con vista previa y deshacer; PIN; iconos PNG; flujo de despliegue en `.github/workflows/deploy.yml` (solo se ejecuta en `main`).

Bugs que encontraron los tests y la prueba en navegador (todos corregidos):
- `toCents('1,005')` daba 100 por coma flotante.
- `1.000` (mil en español) se leía como 1: el saldo inicial salía mal. Ahora el punto con grupos de 3 cifras es separador de miles, y el CSV usa el punto siempre como decimal.
- El formulario de cuenta no se abría desde el estado vacío de Inicio.
- "Octubre De 2026" por capitalizar cada palabra.
- Bienes y deudas repetían su tipo en verde en la cartera.

Pruebas: 42 unitarias (dinero, hoja, saldos, precio medio y ventas parciales, divisas, periodos, estadísticas, presupuestos, recurrentes idempotentes, copia JSON con rollback, CSV, patrimonio) y un recorrido E2E de 29 comprobaciones en Chromium a 390 px, repetido 3 veces sin fallos ni errores de consola.

Limitaciones conocidas
- Los datos viven solo en el dispositivo; la copia JSON es la única protección contra pérdida.
- El PIN bloquea la interfaz pero no cifra IndexedDB.
- Frankfurter (BCE) no se pudo probar desde este entorno; la app funciona sin él si todo está en la moneda principal.
- Los precios de la hoja no incluyen divisa: los fondos de la hoja se asumen en EUR.
