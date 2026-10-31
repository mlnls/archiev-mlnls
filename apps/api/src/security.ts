import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** 비밀번호 저장 형식: scrypt$<salt hex>$<hash hex> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 86_400;

const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

/** 세션 쿠키 값: `${만료시각}.${서명}`. 서버에 상태를 두지 않습니다 */
export function createSession(secret: string, now = Date.now()): string {
  const exp = String(Math.floor(now / 1000) + SESSION_MAX_AGE);
  return `${exp}.${sign(exp, secret)}`;
}

export function verifySession(value: string | undefined, secret: string, now = Date.now()): boolean {
  if (!value || !secret) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) * 1000 < now) return false;
  return safeEqual(sig, sign(exp, secret));
}

/** IP별 고정 윈도 제한. 프로세스 하나로 도는 개인 서버라 메모리로 충분합니다 */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    if (this.hits.size > 10_000) this.hits.clear();
    const cur = this.hits.get(key);
    if (!cur || cur.reset < now) {
      this.hits.set(key, { n: 1, reset: now + this.windowMs });
      return true;
    }
    cur.n++;
    return cur.n <= this.max;
  }
}

/** 파일 앞부분으로 이미지 형식을 판별합니다. SVG는 스크립트를 담을 수 있어 받지 않습니다 */
export function sniffImage(buf: Uint8Array): { ext: string; type: string } | null {
  const at = (i: number) => buf[i];
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return { ext: "png", type: "image/png" };
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return { ext: "gif", type: "image/gif" };
  const ascii = (a: number, b: number) => String.fromCharCode(...buf.slice(a, b));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", type: "image/webp" };
  return null;
}
