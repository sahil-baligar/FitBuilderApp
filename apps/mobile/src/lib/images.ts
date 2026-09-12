import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';

export const MAX_LONG_EDGE = 1536;

export interface PickedImage {
  /** `file://` URI on native, data URL on web. */
  uri: string;
  width: number;
  height: number;
}

export type PickSource = 'camera' | 'library';

const isWeb = Platform.OS === 'web';

const resizeSpec = (width: number, height: number) => {
  if (!width || !height || Math.max(width, height) <= MAX_LONG_EDGE) return undefined;
  return width >= height ? { width: MAX_LONG_EDGE } : { height: MAX_LONG_EDGE };
};

/** Launches camera or library, then downsizes to a max 1536px long edge. */
export const pickImage = async (source: PickSource): Promise<PickedImage | null> => {
  if (source === 'camera') {
    if (isWeb) throw new Error('Camera capture is not available on web; choose from library instead.');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission was denied.');
  } else if (!isWeb) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('Photo library permission was denied.');
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 0.92,
    exif: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const resize = resizeSpec(asset.width, asset.height);
  const manipulated = await manipulateAsync(asset.uri, resize ? [{ resize }] : [], {
    compress: 0.9,
    format: SaveFormat.JPEG,
    base64: isWeb,
  });
  return {
    uri: isWeb && manipulated.base64 ? `data:image/jpeg;base64,${manipulated.base64}` : manipulated.uri,
    width: manipulated.width,
    height: manipulated.height,
  };
};

const mimeFromUri = (uri: string) => {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/png';
};

const extFromDataUrl = (dataUrl: string) => {
  const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,/.exec(dataUrl);
  const sub = m?.[1]?.toLowerCase();
  if (sub === 'jpeg' || sub === 'jpg') return 'jpg';
  if (sub === 'webp') return 'webp';
  return 'png';
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });

/** Any local image reference → data URL suitable for the API. */
export const toDataUrl = async (uri: string): Promise<string> => {
  if (!uri) throw new Error('No image to convert');
  if (uri.startsWith('data:')) return uri;
  if (isWeb || /^https?:/.test(uri)) {
    const res = await fetch(uri);
    return blobToDataUrl(await res.blob());
  }
  const file = new File(uri);
  const base64 = await file.base64();
  return `data:${mimeFromUri(uri)};base64,${base64}`;
};

const wardrobeDir = () => new Directory(Paths.document, 'wardrobe');

/**
 * Persist an image for long-term storage in a record.
 * Native: writes to `<documentDirectory>/wardrobe/<id>.<ext>` and returns the `file://` URI.
 * Web: returns the data URL unchanged (records keep data URLs on web).
 */
export const persistImage = async (dataUrlOrUri: string, id: string): Promise<string> => {
  if (isWeb) {
    return dataUrlOrUri.startsWith('data:') ? dataUrlOrUri : toDataUrl(dataUrlOrUri);
  }
  const dir = wardrobeDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

  // Already ours.
  if (dataUrlOrUri.startsWith(dir.uri)) return dataUrlOrUri;

  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');

  if (dataUrlOrUri.startsWith('data:')) {
    const ext = extFromDataUrl(dataUrlOrUri);
    const base64 = dataUrlOrUri.slice(dataUrlOrUri.indexOf(',') + 1);
    const target = new File(dir, `${safeId}.${ext}`);
    if (target.exists) target.delete();
    target.create();
    await target.write(base64, { encoding: 'base64' });
    return target.uri;
  }

  // Local file from picker/manipulator cache: copy into our directory.
  const source = new File(dataUrlOrUri);
  const ext = source.extension?.replace('.', '') || 'jpg';
  const target = new File(dir, `${safeId}.${ext}`);
  if (target.exists) target.delete();
  source.copy(target);
  return target.uri;
};

/** Best-effort cleanup of a persisted native file. No-op on web / non-file URIs. */
export const deletePersistedImage = async (uri?: string) => {
  if (!uri || isWeb || !uri.startsWith('file:')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    /* ignore */
  }
};
