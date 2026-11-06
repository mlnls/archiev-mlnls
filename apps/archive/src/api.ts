import type { Item, Listing } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `요청 실패 (${res.status})`, res.status);
  return data as T;
}

const json = (body: unknown): RequestInit => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  me: () => call<{ authed: boolean }>("/api/me"),
  login: (username: string, password: string) => call("/api/login", { method: "POST", ...json({ username, password }) }),
  logout: () => call("/api/logout", { method: "POST" }),
  list: () => call<Listing>("/api/items"),
  setMemo: (id: string, memo: string) => call<Item>(`/api/items/${id}`, { method: "PATCH", ...json({ memo }) }),
  remove: (id: string) => call(`/api/items/${id}`, { method: "DELETE" }),
  putThumb: (id: string, blob: Blob, width: number, height: number) =>
    call<Item>(`/api/items/${id}/thumb`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "X-Width": String(width), "X-Height": String(height) },
      body: blob,
    }),
};

/** 진행률을 받으려고 업로드만 XHR을 씁니다 */
export function uploadFile(file: File, onProgress: (ratio: number) => void): { promise: Promise<Item>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<Item>((resolve, reject) => {
    xhr.open("POST", "/api/items");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("X-File-Modified", String(file.lastModified || Date.now()));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* 비어 있는 응답 */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as Item);
      else reject(new ApiError(data.error ?? `업로드 실패 (${xhr.status})`, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("네트워크 오류로 올리지 못했습니다", 0));
    xhr.onabort = () => reject(new ApiError("취소했습니다", 0));
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}
