#!/usr/bin/env node
// 어떤 앱을 배포할지 정해 GitHub Actions 출력(apps=["cv",...])으로 내보냅니다.
import { execFileSync } from "node:child_process";

const DEPLOYABLE = ["cv", "blog", "employ", "api"];
const ALL_ZERO = /^0+$/;

function changedApps(before) {
  // 첫 push처럼 이전 커밋이 없으면 전부 배포합니다
  if (!before || ALL_ZERO.test(before)) return DEPLOYABLE;
  const out = execFileSync("pnpm", ["exec", "turbo", "ls", `--filter=...[${before}]`, "--output=json"], { encoding: "utf8" });
  const names = JSON.parse(out).packages.items.map((p) => p.name.replace("@archiev/", ""));
  const apps = new Set(DEPLOYABLE.filter((a) => names.includes(a)));
  // 이미지에 들어가지만 패키지 밖에 있는 공용 파일
  const files = execFileSync("git", ["diff", "--name-only", `${before}...HEAD`], { encoding: "utf8" }).split("\n");
  if (files.includes("deploy/nginx-static.conf")) {
    apps.add("cv");
    apps.add("employ");
  }
  return [...apps];
}

const { EVENT, INPUT_APPS, BEFORE } = process.env;
const apps = EVENT === "workflow_dispatch" ? INPUT_APPS.split(/\s+/).filter((a) => DEPLOYABLE.includes(a)) : changedApps(BEFORE);
console.log(`apps=${JSON.stringify(apps)}`);
