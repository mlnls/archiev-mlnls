import { createHmac, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** 저장 형식: scrypt$<salt hex>$<hash hex> (scripts/hash-password.mjs로 만듭니다) */
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

export const SESSION_MAX_AGE = 30 * 86_400;

const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

/** 쿠키 값: `${만료시각}.${서명}`. 서버에 상태를 두지 않습니다 */
export function createSession(secret: string, now = Date.now()): string {
  const exp = String(Math.floor(now / 1000) + SESSION_MAX_AGE);
  return `${exp}.${sign(`archive:${exp}`, secret)}`;
}

export function verifySession(value: string | undefined, secret: string, now = Date.now()): boolean {
  if (!value || !secret) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) * 1000 < now) return false;
  return safeEqual(sig, sign(`archive:${exp}`, secret));
}

/** 실패한 로그인만 셉니다. 성공한 로그인 때문에 잠기지 않습니다 */
export class FailureLimiter {
  private fails = new Map<string, { n: number; reset: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  blocked(key: string, now = Date.now()): boolean {
    const cur = this.fails.get(key);
    return !!cur && cur.reset > now && cur.n >= this.max;
  }

  fail(key: string, now = Date.now()): void {
    if (this.fails.size > 10_000) this.fails.clear();
    const cur = this.fails.get(key);
    if (!cur || cur.reset < now) this.fails.set(key, { n: 1, reset: now + this.windowMs });
    else cur.n++;
  }

  clear(key: string): void {
    this.fails.delete(key);
  }
}
