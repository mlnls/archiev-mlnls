import type { NormalizedJob } from "./job";
import { careerYears, type Profile, type TrackId } from "./profile";
import { extractSkills, normalizeSkill, normalizeSkillList, skillLabel } from "./skills";
import { TRACKS, skillTrackShare } from "./tracks";

export interface MatchBreakdown {
  track: number; // 0~30
  skill: number; // 0~40
  career: number; // 0~20
  location: number; // 0~5
  freshness: number; // 0~5
}

export interface MatchResult {
  jobId: string;
  score: number;
  track: TrackId | null;
  trackStrength: Record<TrackId, number>;
  breakdown: MatchBreakdown;
  matchedSkills: string[];
  missingSkills: string[];
  missingPreferred: string[];
  reasons: string[];
  warnings: string[];
  excluded: boolean;
  excludeReason: string | null;
}

/** 거의 모든 공고에 붙는 기본기 스킬: 커버리지 가중치를 낮추고 '부족한 스킬'에서 뺍니다 */
const TRIVIAL = new Set(["git", "jira", "figma", "html", "css", "javascript"]);

/** 비슷한 기술을 쓸 줄 알면 일부 인정 (보유 스킬 → 대상 스킬, 인정 비율) */
const SIBLINGS: [string, string, number][] = [
  ["react", "vue", 0.35],
  ["react", "angular", 0.3],
  ["react", "svelte", 0.35],
  ["nextjs", "nuxt", 0.35],
  ["react-native", "flutter", 0.2],
  ["zustand", "redux", 0.5],
  ["zustand", "recoil", 0.6],
  ["zustand", "jotai", 0.6],
  ["react-query", "swr", 0.6],
  ["aws", "gcp", 0.4],
  ["aws", "azure", 0.4],
  ["aws", "ncp", 0.45],
  ["github-actions", "jenkins", 0.5],
  ["jenkins", "github-actions", 0.6],
  ["github-actions", "cicd", 0.8],
  ["jenkins", "cicd", 0.8],
  ["cloudformation", "terraform", 0.5],
  ["docker", "kubernetes", 0.25],
  ["jest", "vitest", 0.7],
  ["vitest", "jest", 0.7],
  ["webpack", "vite", 0.6],
  ["emotion", "styled-components", 0.8],
  ["styled-components", "emotion", 0.8],
];

export interface MatchOptions {
  now?: Date;
  /** 공고를 처음 본 시각 (소스가 게시일을 안 주는 경우 신선도 계산용) */
  firstSeenAt?: Date | string | null;
}

export function buildSkillLevels(profile: Profile): Map<string, number> {
  const levels = new Map<string, number>();
  const bump = (raw: string, level: number) => {
    const key = normalizeSkill(raw);
    if (!key) return;
    levels.set(key, Math.max(levels.get(key) ?? 0, level));
    if (key.startsWith("aws-")) levels.set("aws", Math.max(levels.get("aws") ?? 0, Math.min(level, 3)));
  };
  for (const s of profile.skills) bump(s.name, s.level);
  // 프로젝트 스택/성과에만 등장한 기술도 최소 2레벨로 인정
  for (const e of profile.experiences)
    for (const p of e.projects) {
      for (const s of p.stack) bump(s, 3);
      for (const h of p.highlights) for (const s of h.skills) bump(s, 3);
    }
  for (const a of profile.activities) for (const h of a.highlights) for (const s of h.skills) bump(s, 2);
  return levels;
}

function directCredit(levels: Map<string, number>, key: string): number {
  const lv = levels.get(key) ?? 0;
  return lv >= 4 ? 1 : lv === 3 ? 0.85 : lv === 2 ? 0.6 : lv === 1 ? 0.35 : 0;
}

function credit(levels: Map<string, number>, key: string): number {
  let c = directCredit(levels, key);
  if (c < 1) {
    for (const [from, to, ratio] of SIBLINGS) {
      if (to === key) c = Math.max(c, ratio * directCredit(levels, from));
    }
  }
  return c;
}

function coverage(levels: Map<string, number>, keys: Set<string>): number {
  let num = 0;
  let den = 0;
  for (const k of keys) {
    const w = TRIVIAL.has(k) ? 0.3 : 1;
    den += w;
    num += w * credit(levels, k);
  }
  return den === 0 ? -1 : num / den;
}

/**
 * 병역특례(산업기능요원·전문연구요원·보충역) 전용 공고인지.
 * 군필이라 해당 없으므로 목록에서 뺍니다. 제목·직무 분류·고용 형태에 걸릴 때만 보고,
 * 본문 복리후생에 "병역특례 가능" 정도로만 적힌 일반 정규직 공고는 그대로 둡니다.
 */
export const MILITARY_EXEMPTION_RE = /병역\s?특례|병특|산업\s?기능\s?요원|전문\s?연구\s?요원|보충역|현역\s?(?:대상|전직)|military\s?service\s?exemption/i;

export function isMilitaryExemptionPosting(job: Pick<NormalizedJob, "title" | "categories" | "employmentType">): boolean {
  const head = `${job.title}\n${job.categories.join(" ")}\n${job.employmentType ?? ""}`;
  return MILITARY_EXEMPTION_RE.test(head);
}

