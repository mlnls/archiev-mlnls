import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

/** 모노레포 루트(pnpm-workspace.yaml 위치)를 찾습니다 */
export function repoRoot(start = process.cwd()): string {
  let dir = start;
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

function migrationsDir() {
  return process.env.DB_MIGRATIONS_DIR ?? path.join(repoRoot(), "packages/db/drizzle");
}

/**
 * 접속 주소를 정합니다.
 * - DATABASE_URL 이 있으면 그대로 (libsql://… Turso, file:/abs/path.db 등)
 * - 없으면 로컬 SQLite 파일: DB_FILE (기본 .data/archiev.db), DB_FILE=memory 는 메모리 DB(테스트용)
 */
export function resolveDbUrl(env = process.env): { url: string; local: boolean } {
  if (env.DATABASE_URL) return { url: env.DATABASE_URL, local: env.DATABASE_URL.startsWith("file:") };
  if (env.DB_FILE === "memory") return { url: ":memory:", local: true };
  const file = path.resolve(repoRoot(), env.DB_FILE ?? ".data/archiev.db");
  mkdirSync(path.dirname(file), { recursive: true });
  return { url: `file:${file}`, local: true };
}

interface Holder {
  db?: Promise<Db>;
  close?: () => Promise<void>;
}
const g = globalThis as unknown as { __archievDb?: Holder };
const holder: Holder = (g.__archievDb ??= {});

async function create(): Promise<Db> {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const { migrate } = await import("drizzle-orm/libsql/migrator");

  const { url, local } = resolveDbUrl();
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
  if (local && url !== ":memory:") {
    // 웹과 배치가 같은 파일을 동시에 열어도 막히지 않도록
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
  }
  await client.execute("PRAGMA foreign_keys = ON");

  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: migrationsDir() });
  holder.close = async () => client.close();
  return db;
}

/** 프로세스당 하나의 DB 연결 (Next.js 개발 서버 HMR에서도 재사용) */
export function getDb(): Promise<Db> {
  holder.db ??= create().catch((e) => {
    holder.db = undefined;
    throw e;
  });
  return holder.db;
}

export async function closeDb() {
  const close = holder.close;
  holder.db = undefined;
  holder.close = undefined;
  await close?.();
}
