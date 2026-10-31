#!/usr/bin/env node
// husky commit-msg 훅: node check-commit.mjs <메시지 파일>
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkTitle, isAutoMessage } from "./convention.mjs";

const message = readFileSync(process.argv[2], "utf8");
if (isAutoMessage(message)) process.exit(0);

const files = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).split("\n").filter(Boolean);
const problem = checkTitle(message, files);
if (problem) {
  console.error(`\n커밋 메시지 오류\n  ${problem}\n`);
  process.exit(1);
}
