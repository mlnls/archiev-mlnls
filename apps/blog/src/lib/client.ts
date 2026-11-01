/** 브라우저에서 쓰는 API 호출. Caddy가 같은 오리진의 /api 를 API 서버로 넘깁니다 */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...rest,
    headers: json === undefined ? rest.headers : { "content-type": "application/json", ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? "요청을 처리하지 못했습니다");
  return data as T;
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.set("file", file);
  const { url } = await api<{ url: string }>("/admin/uploads", { method: "POST", body: form });
  return url;
}

export const formatDate = (iso: string | null) => {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }).format(new Date(iso));
};

/** 제목에서 주소를 만듭니다: 글자와 숫자만 남기고 나머지는 하이픈으로 */
export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
