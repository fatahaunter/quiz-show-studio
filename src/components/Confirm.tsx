import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Non-blocking replacement for window.confirm(). A native dialog freezes the whole page
 * (including incoming buzzes on the host), so every confirmation goes through this instead.
 */
export function useConfirm() {
  const [req, setReq] = useState<{ msg: string; done: (ok: boolean) => void } | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const ask = useCallback((msg: string) => new Promise<boolean>((done) => setReq({ msg, done })), []);

  const close = (ok: boolean) => {
    req?.done(ok);
    setReq(null);
  };

  useEffect(() => {
    if (!req) return;
    cancel.current?.focus(); // default focus is the safe choice
    const k = (e: KeyboardEvent) => e.key === 'Escape' && (req.done(false), setReq(null));
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [req]);

  const dialog = req && (
    <div className="modal-back" onClick={() => close(false)}>
      <div className="card modal" role="alertdialog" aria-modal="true" aria-label={req.msg} onClick={(e) => e.stopPropagation()}>
        <p style={{ fontSize: '1.1rem', marginTop: 0 }}>{req.msg}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button ref={cancel} className="btn" onClick={() => close(false)}>Cancel</button>
          <button className="btn bad" onClick={() => close(true)}>Confirm</button>
        </div>
      </div>
    </div>
  );
  return [ask, dialog] as const;
}
