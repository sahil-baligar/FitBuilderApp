import { removeBackground } from '@imgly/background-removal';

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to convert blob'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });

export const stripBackground = async (file: File): Promise<string> => {
  const cleanedBlob = await removeBackground(file, {
    debug: import.meta.env.DEV,
  });
  return blobToDataUrl(cleanedBlob);
};

