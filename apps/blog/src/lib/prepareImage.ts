/**
 * 올리기 전에 브라우저에서 이미지를 줄입니다.
 * 휴대폰 사진은 5MB를 넘기 쉽고, 글에서는 2400px보다 크게 보일 일이 없습니다.
 * 브라우저가 열 수 있으면 HEIC 같은 형식도 WebP로 바꿔서 올라갑니다.
 */
export const UPLOAD_LIMIT = 5 * 1024 * 1024;
const MAX_SIDE = 2400;
/** 이보다 작고 크기도 적당하면 손대지 않고 원본을 올립니다 */
const KEEP_BELOW = 1.5 * 1024 * 1024;
const PASS_THROUGH = new Set(["image/png", "image/jpeg", "image/webp"]);

/** 긴 변이 max를 넘지 않게 줄인 크기 */
export function fitWithin(width: number, height: number, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

const renamed = (name: string, type: string) => {
  const ext = type === "image/webp" ? "webp" : type === "image/png" ? "png" : "jpg";
  return `${name.replace(/\.[^.]+$/, "") || "image"}.${ext}`;
};

async function encode(bitmap: ImageBitmap, max: number, original: File): Promise<File | null> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  for (const quality of [0.86, 0.72]) {
    let blob = await toBlob(canvas, "image/webp", quality);
    // WebP로 저장하지 못하는 브라우저는 PNG를 돌려줍니다
    if (blob?.type !== "image/webp") blob = original.type === "image/png" ? await toBlob(canvas, "image/png") : await toBlob(canvas, "image/jpeg", quality);
    if (blob && blob.size <= UPLOAD_LIMIT) return new File([blob], renamed(original.name, blob.type), { type: blob.type });
  }
  return null;
}

export async function prepareImage(file: File): Promise<File> {
  // 움직이는 GIF는 캔버스를 거치면 멈추므로 그대로 올립니다
  if (file.type === "image/gif") {
    if (file.size > UPLOAD_LIMIT) throw new Error("GIF는 5MB 이하만 올릴 수 있습니다");
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (PASS_THROUGH.has(file.type) && file.size <= UPLOAD_LIMIT) return file;
    throw new Error("이 브라우저에서 열 수 없는 이미지입니다. PNG, JPG, WebP로 바꿔서 올려 주세요");
  }

  try {
    const { scale } = fitWithin(bitmap.width, bitmap.height);
    if (PASS_THROUGH.has(file.type) && scale === 1 && file.size <= KEEP_BELOW) return file;
    const out = (await encode(bitmap, MAX_SIDE, file)) ?? (await encode(bitmap, 1600, file));
    if (!out) throw new Error("이미지를 5MB 이하로 줄이지 못했습니다");
    // 줄였는데 오히려 커졌으면 원본이 낫습니다
    return out.size < file.size || !PASS_THROUGH.has(file.type) || file.size > UPLOAD_LIMIT ? out : file;
  } finally {
    bitmap.close();
  }
}

export async function dataUrlToFile(dataUrl: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], renamed("pasted", blob.type), { type: blob.type });
}
