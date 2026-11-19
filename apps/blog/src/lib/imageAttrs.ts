/**
 * 이미지의 폭과 정렬은 마크다운에 자리가 없어서 주소 뒤 #w=60&a=left 로 적습니다.
 * 브라우저는 # 뒤를 서버로 보내지 않으므로 이미지는 그대로 열리고, 다른 마크다운 도구에서도 이미지로 읽힙니다.
 */
export type ImageAlign = "left" | "center" | "right";

export interface ImageLayout {
  /** 글 폭에 대한 백분율. null이면 원래 크기(글 폭을 넘지 않음) */
  width: number | null;
  align: ImageAlign;
}

export const MIN_WIDTH = 10;

const clampWidth = (value: number) => Math.min(100, Math.max(MIN_WIDTH, Math.round(value)));

export function splitImageSrc(src: string): ImageLayout & { url: string } {
  const hash = src.indexOf("#");
  if (hash < 0) return { url: src, width: null, align: "center" };
  const params = new URLSearchParams(src.slice(hash + 1));
  const w = Number(params.get("w"));
  const a = params.get("a");
  // 우리가 쓰는 키가 하나도 없으면 원래 주소의 # 그대로 둡니다
  if (!params.has("w") && !params.has("a")) return { url: src, width: null, align: "center" };
  return {
    url: src.slice(0, hash),
    width: Number.isFinite(w) && w > 0 ? clampWidth(w) : null,
    align: a === "left" || a === "right" ? a : "center",
  };
}

export function joinImageSrc(url: string, { width, align }: ImageLayout): string {
  const parts: string[] = [];
  if (width && width < 100) parts.push(`w=${clampWidth(width)}`);
  if (align !== "center" && width && width < 100) parts.push(`a=${align}`);
  return parts.length ? `${url}#${parts.join("&")}` : url;
}

/** 우리 서버에 올린 이미지인지. 아니면 붙여 넣은 뒤 서버로 옮깁니다 */
export const isOwnUpload = (src: string) => src.startsWith("/api/uploads/");

/** 브라우저 밖에서는 열 수 없는 주소 (노션의 attachment:, 다른 탭의 blob:) */
export const isUnreachable = (src: string) => !/^(?:https?:|\/|data:image\/|blob:)/i.test(src);
