export interface ServiceKeys { publicKey: string; privateKey: string; token: string; }

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/**
 * Genera las claves del servicio de avisos en el propio dispositivo (nada sale de aquí).
 * publicKey/privateKey son el par VAPID (P-256); token es el código secreto que protege el servicio.
 */
export async function generateServiceKeys(): Promise<ServiceKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = new Uint8Array([4, ...fromB64url(jwk.x!), ...fromB64url(jwk.y!)]);
  return { publicKey: b64url(pub), privateKey: jwk.d!, token: b64url(crypto.getRandomValues(new Uint8Array(24))) };
}
