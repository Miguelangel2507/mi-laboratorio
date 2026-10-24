# Servicio de avisos (Cloudflare)

Una función pequeña y gratuita que manda las notificaciones al iPhone a la hora que indicas.
**No recibe nunca tus importes, saldos ni nombres de fondos**: solo guarda la suscripción de tu móvil
y textos genéricos como «Hoy toca tu plan de inversión».

Sin este servicio la app funciona igual; solo faltan las notificaciones con la app cerrada.

## Qué necesitas
- Una cuenta gratuita de Cloudflare (https://dash.cloudflare.com/sign-up).
- La app instalada en la pantalla de inicio del iPhone (iOS 16.4 o superior).

## Paso 1 — Genera tus claves (en un ordenador con Node)
```bash
cd worker
npm install
npm run keys
```
Te imprime 4 valores. Guárdalos en un sitio seguro: se usan en el paso 3.

## Paso 2 — Conecta el repositorio con Cloudflare
1. En Cloudflare: **Workers & Pages > Create > Import a repository** (conecta tu cuenta de GitHub si te lo pide).
2. Elige este repositorio y la rama `main`.
3. En **Root directory** escribe `worker`. Deja el resto por defecto (el comando de despliegue es `npx wrangler deploy`).
4. Pulsa **Save and Deploy**. Cada vez que cambies algo en `worker/` y lo fusiones en `main`, se vuelve a desplegar solo.
5. El espacio de datos «KV» se crea solo al desplegar. Si Cloudflare pide un identificador, crea uno en **Storage & databases > KV > Create** llamado `avisos`, y pega su id en `worker/wrangler.toml` (línea `id = "..."` bajo `[[kv_namespaces]]`).

Al terminar verás la dirección del servicio, algo como `https://mi-patrimonio-avisos.TU-USUARIO.workers.dev`.

## Paso 3 — Pon los 4 secretos
En el Worker: **Settings > Variables and Secrets > Add**, tipo **Secret**:

| Nombre | Valor |
| --- | --- |
| `VAPID_PUBLIC_KEY` | el que imprimió `npm run keys` |
| `VAPID_PRIVATE_KEY` | el que imprimió `npm run keys` |
| `OWNER_TOKEN` | el que imprimió `npm run keys` (es tu código secreto) |
| `VAPID_SUBJECT` | `mailto:` + tu correo real, por ejemplo `mailto:yo@correo.com` |

Pulsa **Deploy** para que los aplique.

## Paso 4 — Actívalo en la app
En el iPhone, **abriendo la app desde el icono**: Ajustes > Avisos y notificaciones.
1. Pega la dirección del servicio y el `OWNER_TOKEN` como código secreto.
2. Elige la hora y qué quieres que te avise.
3. Pulsa **Activar avisos** y acepta el permiso.
4. Pulsa **Enviar aviso de prueba**: debería llegarte en unos segundos. Prueba también con la app cerrada.

## Seguridad
- Solo tu web (`ALLOWED_ORIGIN` en `wrangler.toml`) puede hablar con el servicio, y todo lo que escribe exige tu código secreto.
- Solo se aceptan suscripciones de los servicios de push de Apple, Google, Mozilla y Microsoft.
- Si pierdes el móvil o sospechas del código: cambia `OWNER_TOKEN` en Cloudflare y vuelve a activarlo en la app.
- Los avisos no son confidenciales: viajan cifrados hasta el móvil, pero el texto aparece en la pantalla de bloqueo.

## Si algo falla
- «No se pudo conectar»: revisa la dirección (debe empezar por `https://`) y que el Worker esté desplegado.
- «El código secreto no coincide»: copia el `OWNER_TOKEN` otra vez, sin espacios.
- No llega nada: comprueba en Ajustes del iPhone > Notificaciones que la app tiene permiso, y que la abriste desde el icono.
- Si desinstalaste la app: vuelve a activar los avisos; la suscripción antigua se descarta sola.

## Desarrollo
```bash
npm test         # 14 pruebas, incluido el cifrado del aviso y la firma
npm run typecheck
npm run dev      # servicio local en http://localhost:8787
```
