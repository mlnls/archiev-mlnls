import type { Item } from "./types";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)}${units[i]}`;
}

const monthFmt = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", timeZone: "Asia/Seoul" });
const dateFmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" });

export const formatDate = (ms: number) => dateFmt.format(ms);

/** 촬영(수정) 시각 기준으로 달마다 묶습니다. 입력이 최신순이면 묶음도 최신순입니다 */
export function groupByMonth(items: Item[]): { label: string; items: Item[] }[] {
  const groups: { label: string; items: Item[] }[] = [];
  for (const item of items) {
    const label = monthFmt.format(item.takenAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? m[1]!.toUpperCase() : "";
}

const THUMB_EDGE = 480;

function drawThumb(source: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  const scale = Math.min(1, THUMB_EDGE / Math.min(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
}

export interface Thumb {
  blob: Blob;
  width: number;
  height: number;
}

/** 브라우저가 열 수 있는 형식이면 미리보기를 만들고, 못 열면(HEIC 등) null */
export async function makeThumb(file: File): Promise<Thumb | null> {
  try {
    if (file.type.startsWith("image/")) {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const blob = await drawThumb(bmp, bmp.width, bmp.height);
      const out = blob && { blob, width: bmp.width, height: bmp.height };
      bmp.close();
      return out;
    }
    return await videoThumb(file);
  } catch {
    return null;
  }
}

function videoThumb(file: File): Promise<Thumb | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (v: Thumb | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 10_000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onerror = () => done(null);
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 10);
    };
    video.onseeked = async () => {
      const blob = await drawThumb(video, video.videoWidth, video.videoHeight);
      done(blob && { blob, width: video.videoWidth, height: video.videoHeight });
    };
    video.src = url;
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 클립보드에서 사진과 동영상만 꺼냅니다.
 * 캡처 이미지는 이름이 모두 image.png라서 붙여 넣은 시각으로 이름을 붙입니다.
 */
export function pastedFiles(data: DataTransfer | null, now = new Date()): File[] {
  if (!data) return [];
  const fromItems = [...(data.items ?? [])].filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter((f): f is File => !!f);
  const files = fromItems.length ? fromItems : [...(data.files ?? [])];
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  return files
    .filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"))
    .map((f, i, all) => {
      if (!/^image\.(png|jpe?g|gif|webp)$/i.test(f.name)) return f;
      const ext = f.name.split(".").pop()!.toLowerCase();
      const name = `붙여넣기 ${stamp}${all.length > 1 ? ` (${i + 1})` : ""}.${ext}`;
      return new File([f], name, { type: f.type, lastModified: now.getTime() });
    });
}