function includesAny(haystack: string, needles: string[]): string | null {
  const h = haystack.toLowerCase();
  for (const n of needles) {
    const t = n.trim().toLowerCase();
    if (t && h.includes(t)) return n;
  }
  return null;
}

export const TITLE_ONLY_MAX_SCORE = 75;

export function scoreJob(profile: Profile, job: NormalizedJob, opts: MatchOptions = {}): MatchResult {
  const now = opts.now ?? new Date();
  const prefs = profile.preferences;
  const levels = buildSkillLevels(profile);
  const reasons: string[] = [];
  const warnings: string[] = [];
  const d = job.description;

  // ── 공고가 요구하는 스킬 ──
  const required = new Set<string>([...normalizeSkillList(job.techStacks), ...extractSkills(job.title)]);
  for (const k of extractSkills(`${d?.qualifications ?? ""}\n${d?.responsibilities ?? ""}`)) required.add(k);
  const preferred = new Set<string>([...extractSkills(d?.preferred ?? "")].filter((k) => !required.has(k)));

  // ── 트랙 판정 ──
  const trackStrength = { frontend: 0, infra: 0 } as Record<TrackId, number>;
  const allSkills = new Set([...required, ...preferred]);
  for (const t of Object.values(TRACKS)) {
    const titleHit = t.titlePatterns.some((re) => re.test(job.title));
    const catHits = job.categories.filter((c) => t.categoryPatterns.some((re) => re.test(c))).length;
    const manyCats = job.categories.length > 2;
    const share = skillTrackShare(allSkills, t.id);
    let s = 0;
    if (titleHit) s = 1;
    else if (catHits > 0) s = manyCats ? 0.5 : 0.8;
    if (share >= 0.5) s = Math.max(s, 0.55);
    else if (share >= 0.25) s = Math.max(s, 0.3);
    trackStrength[t.id] = s;
  }
  let track: TrackId | null = null;
  let bestWeighted = 0;
  for (const pt of prefs.tracks) {
    const w = trackStrength[pt.id] * pt.weight;
    if (w > bestWeighted) {
      bestWeighted = w;
      track = pt.id;
    }
  }
  const trackPts = 30 * bestWeighted;
  if (track) {
    const strong = trackStrength[track] >= 0.8;
    reasons.push(`${TRACKS[track].label} 트랙 · ${strong ? "제목/직무 분류 일치" : "기술 스택 기준 추정"}`);
  } else {
    warnings.push("희망 트랙(프론트엔드/인프라)과 거리가 있는 공고");
  }

  // ── 스킬 적합도 ──
  const reqCov = coverage(levels, required);
  const prefCov = coverage(levels, preferred);
  let skillPts: number;
  if (reqCov < 0) {
    skillPts = 18; // 스택 정보가 없는 공고는 중립
    reasons.push("공고에 기술 스택 정보가 적어 본문 확인 필요");
  } else {
    const p = prefCov < 0 ? reqCov : 0.78 * reqCov + 0.22 * prefCov;
    skillPts = 40 * p;
  }
  // 소스가 태깅한 핵심 스택(예: Flutter 전용 공고)을 거의 못 맞추면 스킬 점수를 절반으로
  const coreStack = new Set([...normalizeSkillList(job.techStacks)].filter((k) => !TRIVIAL.has(k)));
  const coreCov = coverage(levels, coreStack);
  if (coreCov >= 0 && coreCov < 0.4) {
    skillPts *= 0.5;
    warnings.push(`핵심 스택 불일치 (${[...coreStack].filter((k) => credit(levels, k) < 0.6).map(skillLabel).join(", ")})`);
  }
  const byImportance = (a: string, b: string) => Number(TRIVIAL.has(a)) - Number(TRIVIAL.has(b));
  const matchedSkills = [...allSkills].filter((k) => credit(levels, k) >= 0.6).sort(byImportance).map(skillLabel);
  const missingSkills = [...required].filter((k) => !TRIVIAL.has(k) && credit(levels, k) < 0.6).map(skillLabel);
  const missingPreferred = [...preferred].filter((k) => !TRIVIAL.has(k) && credit(levels, k) < 0.6).map(skillLabel);
  if (required.size > 0) {
    const have = [...required].filter((k) => credit(levels, k) >= 0.6).sort(byImportance);
    reasons.push(
      `필수/주요 스택 ${required.size}개 중 ${have.length}개 보유` +
        (have.length ? ` (${have.slice(0, 5).map(skillLabel).join(", ")}${have.length > 5 ? " 외" : ""})` : ""),
    );
  }

  // ── 경력 ──
  const y = careerYears(profile, now);
  const yLabel = y.toFixed(1);
  let careerPts: number;
  const { minCareer: min, maxCareer: max } = job;
  if (job.newcomer && (min ?? 0) === 0) {
    careerPts = 17;
    reasons.push(`신입 가능 공고 (현재 ${yLabel}년)`);
  } else if (min == null && max == null) {
    careerPts = 15;
    reasons.push("경력 조건 미기재");
  } else {
    const lo = min ?? 0;
    const range = `${lo}~${max ?? ""}년`;
    if (y + 0.25 >= lo) {
      if (max != null && y > max + 1) {
        careerPts = 10;
        warnings.push(`경력 상한 ${max}년보다 많음`);
      } else {
        careerPts = 20;
        reasons.push(`경력 ${range} → 현재 ${yLabel}년, 조건 충족`);
      }
    } else {
      const gap = lo - y;
      if (gap <= 1) {
        careerPts = 12;
        reasons.push(`경력 ${lo}년 이상 요구 → 현재 ${yLabel}년, 지원해볼 만함`);
      } else if (gap <= 2) {
        careerPts = 5;
        warnings.push(`경력 ${lo}년 이상 요구 (현재 ${yLabel}년) - 도전 지원`);
      } else {
        careerPts = 0;
        warnings.push(`경력 ${lo}년 이상 요구 - 현재 연차와 차이 큼`);
      }
    }
  }

  // ── 근무지 ──
  let locationPts = 3;
  const remote = /원격|재택|remote|리모트/i.test(`${job.title} ${job.tags.join(" ")}`);
  if (remote && prefs.locations.some((l) => /원격|재택|remote/i.test(l))) {
    locationPts = 5;
    reasons.push("원격/재택 가능");
  } else if (job.location) {
    const hit = prefs.locations.find((l) => job.location!.includes(l));
    if (hit) {
      locationPts = 5;
      reasons.push(`근무지 ${job.location}`);
    } else if (prefs.locations.length) {
      locationPts = 0;
      warnings.push(`선호 지역 밖 근무지: ${job.location}`);
    }
  }

  // ── 신선도 ──
  const seen = job.postedAt ?? opts.firstSeenAt ?? null;
  let freshPts = 2;
  if (seen) {
    const days = (now.getTime() - new Date(seen).getTime()) / 86_400_000;
    freshPts = days <= 2 ? 5 : days <= 7 ? 3 : 1;
  }

  // ── 경고/제외 ──
  const fullText = `${job.title}\n${job.company}\n${job.categories.join(" ")}\n${job.techStacks.join(" ")}\n${d ? Object.values(d).join("\n") : ""}`;
  let excluded = false;
  let excludeReason: string | null = null;
  const kw = includesAny(fullText, prefs.excludeKeywords);
  if (kw) {
    excluded = true;
    excludeReason = `제외 키워드 "${kw}"`;
  }
  if (isMilitaryExemptionPosting(job)) {
    excluded = true;
    excludeReason = "병역특례 공고";
  }
  const co = includesAny(job.company, prefs.excludeCompanies);
  if (co) {
    excluded = true;
    excludeReason = `제외 회사 "${co}"`;
  }
  if (job.deadline && !job.alwaysOpen && new Date(job.deadline).getTime() < now.getTime()) {
    excluded = true;
    excludeReason = "마감된 공고";
  }

  const graduated = profile.education.some((e) => e.status === "졸업");
  if (!graduated && /대학교?\s?졸업|대졸|학사\s?이상/.test(`${job.educationText ?? ""} ${d?.qualifications ?? ""}`)) {
    warnings.push("학력 조건 '4년제 졸업 이상' - 졸업예정자 지원 가능 여부 확인");
  }
  if (job.employmentType && /계약|파견|프리랜서|인턴/.test(job.employmentType)) {
    warnings.push(`고용 형태: ${job.employmentType}`);
  }
  if (/파견|상주|SI\s?프로젝트|SM\s?운영/i.test(fullText)) {
    warnings.push("파견/상주 또는 SI·SM 성격 문구 포함 - 근무 형태 확인");
  }
  if (/헤드헌팅|써치펌|서치펌/.test(job.company)) {
    warnings.push("헤드헌팅 공고 - 실제 회사명 확인 필요");
  }

  const breakdown: MatchBreakdown = {
    track: round1(trackPts),
    skill: round1(skillPts),
    career: careerPts,
    location: locationPts,
    freshness: freshPts,
  };
  let score = Math.max(0, Math.min(100, Math.round(trackPts + skillPts + careerPts + locationPts + freshPts)));
  // 요구 연차와 차이가 크면 다른 조건이 좋아도 상위에 오르지 않게 상한을 둡니다
  const careerGap = (job.minCareer ?? 0) - y;
  // 본문도 기술 태그도 없으면 제목 한 단어로 스킬이 다 맞은 것처럼 보이므로 상한을 둡니다
  if (!job.description && job.techStacks.length === 0) {
    score = Math.min(score, TITLE_ONLY_MAX_SCORE);
    warnings.push("본문이 없어 제목과 직무 분류로만 채점했습니다. 원문 확인 필요");
  }
  if (careerGap > 3) score = Math.min(score, 50);
  else if (careerGap > 2) score = Math.min(score, 60);

  return {
    jobId: job.id,
    score,
    track,
    trackStrength,
    breakdown,
    matchedSkills,
    missingSkills,
    missingPreferred,
    reasons,
    warnings,
    excluded,
    excludeReason,
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
