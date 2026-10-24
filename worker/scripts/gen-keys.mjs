// Genera las claves del servicio de avisos. Se ejecuta una sola vez en tu ordenador:  npm run keys
import { webcrypto as crypto } from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const pub = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
const token = b64url(crypto.getRandomValues(new Uint8Array(24)));

console.log('\nCrea estos 4 SECRETOS en Cloudflare (Settings > Variables and Secrets > Add, tipo «Secret»). Guárdalos aparte.\n');
console.log('VAPID_PUBLIC_KEY  ', b64url(pub));
console.log('VAPID_PRIVATE_KEY ', jwk.d);
console.log('OWNER_TOKEN       ', token);
console.log('VAPID_SUBJECT      mailto:TU-CORREO@ejemplo.com   <- pon tu correo real');
console.log('\nEl OWNER_TOKEN es también el «código secreto» que pegarás en la app (Ajustes > Avisos).\n');
