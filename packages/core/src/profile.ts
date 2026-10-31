import { z } from "zod";

/**
 * 프로필 스키마.
 * AI 추출(structured output)에도 그대로 쓰이므로 min/max 같은 제약은 넣지 않고,
 * 값 보정은 normalizeProfile()에서 합니다.
 */

export const TRACK_IDS = ["frontend", "infra"] as const;
export type TrackId = (typeof TRACK_IDS)[number];

export const SkillCategorySchema = z.enum(["frontend", "infra", "backend", "data", "tool", "etc"]);

export const HighlightSchema = z.object({
  title: z.string().describe("성과 한 줄 요약. 예: 'FCP 77%↓ LCP 73%↓, SSR 무력화 구조를 걷어내다'"),
  situation: z.string().optional(),
  task: z.string().optional(),
  action: z.string().optional(),
  result: z.string().optional(),
  metrics: z.array(z.string()).describe("수치로 표현된 성과. 예: 'Lighthouse 80 → 99'"),
  skills: z.array(z.string()).describe("이 성과에 쓰인 기술"),
});

export const ProjectSchema = z.object({
  name: z.string(),
  client: z.string().optional().describe("발주처/서비스명"),
  period: z.string().describe("예: 2025.06 ~ 현재"),
  url: z.string().optional(),
  stack: z.array(z.string()),
  summary: z.string().optional(),
  highlights: z.array(HighlightSchema),
});

export const ExperienceSchema = z.object({
  company: z.string(),
  role: z.string(),
  start: z.string().describe("YYYY-MM"),
  end: z.string().nullable().describe("YYYY-MM, 재직 중이면 null"),
  summary: z.string().optional(),
  projects: z.array(ProjectSchema),
});

export const ActivitySchema = z.object({
  name: z.string(),
  role: z.string(),
  period: z.string(),
  summary: z.string(),
  highlights: z.array(HighlightSchema),
});

export const EducationSchema = z.object({
  school: z.string(),
  major: z.string(),
  status: z.enum(["재학", "휴학", "수료", "졸업예정", "졸업"]),
  start: z.string().optional(),
  end: z.string().optional().describe("졸업(예정)일 YYYY-MM"),
  gpa: z.string().optional(),
});

export const SkillSchema = z.object({
  name: z.string(),
  level: z.number().describe("1(써봄) ~ 5(실무 주력). 실무 프로젝트에 반복 등장하면 4~5"),
  category: SkillCategorySchema,
});

export const CertificationSchema = z.object({
  name: z.string(),
  status: z.enum(["acquired", "planned"]),
  date: z.string().optional().describe("취득일 또는 취득 예정월 YYYY-MM"),
});

export const PreferencesSchema = z.object({
  tracks: z.array(z.object({ id: z.enum(TRACK_IDS), weight: z.number() })),
  locations: z.array(z.string()).describe("선호 근무지. 예: 서울, 경기, 인천, 원격"),
  excludeKeywords: z.array(z.string()),
  excludeCompanies: z.array(z.string()),
  minSalaryManwon: z.number().optional(),
});

export const ProfileSchema = z.object({
  name: z.string(),
  headline: z.string().describe("예: '2년차 프론트엔드 개발자 · 인프라까지 다루는'"),
  summary: z.string(),
  contact: z
    .object({
      email: z.string().optional(),
      phone: z.string().optional(),
      github: z.string().optional(),
      blog: z.string().optional(),
      portfolio: z.string().optional(),
    })
    .optional(),
  careerStart: z.string().describe("실무 시작 YYYY-MM"),
  education: z.array(EducationSchema),
  experiences: z.array(ExperienceSchema),
  activities: z.array(ActivitySchema),
  skills: z.array(SkillSchema),
  certifications: z.array(CertificationSchema),
  languages: z.array(z.object({ name: z.string(), score: z.string() })),
  awards: z.array(z.object({ name: z.string(), date: z.string().optional() })),
  talks: z.array(z.object({ title: z.string(), date: z.string().optional(), url: z.string().optional() })),
  values: z.array(z.string()).describe("일하는 방식/가치관 한 줄들"),
  military: z.string().optional().describe("병역 사항. 예: 육군 병장 만기전역 (2021.09-2023.03)"),
  preferences: PreferencesSchema,
  /** 노션 등에서 가져온 공부 기록 요약 (선택) */
  studyNotes: z.array(z.object({ topic: z.string(), summary: z.string() })).optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Highlight = z.infer<typeof HighlightSchema>;

export const DEFAULT_PREFERENCES: Profile["preferences"] = {
  tracks: [
    { id: "frontend", weight: 1 },
    { id: "infra", weight: 0.8 },
  ],
  locations: ["서울", "경기", "인천", "원격"],
  excludeKeywords: [],
  excludeCompanies: [],
};

/** AI가 만든 값이나 사용자가 편집한 값을 안전한 범위로 정리합니다 */
export function normalizeProfile(input: Profile): Profile {
  const seen = new Set<string>();
  const skills = input.skills
    .map((s) => ({ ...s, name: s.name.trim(), level: clamp(Math.round(s.level || 1), 1, 5) }))
    .filter((s) => {
      const k = s.name.toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const tracks = (input.preferences?.tracks?.length ? input.preferences.tracks : DEFAULT_PREFERENCES.tracks).map((t) => ({
    id: t.id,
    weight: clamp(t.weight, 0, 1),
  }));
  return {
    ...input,
    skills,
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...input.preferences,
      tracks,
    },
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

/** 실무 연차(소수). careerStart가 2025-06이고 지금이 2026-10이면 약 1.33 */
export function careerYears(profile: Pick<Profile, "careerStart">, now = new Date()): number {
  const m = /^(\d{4})-(\d{1,2})/.exec(profile.careerStart ?? "");
  if (!m) return 0;
  const start = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  return Math.max(0, months / 12);
}

/** 한국식 'N년차' */
export function careerYearLabel(profile: Pick<Profile, "careerStart">, now = new Date()): string {
  return `${Math.floor(careerYears(profile, now)) + 1}년차`;
}
