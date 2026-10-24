import { describe, expect, it } from 'vitest';
import { generateServiceKeys } from './vapidKeys';

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const toB64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('claves del servicio de avisos', () => {
  it('genera un par VAPID válido: público de 65 bytes, privado de 32, y la firma se verifica', async () => {
    const k = await generateServiceKeys();
    const pub = fromB64url(k.publicKey), priv = fromB64url(k.privateKey);
    expect(pub).toHaveLength(65);
    expect(pub[0]).toBe(4);
    expect(priv).toHaveLength(32);
    // Se firma con la privada y se verifica con la pública, tal como hace el servicio con cada aviso.
    const signKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: toB64url(pub.slice(1, 33)), y: toB64url(pub.slice(33)), d: k.privateKey }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const data = new TextEncoder().encode('prueba');
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signKey, data);
    const verifyKey = await crypto.subtle.importKey('raw', pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, sig, data)).toBe(true);
  });
  it('cada vez da claves distintas y el código secreto es largo y sin símbolos raros', async () => {
    const a = await generateServiceKeys(), b = await generateServiceKeys();
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[\w-]{32}$/);
  });
});
