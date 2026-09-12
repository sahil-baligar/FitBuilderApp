/**
 * Client-side image preparation. Everything the app stores is a data URL, so
 * uploads are downscaled before they hit IndexedDB or the API.
 */

export const MAX_UPLOAD_EDGE = 1536;

export interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  mimeType: 'image/png' | 'image/jpeg';
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to decode image'));
    img.src = src;
  });

export const fileToDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Unable to read file'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

/** Cheap alpha probe: sample a grid of pixels rather than every one. */
const canvasHasAlpha = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const { data } = ctx.getImageData(0, 0, width, height);
  const stride = Math.max(1, Math.floor((width * height) / 20_000)) * 4;
  for (let i = 3; i < data.length; i += stride) {
    if (data[i] < 250) return true;
  }
  return false;
};

/**
 * Resize so the long edge is at most `maxEdge`. PNG/WebP sources that actually
 * use transparency stay PNG; everything else becomes JPEG at the given quality.
 */
export const prepareImage = async (
  source: Blob | string,
  { maxEdge = MAX_UPLOAD_EDGE, jpegQuality = 0.9 }: { maxEdge?: number; jpegQuality?: number } = {},
): Promise<PreparedImage> => {
  const src = typeof source === 'string' ? source : await fileToDataUrl(source);
  const img = await loadImage(src);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, width, height);

  const sourceType = typeof source === 'string' ? src.slice(5, src.indexOf(';')) : source.type;
  const mayHaveAlpha = sourceType === 'image/png' || sourceType === 'image/webp' || sourceType === 'image/gif';
  const hasAlpha = mayHaveAlpha && canvasHasAlpha(ctx, width, height);
  const mimeType = hasAlpha ? 'image/png' : 'image/jpeg';

  return {
    dataUrl: hasAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', jpegQuality),
    width,
    height,
    hasAlpha,
    mimeType,
  };
};
