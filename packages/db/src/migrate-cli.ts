import { closeDb, getDb, resolveDbUrl } from "./client";

// getDb()가 연결 시 마이그레이션을 적용합니다
await getDb();
console.log(`마이그레이션 완료 (${resolveDbUrl().url})`);
await closeDb();
