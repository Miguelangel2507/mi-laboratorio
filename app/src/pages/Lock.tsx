import { useState } from 'react';
import { checkPin, setUnlocked } from '../lib/lock';

export default function Lock({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  return (
    <form className="mx-auto flex h-full max-w-[560px] flex-col justify-center gap-4 px-6" onSubmit={async (e) => {
      e.preventDefault();
      if (await checkPin(pin)) { setUnlocked(true); onUnlock(); } else { setError('PIN incorrecto.'); setPin(''); }
    }}>
      <h1 className="text-large-title">Bloqueado</h1>
      <input aria-label="PIN" autoFocus type="password" inputMode="numeric" className="field num text-center text-title" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
      {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
      <button className="btn-primary" type="submit">Desbloquear</button>
    </form>
  );
}
