#!/usr/bin/env node
// husky pre-commit 훅과 CI: 키나 비밀값이 커밋에 들어가는 것을 막습니다.
//   node check-secrets.mjs          스테이징된 파일 검사
//   node check-secrets.mjs --all    저장소의 모든 추적 파일 검사
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { findSecret, isForbiddenFile } from "./convention.mjs";

const all = process.argv.includes("--all");
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const files = (all ? git("ls-files") : git("diff", "--cached", "--name-only", "--diff-filter=ACMR")).split("\n").filter(Boolean);

const problems = [];
for (const file of files) {
  if (isForbiddenFile(file)) {
    problems.push(`${file}: 커밋하면 안 되는 파일입니다`);
    continue;
  }
  let text;
  try {
    text = all ? readFileSync(file, "utf8") : git("show", `:${file}`);
  } catch {
    continue;
  }
  const kind = findSecret(text);
  if (kind) problems.push(`${file}: ${kind}로 보이는 값이 있습니다`);
}

if (problems.length) {
  console.error(`\n비밀값 검사 실패\n  ${problems.join("\n  ")}\n`);
  process.exit(1);
}
