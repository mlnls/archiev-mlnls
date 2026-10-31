import { describe, expect, it } from "vitest";
// @ts-expect-error 훅이 의존성 없이 돌도록 일반 JS로 둡니다
import { checkTitle, expectedScope, findSecret, isAutoMessage, isForbiddenFile, scopeOfFile } from "../convention.mjs";

describe("scopeOfFile", () => {
  it.each([
    ["apps/blog/src/app/page.tsx", "BLOG"],
    ["apps/cv/site/index.html", "CV"],
    ["apps/employ/src/App.tsx", "EMPLOY"],
    ["apps/employ-worker/src/main.ts", "EMPLOY"],
    ["apps/api/src/app.ts", "API"],
    ["packages/core/src/job.ts", "COMMON"],
    ["README.md", "COMMON"],
    [".github/workflows/ci.yml", "COMMON"],
  ])("%s → %s", (file, scope) => expect(scopeOfFile(file)).toBe(scope));
});

describe("expectedScope", () => {
  it("uses the app for many files in one app", () => {
    expect(expectedScope(["apps/blog/a.ts", "apps/blog/b.ts"])).toBe("BLOG");
  });

  it("treats the employ site and its worker as one scope", () => {
    expect(expectedScope(["apps/employ/a.ts", "apps/employ-worker/b.ts"])).toBe("EMPLOY");
  });

  it("uses COMMON across apps or with shared files", () => {
    expect(expectedScope(["apps/blog/a.ts", "apps/api/b.ts"])).toBe("COMMON");
    expect(expectedScope(["apps/blog/a.ts", "package.json"])).toBe("COMMON");
  });
});

describe("checkTitle", () => {
  const blog = ["apps/blog/a.ts"];

  it("accepts a matching title", () => {
    expect(checkTitle("[BLOG/feature] 댓글 추가", blog)).toBeNull();
    expect(checkTitle("[COMMON/ci] 배포 수정\n\n본문", ["a", "apps/api/b"])).toBeNull();
  });

  it.each(["댓글 추가", "[blog/feature] 소문자", "[BLOG/feat] 타입 오류", "[BLOG/feature]공백 없음", "[BLOG/feature] ", "[WEB/feature] 없는 범위"])("rejects %s", (title) => {
    expect(checkTitle(title, blog)).toContain("형식");
  });

  it("rejects a scope that disagrees with the files", () => {
    expect(checkTitle("[API/fix] 수정", blog)).toContain("[BLOG]");
    expect(checkTitle("[BLOG/fix] 수정", ["apps/blog/a", "apps/api/b"])).toContain("[COMMON]");
  });
});

describe("isAutoMessage", () => {
  it("skips git generated messages", () => {
    expect(isAutoMessage("Merge branch 'main'")).toBe(true);
    expect(isAutoMessage("수정")).toBe(false);
  });
});

describe("secret checks", () => {
  it.each([".env", "apps/api/.env", ".env.production", "key.pem", "deploy/server.key", "data/profile.local.json", "id_ed25519"])("forbids %s", (f) => {
    expect(isForbiddenFile(f)).toBe(true);
  });

  it.each([".env.example", "apps/api/src/env.ts", "README.md"])("allows %s", (f) => expect(isForbiddenFile(f)).toBe(false));

  it.each([
    ["-----BEGIN RSA " + "PRIVATE KEY-----", "개인 키"],
    ["-----BEGIN OPENSSH " + "PRIVATE KEY-----", "개인 키"],
    ["AKIA" + "ABCDEFGHIJKLMNOP", "AWS 액세스 키"],
    ["gho_" + "a".repeat(36), "GitHub 토큰"],
    ["sk-" + "ant-" + "a".repeat(30), "Anthropic 키"],
    ["fig" + "d_" + "a".repeat(30), "Figma 토큰"],
  ])("finds a secret", (text, kind) => expect(findSecret(text)).toBe(kind));

  it("ignores normal code", () => {
    expect(findSecret('const token = process.env.WORKER_TOKEN ?? "";')).toBeNull();
  });
});
