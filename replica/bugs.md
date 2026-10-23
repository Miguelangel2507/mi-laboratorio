# Bugs encontrados y corregidos

| id | sev | qué pasaba | cómo se encontró | estado |
| --- | --- | --- | --- | --- |
| B1 | S2 | `1,005` € se guardaba como 100 céntimos (coma flotante) | test unitario | corregido |
| B2 | S1 | `1.000` (mil) se leía como 1: saldos iniciales erróneos | recorrido en navegador | corregido |
| B3 | S3 | el formulario de cuenta no se abría desde el estado vacío de Inicio | recorrido en navegador | corregido |
| B4 | S4 | «Octubre De 2026» (mayúscula de más) | revisión de capturas | corregido |
| B5 | S4 | bienes y deudas repetían su tipo en verde | revisión de capturas | corregido |

Abiertos: ninguno S1 o S2.

Limitaciones conocidas (no son bugs, son decisiones): datos solo en el dispositivo; el PIN no cifra; precios de la hoja asumidos en EUR; sin OCR ni idiomas distintos del español.
