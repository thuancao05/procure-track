const MAX_IMAGE_DIMENSION = 2200;
const MAX_IMAGE_SIZE_BYTES = 200 * 1024;
const JPEG_QUALITY = 0.82;
const JPEG_QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.42, 0.32, 0.22];
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
 * Resize and compress an image before upload to a maximum of 200 KB.
 */
export async function compressImageForUpload(file) {
  if (!file?.type?.startsWith('image/') && !isHeicFile(file)) return file;
  const normalizedFile = await convertHeicToJpeg(file);
  if (normalizedFile.size <= MAX_IMAGE_SIZE_BYTES) return normalizedFile;

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(normalizedFile);
    const image = new Image();

    image.onload = async () => {
      try {
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
        let width = Math.max(1, Math.round(image.width * scale));
        let height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');

        while (width > 0 && height > 0) {
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Không thể tạo canvas để nén ảnh.');
          context.drawImage(image, 0, 0, width, height);

          for (const quality of JPEG_QUALITIES) {
            const blob = await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, 'image/jpeg', quality));
            if (!blob || blob.size > MAX_IMAGE_SIZE_BYTES) continue;

            const baseName = normalizedFile.name.replace(/\.[^.]+$/, '') || 'image';
            resolve(new File([blob], `${baseName}.jpg`, {
              type: 'image/jpeg',
              lastModified: normalizedFile.lastModified,
            }));
            return;
          }

          width = Math.max(1, Math.floor(width * 0.8));
          height = Math.max(1, Math.floor(height * 0.8));
          if (width === 1 && height === 1) break;
        }
        reject(new Error('Không thể giảm ảnh xuống dưới 200 KB.'));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Không thể đọc ảnh để nén.'));
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
