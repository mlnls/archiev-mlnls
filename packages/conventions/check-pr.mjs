#!/usr/bin/env node
// CI에서 PR 제목을 검사합니다: PR_TITLE, BASE_SHA, HEAD_SHA 환경 변수를 받습니다.
import { execFileSync } from "node:child_process";
import { checkTitle } from "./convention.mjs";

const { PR_TITLE = "", BASE_SHA, HEAD_SHA } = process.env;
const files = execFileSync("git", ["diff", "--name-only", `${BASE_SHA}...${HEAD_SHA}`], { encoding: "utf8" }).split("\n").filter(Boolean);
const problem = checkTitle(PR_TITLE, files);
if (problem) {
  console.error(`::error title=PR 제목 규칙::${problem.replaceAll("\n", "%0A")}`);
  process.exit(1);
}
console.log(`PR 제목 통과: ${PR_TITLE}`);
