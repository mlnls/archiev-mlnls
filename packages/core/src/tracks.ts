import type { TrackId } from "./profile";
import { skillDef } from "./skills";

export interface TrackDef {
  id: TrackId;
  label: string;
  /** 소스의 직무 분류명에 들어 있으면 강한 신호 */
  categoryPatterns: RegExp[];
  /** 공고 제목에 들어 있으면 강한 신호 */
  titlePatterns: RegExp[];
}

export const TRACKS: Record<TrackId, TrackDef> = {
  frontend: {
    id: "frontend",
    label: "프론트엔드",
    categoryPatterns: [/프론트엔드/, /front[\s-]?end/i, /웹\s?퍼블리셔/, /크로스플랫폼/, /웹 개발자/, /웹 풀스택/],
    titlePatterns: [
      /프론트/,
      /front[\s-]?end/i,
      /(?<![a-z])fe(?![a-z])/i,
      /웹\s?(개발|퍼블리)/,
      /react(?![\s-]?native)/i,
      /next\.?js/i,
      /react[\s-]?native|앱\s?개발|크로스\s?플랫폼/i,
      /풀\s?스택|full[\s-]?stack/i,
    ],
  },
  infra: {
    id: "infra",
    label: "인프라/DevOps",
    categoryPatterns: [/devops/i, /시스템/, /인프라/, /클라우드/, /네트워크/, /sre/i, /플랫폼/],
    titlePatterns: [
      /devops|dev\s?ops|devsecops/i,
      /(?<![a-z])sre(?![a-z])/i,
      /인프라|infra/i,
      /클라우드|cloud/i,
      /플랫폼\s?엔지니어|platform\s?engineer/i,
      /시스템\s?(엔지니어|운영|관리)/,
      /배포|ci\/cd|쿠버네티스|kubernetes/i,
    ],
  },
};

/** 스킬 묶음이 어느 트랙 쪽인지 (0~1) */
export function skillTrackShare(skillKeys: Iterable<string>, track: TrackId): number {
  let total = 0;
  let hit = 0;
  for (const k of skillKeys) {
    const d = skillDef(k);
    if (!d || d.track === "common") continue;
    total++;
    if (d.track === track) hit++;
  }
  return total === 0 ? 0 : hit / total;
}
