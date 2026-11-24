const MAX_IMAGE_DIMENSION = 2200;
const JPEG_QUALITY = 0.82;
const IMAGE_PROCESSING_CONCURRENCY = 3;

const isHeicFile = (file) => {
  const name = String(file?.name ?? '').toLowerCase();
  const type = String(file?.type ?? '').toLowerCase();
  return type === 'image/heic' || type === 'image/heif' || /\.(heic|heif)$/.test(name);
};

async function convertHeicToJpeg(file) {
  if (!isHeicFile(file)) return file;

  const { default: heic2any } = await import('heic2any');
  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: JPEG_QUALITY,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}

/**
 * Resize and compress an image before upload while keeping OCR-readable detail.
 * Small images are returned unchanged when compression would not reduce size.
 */
export async function compressImageForUpload(file) {
  if (!file?.type?.startsWith('image/') && !isHeicFile(file)) return file;
  const normalizedFile = await convertHeicToJpeg(file);

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(normalizedFile);
    const image = new Image();

    image.onload = () => {
      try {
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        // Avoid converting already-small images when there is no meaningful resize.
        if (scale === 1 && normalizedFile.type === 'image/jpeg' && normalizedFile.size <= 1.5 * 1024 * 1024) {
          resolve(normalizedFile);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(image, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob || blob.size >= normalizedFile.size) {
            resolve(normalizedFile);
            return;
          }

          const baseName = normalizedFile.name.replace(/\.[^.]+$/, '') || 'image';
          resolve(new File([blob], `${baseName}.jpg`, {
            type: 'image/jpeg',
            lastModified: normalizedFile.lastModified,
          }));
        }, 'image/jpeg', JPEG_QUALITY);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(normalizedFile);
    };
    image.src = objectUrl;
  });
}

export async function compressImagesForUpload(files, concurrency = IMAGE_PROCESSING_CONCURRENCY) {
  const results = new Array(files.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await compressImageForUpload(files[index]);
    }
  };

  const workerCount = Math.min(Math.max(1, concurrency), files.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
