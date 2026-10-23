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
