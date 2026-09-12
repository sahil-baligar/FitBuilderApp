import sharp from 'sharp';
import type { ImageRef } from '@fitbuilder/core/contracts';

/** Max bytes we will accept for an inbound image (data URL or remote). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export interface LoadedImage {
  buffer: Buffer;
  mime: string;
}

export const isDataUrl = (ref: string): boolean => ref.startsWith('data:');
export const isHttpUrl = (ref: string): boolean => /^https?:\/\//i.test(ref);

export const parseDataUrl = (ref: string): LoadedImage => {
  const match = /^data:([^;,]+)?(;[^,]*)?,(.*)$/s.exec(ref);
  if (!match) throw new Error('Malformed data URL');
  const mime = match[1] || 'application/octet-stream';
  const isBase64 = (match[2] ?? '').includes('base64');
  const payload = match[3] ?? '';
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 20 MB limit');
  return { buffer, mime };
};

export const toDataUrl = (buffer: Buffer | Uint8Array, mime = 'image/png'): string =>
  `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;

export const sniffMime = (buf: Buffer): string => {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buf.length >= 6 && buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  return 'application/octet-stream';
};

/** Fetch an https image into memory with a timeout and a size cap. */
export const fetchImage = async (url: string, timeoutMs = 60_000): Promise<LoadedImage> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}) from ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('Remote image exceeds the 20 MB limit');
  const header = res.headers.get('content-type')?.split(';')[0]?.trim();
  const mime = header && header.startsWith('image/') ? header : sniffMime(buffer);
  return { buffer, mime };
};

/** Accept either wire form of an image and return bytes. */
export const loadImage = async (ref: ImageRef): Promise<LoadedImage> => {
  if (typeof ref !== 'string') throw new Error('Image must be a string');
  if (isDataUrl(ref)) return parseDataUrl(ref);
  if (isHttpUrl(ref)) return fetchImage(ref);
  throw new Error('Image must be a data URL or an http(s) URL');
};

/** Download a remote result (e.g. from fal) and return it as a data URL. */
export const fetchToDataUrl = async (url: string): Promise<string> => {
  const { buffer, mime } = await fetchImage(url);
  return toDataUrl(buffer, mime.startsWith('image/') ? mime : 'image/png');
};

export const toBlob = (img: LoadedImage): Blob =>
  new Blob([new Uint8Array(img.buffer)], { type: img.mime });

/** Normalise any supported input to PNG bytes (keeps alpha). */
export const toPng = async (buffer: Buffer): Promise<Buffer> => sharp(buffer).png().toBuffer();

/** Downscale for vision models: keeps aspect, never upsamples, flattens onto white. */
export const toVisionJpeg = async (buffer: Buffer, maxSide = 768): Promise<Buffer> =>
  sharp(buffer)
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 88 })
    .toBuffer();

/** Byte length of the payload inside a data URL (for logs). */
export const dataUrlBytes = (ref: string | undefined): number => {
  if (!ref || !isDataUrl(ref)) return 0;
  const comma = ref.indexOf(',');
  return comma === -1 ? 0 : Math.floor(((ref.length - comma - 1) * 3) / 4);
};
