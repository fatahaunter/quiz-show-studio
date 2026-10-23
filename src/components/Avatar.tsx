import type { CSSProperties } from 'react';

/** Round profile picture, or the player's initial on their colour when they have none. */
export default function Avatar({ name, color, src, size = 34, className = '' }: { name: string; color: string; src?: string; size?: number | string; className?: string }) {
  const s: CSSProperties = { width: size, height: size, background: color, fontSize: typeof size === 'number' ? size * 0.45 : undefined };
  return (
    <span className={`avatar ${className}`} style={s} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : name[0]?.toUpperCase()}
    </span>
  );
}
