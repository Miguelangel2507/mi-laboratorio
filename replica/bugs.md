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

## Segunda ronda (plan, programados y avisos)

| id | sev | qué pasaba | cómo se encontró | estado |
| --- | --- | --- | --- | --- |
| B6 | S1 | un gasto o recurrente con fecha futura se contaba hoy en el saldo y el patrimonio | lo detectó el usuario | corregido: lo futuro espera a su día; las reglas recurrentes no crean nada antes de su fecha de inicio |
| B7 | S2 | al generar las aportaciones del plan, un duplicado provocaba un error de clave que rompía las pantallas en vivo en Chrome (no en los tests con base simulada) | recorrido en navegador real | corregido: se comprueba antes de crear, dentro de una transacción |
| B8 | S3 | dije que la app avisaría de versiones nuevas, pero ese aviso no estaba construido | revisión propia | corregido: banner «Hay una versión nueva» |
| B9 | S4 | «Octubre De 2026» / «Tocaba El 1 Oct» (mayúsculas de más) | revisión de capturas | corregido |

Limitaciones: el aviso de versión nueva y las notificaciones push reales no se han podido probar en un iPhone real desde aquí.

## Tercera ronda (actualización de la app instalada)

| id | sev | qué pasaba | cómo se encontró | estado |
| --- | --- | --- | --- | --- |
| B10 | S2 | tras publicar una versión, el iPhone seguía mostrando la antigua: la versión nueva se quedaba «en espera» hasta cerrar del todo la app, y la versión instalada no tenía forma de avisar | lo detectó el usuario | corregido: la versión nueva se activa sola al descargarse; la app abierta ofrece «Actualizar» |

Comprobado en Chromium con la versión antigua abierta, publicando la nueva y reabriendo: se ve la nueva en la siguiente apertura, con los datos intactos; también desde el estado «versión intermedia en espera». No se ha podido probar en un iPhone real.

## Cuarta ronda (vibración)

| id | sev | qué pasaba | cómo se encontró | estado |
| --- | --- | --- | --- | --- |
| B11 | S4 | la opción «Vibración al tocar» no hacía vibrar el iPhone | lo detectó el usuario | resuelto retirando la opción: una pantalla de diagnóstico probó 6 métodos programáticos y solo vibró el interruptor nativo que toca el usuario. Apple no permite vibrar desde código web. Los interruptores de la app ahora son nativos de iOS (vibran solos) |

| B12 | S08 | al mezclar una foto real con un mes estimado salía −8,3 % falso | captura del recorrido E2E | resuelto: solo se usan datos de mercado si están ambos extremos del mes; si no, todo el mes se estima |
