#!/usr/bin/env node
// 사용법: node scripts/hash-password.mjs '<비밀번호>'  → ADMIN_PASSWORD_HASH 값 출력
import { randomBytes, scryptSync } from "node:crypto";

const pw = process.argv[2];
if (!pw) {
  console.error("비밀번호를 인자로 넘겨 주세요");
  process.exit(1);
}
const salt = randomBytes(16);
console.log(`scrypt$${salt.toString("hex")}$${scryptSync(pw, salt, 64).toString("hex")}`);
