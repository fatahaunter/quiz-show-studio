/** Profile pictures: tiny square JPEGs (a few KB) so they travel over the data channel and fit in storage. */
export const AVATAR_PX = 128;
export const AVATAR_MAX_CHARS = 30_000;
export const AVATAR_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export const isAvatar = (s: unknown): s is string => typeof s === 'string' && s.length <= AVATAR_MAX_CHARS && AVATAR_RE.test(s);

export const EMOJI_AVATARS = ['😀', '😎', '🤓', '🥳', '🤠', '🦊', '🐼', '🐯', '🐸', '🦄', '🚀', '⚡', '🔥', '🎸', '⚽', '🍕'];

/** Centre-crops any image the player picks (camera or gallery) to a square and shrinks it. */
export async function fileToAvatar(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const cv = document.createElement('canvas');
  cv.width = cv.height = AVATAR_PX;
  cv.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  bmp.close?.();
  return shrink(cv);
}

/** An emoji on a coloured square, for people who don't want to use a photo. */
export function emojiAvatar(emoji: string, color: string): string {
  const cv = document.createElement('canvas');
  cv.width = cv.height = AVATAR_PX;
  const g = cv.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
  g.font = `${AVATAR_PX * 0.64}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, AVATAR_PX / 2, AVATAR_PX / 2 + AVATAR_PX * 0.04);
  return shrink(cv);
}

function shrink(cv: HTMLCanvasElement): string {
  for (const q of [0.82, 0.6, 0.4]) {
    const url = cv.toDataURL('image/jpeg', q);
    if (url.length <= AVATAR_MAX_CHARS) return url;
  }
  throw new Error('Image too detailed');
}
