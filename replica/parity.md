## Parity: 95.0 / 100

features 95.0  (32 counted, must-haves 10 of 10 done)

## By area, weakest first
- nativo                         0.0  (1 features)
- avisos                        50.0  (1 features)
- divisas                       75.0  (2 features)
- privacidad                    75.0  (2 features)
- movimientos                  100.0  (4 features)
- cuentas                      100.0  (2 features)
- patrimonio                   100.0  (3 features)
- inversiones                  100.0  (6 features)
- estadísticas                 100.0  (3 features)
- presupuestos                 100.0  (1 features)
- metas                        100.0  (1 features)
- automatización               100.0  (1 features)
- datos                        100.0  (2 features)
- ajustes                      100.0  (1 features)
- engagement                   100.0  (1 features)
- cuenta                       100.0  (1 features)

## Missing, in build order
- [should] divisas: 62 divisas con conversión diaria, partial  (31 divisas del BCE (las que se pueden convertir))
- [should] privacidad: Bloqueo biométrico, partial  (PIN (no hay biometría en una PWA); no cifra los datos)
- [could] nativo: Widgets en pantalla de inicio, no  (solo app nativa)
- [could] avisos: Notificaciones y recordatorios, partial  (avisos dentro de la app + push opcional con un servicio gratuito en Cloudflare (código y tests hechos; falta probarlo en el iPhone real))

## Left out on purpose (not scored)
- Alta con Apple / Google / email: no hay cuentas: app local de uso personal
- Preguntas de alta (alias objetivo moneda avisos): sin cuentas ni alias: app local; solo se pide la moneda
- Cartera de cripto con precio automático: decisión del usuario: no sigue cripto; se puede añadir con precio manual
- Escanear recibo con OCR local: descartado: el OCR en el navegador exige descargar modelos grandes y rinde poco
- 6 idiomas: decisión: uso personal, solo español
- Registro por doble toque trasero (iPhone): solo nativo iOS; no replicable
- Registro automático con Apple Pay / Google Wallet: solo nativo
- Logo marca mascota y textos de Neto: propiedad de Neto; uso nombre y arte propios

## Yours, not in the original (not scored)
- Conexión bancaria
- Copia JSON, protección contra el borrado de iOS y restauración desde la bienvenida
- Movimientos con fecha futura (programados)
- Plan de inversión mensual con confirmación una a una
- Barra de navegación flotante
- Aviso de versión nueva de la app
