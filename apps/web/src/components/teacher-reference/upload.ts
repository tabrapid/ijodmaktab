import { ApiError, NETWORK_ERROR_MESSAGE } from '@/lib/api';
import type { FileRef } from '@/lib/types';

export interface UploadTask {
  promise: Promise<FileRef>;
  abort: () => void;
}

/**
 * Hujjatni yopiq omborga yuklaydi (`POST /api/files`) va jarayonni foizda bildiradi — sekin mobil
 * internetda ham foydalanuvchi nima bo‘layotganini ko‘radi. Xatolar `api` bilan bir xil `ApiError`.
 */
export function uploadDocument(file: File, onProgress: (percent: number) => void): UploadTask {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<FileRef>((resolve, reject) => {
    xhr.open('POST', '/api/files');
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const body = (xhr.response ?? {}) as Partial<FileRef> & { code?: string; message?: string; details?: unknown };
      if (xhr.status >= 200 && xhr.status < 300 && body.id) {
        resolve(body as FileRef);
        return;
      }
      reject(
        new ApiError(
          xhr.status,
          body.code ?? (xhr.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'ERROR'),
          body.message ?? 'Faylni yuklab bo‘lmadi.',
          body.details,
        ),
      );
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE));
    xhr.onabort = () => reject(new ApiError(0, 'ABORTED', 'Yuklash bekor qilindi.'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}
