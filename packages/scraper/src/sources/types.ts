import type { JobDescription, JobSource, NormalizedJob } from "@archiev/core";

export interface SourceContext {
  maxPages: number;
  delayMs: number;
  /** 로그 출력 */
  log: (msg: string) => void;
}

export interface SourceAdapter {
  id: JobSource;
  /** 환경 변수(키 존재 여부, on/off)로 사용 가능 여부 판단 */
  enabled(env: NodeJS.ProcessEnv): boolean;
  /** 목록 수집. 소스 내부에서 직무별/키워드별로 여러 번 호출하고 중복 제거한 결과 */
  list(ctx: SourceContext): Promise<NormalizedJob[]>;
  /** 상세 본문 수집 (없으면 목록 정보만 사용) */
  detail?(job: NormalizedJob, ctx: SourceContext): Promise<NormalizedJob>;
  /** 한 번의 배치에서 상세를 조회할 최대 개수 */
  detailLimit?: number;
  /**
   * 최신순 검색 일부만 읽는 소스는 목록에서 밀렸다고 마감된 것이 아닙니다.
   * 이 일수 동안 안 보였을 때만 마감 처리합니다 (없으면 이번 수집에 안 보이면 바로 마감).
   */
  unseenGraceDays?: number;
}

/** "2026-11-23T23:59:59" 처럼 시간대 없는 한국 시각을 ISO로 */
export function kstToIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim().replace(" ", "T");
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(t)) return new Date(t).toISOString();
  const withTime = /T\d{2}:\d{2}/.test(t) ? t : `${t}T23:59:59`;
  const d = new Date(`${withTime}+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function cleanText(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s
    .replace(/\r\n?/g, "\n")
    .replace(/[​ ]/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t || null;
}

export function envFlag(v: string | undefined, dflt = true): boolean {
  if (v == null || v === "") return dflt;
  return !/^(0|false|off|no)$/i.test(v.trim());
}

/** HTML 엔티티를 풉니다 (Greenhouse 본문은 두 번 인코딩된 경우가 있어 2회 적용) */
export function decodeEntities(s: string | null | undefined): string {
  if (!s) return "";
  let t = s;
  for (let i = 0; i < 2; i++) {
    t = t
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#x27;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  }
  return t;
}

/** 블록 태그를 줄바꿈으로 바꾼 뒤 태그를 지웁니다 */
export function htmlToText(html: string | null | undefined): string | null {
  const t = decodeEntities(html)
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ");
  return cleanText(t);
}

/**
 * 개발·인프라·데이터 계열 직무인지 (대기업 채용 페이지처럼 전 직군이 섞인 소스를 거를 때)
 * 제목과 직무 분류명을 함께 봅니다. 매칭 점수는 core가 따로 매기므로 여기서는 넓게 잡습니다.
 */
const TECH_ROLE =
  /개발|엔지니어|engineer|developer|프론트|front[\s-]?end|백엔드|back[\s-]?end|서버|server|풀\s?스택|full[\s-]?stack|devops|(?<![a-z])sre(?![a-z])|인프라|infra|클라우드|cloud|플랫폼|platform|네트워크|network|(?<![a-z])nw(?![a-z])|보안|security|데이터|data|(?<![a-z])(ai|ml)(?![a-z])|머신\s?러닝|machine learning|웹|web|앱|(?<![a-z])app(?![a-z])|ios|android|안드로이드|qa|(?<![a-z])tech(?![a-z])|software|소프트웨어|시스템|system|dba|it·인터넷/i;

export function isTechRole(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && TECH_ROLE.test(t));
}

/** 국내 근무지인지 (글로벌 채용 보드에서 해외 공고를 거를 때). 비어 있으면 국내로 봅니다 */
export function isKoreaLocation(name: string | null | undefined): boolean {
  if (!name || !name.trim()) return true;
  return /korea|seoul|bundang|pangyo|seongnam|한국|서울|판교|성남|분당|경기|부산|대전|대구|광주|인천|수원|원격|remote.*korea/i.test(name);
}

const SECTION_HEADS: [keyof Omit<JobDescription, "intro">, RegExp][] = [
  ["responsibilities", /담당\s?업무|주요\s?업무|하는\s?일|하게\s?될\s?(일|업무)|함께\s?할\s?업무|업무\s?내용|responsibilit|what you('|’)?ll do|what you will do|role|the job|key tasks/i],
  ["preferred", /우대|더\s?좋아요|있으면\s?좋|nice to have|preferred|bonus|plus/i],
  ["qualifications", /자격\s?요건|지원\s?자격|필수|이런\s?분|찾고\s?있어요|함께하고\s?싶어요|qualification|requirement|what you('|’)?ll need|who you are|what we('|’)?re looking for|minimum|must have/i],
  ["process", /채용\s?절차|전형|합류\s?여정|프로세스|hiring process|interview process|process/i],
  ["benefits", /복지|혜택|benefit|perks|what we offer/i],
];

/**
 * 제목 줄(짧은 줄)을 기준으로 본문을 JobDescription 칸으로 나눕니다.
 * 어느 칸에도 해당하지 않으면 소개(intro)에 둡니다. 칸을 하나도 못 찾으면 전체를 qualifications에 넣어
 * 스킬 추출이 본문 전체를 보게 합니다.
 */
export function splitSections(text: string | null | undefined): JobDescription | null {
  if (!text?.trim()) return null;
  const buckets: Record<keyof JobDescription, string[]> = {
    intro: [],
    responsibilities: [],
    qualifications: [],
    preferred: [],
    benefits: [],
    process: [],
  };
  let cur: keyof JobDescription = "intro";
  let found = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bare = line.replace(/^[#*\-\s[\]【】■●▶︎•]+|[:：\]】]+$/g, "").trim();
    if (bare && bare.length <= 40) {
      const hit = SECTION_HEADS.find(([, re]) => re.test(bare));
      if (hit) {
        cur = hit[0];
        found = true;
        continue;
      }
    }
    buckets[cur].push(raw);
  }
  const join = (k: keyof JobDescription) => cleanText(buckets[k].join("\n"));
  if (!found) return { intro: null, qualifications: cleanText(text) };
  return {
    intro: join("intro"),
    responsibilities: join("responsibilities"),
    qualifications: join("qualifications"),
    preferred: join("preferred"),
    benefits: join("benefits"),
    process: join("process"),
  };
}
