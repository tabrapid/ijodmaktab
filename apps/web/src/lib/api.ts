/**
 * API bilan ishlash. Brauzer /api/* ga murojaat qiladi, Next.js esa so‘rovni NestJS serveriga
 * proksi qiladi — kirish cookie’si bitta manbada qoladi.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Maydonlar bo‘yicha xatolar (zod tekshiruvi). */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const result: Record<string, string> = {};
    for (const item of this.details as { path?: string; message?: string }[]) {
      if (item.path && item.message && !result[item.path]) result[item.path] = item.message;
    }
    return result;
  }
}

export const NETWORK_ERROR_MESSAGE = 'Internet aloqasi yo‘q yoki server javob bermayapti.';

type Body = unknown;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  let response: Response;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body !== undefined && !isForm ? { 'content-type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }
  const type = response.headers.get('content-type') ?? '';
  const data: unknown = type.includes('application/json') ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    const error = (data ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(
      response.status,
      error.code ?? 'ERROR',
      error.message ?? 'So‘rovni bajarishda xatolik yuz berdi.',
      error.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: Body = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: Body) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: Body) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, file: File, field = 'file') => {
    const form = new FormData();
    form.append(field, file);
    return request<T>('POST', path, form);
  },
};

/** So‘rov satrini yig‘adi: bo‘sh qiymatlar tashlab ketiladi, ro‘yxatlar vergul bilan. */
export function qs(params: Record<string, string | number | boolean | string[] | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function fileNameFrom(header: string | null, fallback: string) {
  if (!header) return fallback;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded?.[1]) return decodeURIComponent(encoded[1]);
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? fallback;
}

/** Faylni yuklab oladi (cookie bilan) va brauzerda saqlaydi. */
export async function downloadFile(path: string, fallbackName: string) {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
    throw new ApiError(response.status, error.code ?? 'ERROR', error.message ?? 'Faylni yuklab bo‘lmadi.');
  }
  saveBlob(await response.blob(), fileNameFrom(response.headers.get('content-disposition'), fallbackName));
}

export function downloadBase64(base64: string, fileName: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  saveBlob(new Blob([bytes], { type: mime }), fileName);
}

export const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Kutilmagan xatolik.';
