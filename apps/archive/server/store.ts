import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, statfs, writeFile } from "node:fs/promises";
import path from "node:path";

export type Kind = "image" | "video";

export interface Item {
  id: string;
  name: string;
  type: string;
  kind: Kind;
  size: number;
  /** 파일의 수정 시각(대개 촬영 시각). 없으면 올린 시각 */
  takenAt: number;
  uploadedAt: number;
  memo: string;
  thumb: boolean;
  width?: number;
  height?: number;
}

export const ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;
/** SVG는 스크립트를 담을 수 있어 받지 않습니다 */
const TYPE_PATTERN = /^(image|video)\/[a-z0-9.+-]{1,60}$/;

export function kindOf(type: string): Kind | null {
  if (!TYPE_PATTERN.test(type) || type === "image/svg+xml") return null;
  return type.startsWith("image/") ? "image" : "video";
}

/** 파일 목록은 JSON 하나에 둡니다. 혼자 쓰는 아카이브라 수만 건까지 충분합니다 */
export class Store {
  private items: Item[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  readonly filesDir: string;
  private indexFile: string;

  constructor(readonly dir: string) {
    this.filesDir = path.join(dir, "files");
    this.indexFile = path.join(dir, "index.json");
  }

  async init() {
    await mkdir(this.filesDir, { recursive: true });
    try {
      this.items = JSON.parse(await readFile(this.indexFile, "utf8")).items ?? [];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return this;
  }

  newId() {
    return randomBytes(9).toString("base64url");
  }

  filePath(id: string) {
    return path.join(this.filesDir, id);
  }

  thumbPath(id: string) {
    return path.join(this.filesDir, `${id}.thumb.jpg`);
  }

  list(): Item[] {
    return [...this.items].sort((a, b) => b.takenAt - a.takenAt || b.uploadedAt - a.uploadedAt);
  }

  get(id: string): Item | undefined {
    return this.items.find((i) => i.id === id);
  }

  async freeBytes(): Promise<number> {
    const s = await statfs(this.dir);
    return s.bavail * s.bsize;
  }

  /** 목록 변경은 한 번에 하나씩, 임시 파일에 쓴 뒤 바꿔치기해서 중간에 꺼져도 깨지지 않게 합니다 */
  private mutate<T>(fn: () => T): Promise<T> {
    const run = this.queue.then(async () => {
      const result = fn();
      const tmp = `${this.indexFile}.tmp`;
      await writeFile(tmp, JSON.stringify({ items: this.items }));
      await rename(tmp, this.indexFile);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  add(item: Item) {
    return this.mutate(() => {
      this.items.push(item);
      return item;
    });
  }

  update(id: string, patch: Partial<Pick<Item, "memo" | "thumb" | "width" | "height">>) {
    return this.mutate(() => {
      const item = this.items.find((i) => i.id === id);
      if (item) Object.assign(item, patch);
      return item;
    });
  }

  async remove(id: string) {
    const removed = await this.mutate(() => {
      const before = this.items.length;
      this.items = this.items.filter((i) => i.id !== id);
      return this.items.length !== before;
    });
    if (removed) {
      await rm(this.filePath(id), { force: true });
      await rm(this.thumbPath(id), { force: true });
    }
    return removed;
  }
}
