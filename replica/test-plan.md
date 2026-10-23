# Plan de pruebas

Automático (`cd app && npm test && npm run e2e`):

| área | cómo | qué cubre |
| --- | --- | --- |
| lógica | 46 tests unitarios (Vitest + IndexedDB simulada) | dinero y decimales, lectura de la hoja, saldos, transferencias (también entre divisas), precio medio y ventas parciales, periodos, estadísticas, presupuestos, recurrentes sin duplicar, copia JSON con marcha atrás, CSV, patrimonio con divisas |
| flujos | `app/e2e/smoke.mjs` en Chromium a 390 px, con la hoja y el BCE simulados | alta de cuentas, gasto/ingreso/transferencia, editar, borrar, buscar, recurrentes, presupuestos, metas y su aviso, inversiones y ventas, bienes y deudas, evolución, estadísticas, copia y restauración, CSV, PIN, divisas, aviso de instalación en iPhone, restauración desde la bienvenida |

Manual, en el iPhone real (no se puede automatizar aquí):
1. Instalar desde Safari (Compartir > Añadir a pantalla de inicio) y abrir desde el icono.
2. En Ajustes > Copia: «Instalada» = Sí y «Almacenamiento protegido» = Sí.
3. Hacer una copia con «Guardar copia» y guardarla en Archivos.
4. Modo avión: la app debe abrir y mostrar los datos.
5. Con la copia, probar «Empezar de cero» y restaurar desde la bienvenida.
6. Activar PIN, cerrar la app un minuto y volver a abrirla.
