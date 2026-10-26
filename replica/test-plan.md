# Plan de pruebas

Automático (`cd app && npm test && npm run e2e`):

| área | cómo | qué cubre |
| --- | --- | --- |
| lógica | 69 tests unitarios (Vitest + IndexedDB simulada) | dinero y decimales, lectura de la hoja, saldos, transferencias (también entre divisas), precio medio y ventas parciales, periodos, estadísticas, presupuestos, recurrentes sin duplicar, copia JSON con marcha atrás, CSV, patrimonio con divisas |
| flujos | `app/e2e/smoke.mjs` en Chromium a 390 px, con la hoja y el BCE simulados | alta de cuentas, gasto/ingreso/transferencia, editar, borrar, buscar, recurrentes, presupuestos, metas y su aviso, inversiones y ventas, bienes y deudas, evolución, estadísticas, copia y restauración, CSV, PIN, divisas, aviso de instalación en iPhone, restauración desde la bienvenida |

| servicio de avisos | `cd worker && npm test`: 14 tests, y arranque real en el motor local de Cloudflare | horarios y zonas, cambio de hora, día 31, cifrado del aviso y firma VAPID comprobados descifrándolos como el móvil, seguridad (código, CORS, destinos permitidos), reintentos y suscripciones caducadas |

Manual, en el iPhone real (no se puede automatizar aquí):
1. Instalar desde Safari (Compartir > Añadir a pantalla de inicio) y abrir desde el icono.
2. En Ajustes > Copia: «Instalada» = Sí y «Almacenamiento protegido» = Sí.
3. Hacer una copia con «Guardar copia» y guardarla en Archivos.
4. Modo avión: la app debe abrir y mostrar los datos.
5. Con la copia, probar «Empezar de cero» y restaurar desde la bienvenida.
6. Activar PIN, cerrar la app un minuto y volver a abrirla.
7. Plan mensual: crear el plan, esperar al día (o poner el día de hoy) y confirmar una aportación cambiando la fecha.
8. Avisos: seguir `worker/README.md`, activar los avisos y pulsar «Enviar aviso de prueba» con la app cerrada.
9. Actualización: tras publicar una versión nueva, abrir la app (puede verse la anterior), cerrarla y reabrirla: debe salir la nueva sin pasos extra. Con la app ya abierta, la siguiente versión debe mostrar el banner «Hay una versión nueva · Actualizar».
10. Vibración al tocar: Ajustes > Preferencias > activar «Vibración al tocar» y pulsar «Probar el toque». Es experimental en iPhone (iOS 17.4 o superior); si no vibra, comprobar Ajustes > Sonidos y vibración > Respuesta háptica del sistema.
