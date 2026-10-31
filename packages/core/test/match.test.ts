import { describe, expect, it } from "vitest";
import profileJson from "../../../data/profile.example.json";
import {
  aggregateSkillGaps,
  careerYearLabel,
  careerYears,
  extractSkills,
  jdChecklist,
  normalizeProfile,
  normalizeSkill,
  scoreJob,
  type NormalizedJob,
  type Profile,
} from "../src";

const profile = normalizeProfile(profileJson as Profile);
const NOW = new Date("2026-10-25T09:00:00+09:00");

function job(partial: Partial<NormalizedJob>): NormalizedJob {
  return {
    id: "jumpit:1",
    source: "jumpit",
    externalId: "1",
    url: "https://example.com",
    title: "",
    company: "테스트",
    companyLogo: null,
    location: "서울 강남구",
    categories: [],
    techStacks: [],
    minCareer: null,
    maxCareer: null,
    newcomer: false,
    employmentType: null,
    deadline: null,
    alwaysOpen: false,
    postedAt: "2026-10-24T00:00:00+09:00",
    salaryText: null,
    educationText: null,
    tags: [],
    description: null,
    ...partial,
  };
}

describe("skills", () => {
  it("normalizes source-specific spellings", () => {
    expect(normalizeSkill("React.js")).toBe("react");
    expect(normalizeSkill("Amazon EC2")).toBe("aws-ec2");
    expect(normalizeSkill("Next.js")).toBe("nextjs");
    expect(normalizeSkill("CSS 3")).toBe("css");
  });

  it("does not confuse JavaScript with Java or reviews with Vue", () => {
    const s = extractSkills("자바스크립트와 코드 리뷰 문화, 인터뷰 진행");
    expect(s.has("javascript")).toBe(true);
    expect(s.has("java")).toBe(false);
    expect(s.has("vue")).toBe(false);
  });

  it("finds Korean and English mentions in free text", () => {
    const s = extractSkills("쿠버네티스 운영 경험, Terraform으로 IaC 관리, GitHub Actions 기반 CI/CD");
    expect([...s]).toEqual(expect.arrayContaining(["kubernetes", "terraform", "github-actions", "cicd"]));
  });
});

describe("career", () => {
  it("computes years from careerStart", () => {
    expect(careerYears(profile, NOW)).toBeCloseTo(16 / 12, 2);
    expect(careerYearLabel(profile, NOW)).toBe("2년차");
  });
});

describe("scoreJob", () => {
  const fe = job({
    id: "jumpit:55376222",
    title: "프론트엔드 개발자 (경력)",
    categories: ["프론트엔드 개발자"],
    techStacks: ["CSS 3", "GitHub", "Jira", "Next.js", "React", "Slack", "TypeScript", "Webpack", "Notion"],
    minCareer: 1,
    maxCareer: 3,
    description: {
      qualifications: "React 기반 개발 경험\nNext.js 기반 SSR/CSR 개발 경험\nTypescript 기반 개발 능력",
      preferred: "React Query, Zustand 사용 경험\nStorybook 기반 컴포넌트 문서화\nJest / Testing-library 기반 테스트 경험",
    },
  });

  it("ranks a matching frontend job high with readable reasons", () => {
    const m = scoreJob(profile, fe, { now: NOW });
    expect(m.track).toBe("frontend");
    expect(m.score).toBeGreaterThanOrEqual(80);
    expect(m.matchedSkills).toEqual(expect.arrayContaining(["React", "Next.js", "TypeScript"]));
    expect(m.missingPreferred).toEqual(expect.arrayContaining(["Storybook"]));
    expect(m.reasons.some((r) => r.includes("조건 충족"))).toBe(true);
  });

  it("recognizes infra jobs as the secondary track", () => {
    const devops = job({
      title: "DevOps 엔지니어",
      categories: ["devops/시스템 엔지니어"],
      techStacks: ["AWS", "Docker", "Kubernetes", "Terraform", "GitHub Actions"],
      minCareer: 1,
      maxCareer: 5,
    });
    const m = scoreJob(profile, devops, { now: NOW });
    expect(m.track).toBe("infra");
    expect(m.missingSkills).toEqual(expect.arrayContaining(["Kubernetes", "Terraform"]));
    expect(m.score).toBeLessThan(scoreJob(profile, fe, { now: NOW }).score);
  });

  it("penalizes large career gaps and flags them", () => {
    const senior = job({ ...fe, id: "jumpit:2", minCareer: 7, maxCareer: 10 });
    const m = scoreJob(profile, senior, { now: NOW });
    expect(m.breakdown.career).toBe(0);
    expect(m.score).toBeLessThanOrEqual(50);
    expect(m.warnings.some((w) => w.includes("차이 큼"))).toBe(true);
  });

  it("halves the skill score when the tagged core stack is missing", () => {
    const flutter = job({ title: "클라이언트 엔지니어(1-3년)", categories: ["프론트엔드 개발자", "크로스플랫폼 앱 개발자"], techStacks: ["Flutter"], minCareer: 1, maxCareer: 3 });
    const m = scoreJob(profile, flutter, { now: NOW });
    expect(m.warnings.some((w) => w.startsWith("핵심 스택 불일치"))).toBe(true);
    expect(m.score).toBeLessThan(65);
  });

  it("hides 병역특례 전용 공고 but keeps regular jobs that merely allow it", () => {
    const special = { ...fe, id: "mil-1", title: "[산업기능요원] 프론트엔드 개발자" };
    const r = scoreJob(profile, special, { now: NOW });
    expect(r.excluded).toBe(true);
    expect(r.excludeReason).toBe("병역특례 공고");
    expect(scoreJob(profile, { ...fe, id: "mil-2", title: "프론트엔드 개발자 (전문연구요원 가능)" }, { now: NOW }).excluded).toBe(true);
    expect(scoreJob(profile, { ...fe, id: "mil-3", categories: [...fe.categories, "병역특례"] }, { now: NOW }).excluded).toBe(true);
    expect(scoreJob(profile, fe, { now: NOW }).excludeReason).not.toBe("병역특례 공고");
  });

  it("excludes closed jobs and excluded keywords", () => {
    const closed = scoreJob(profile, job({ ...fe, deadline: "2026-10-01T23:59:59+09:00" }), { now: NOW });
    expect(closed.excluded).toBe(true);
    const p2 = normalizeProfile({ ...profile, preferences: { ...profile.preferences, excludeKeywords: ["Webpack"] } });
    expect(scoreJob(p2, fe, { now: NOW }).excluded).toBe(true);
  });

  it("warns when a 4-year degree is required and the user has not graduated yet", () => {
    const m = scoreJob(profile, job({ ...fe, educationText: "대학교졸업(4년) 이상" }), { now: NOW });
    expect(m.warnings.some((w) => w.startsWith("학력"))).toBe(true);
  });
});

describe("insights", () => {
  it("aggregates missing skills across good matches", () => {
    const jobs = [
      job({ id: "a", title: "프론트엔드 개발자", techStacks: ["React", "TypeScript", "Storybook"], minCareer: 1 }),
      job({ id: "b", title: "Frontend Engineer", techStacks: ["Next.js", "Storybook", "Jest"], minCareer: 2 }),
      job({ id: "c", title: "프론트엔드", techStacks: ["React", "GraphQL"], minCareer: 1 }),
    ];
    const gaps = aggregateSkillGaps(jobs.map((j) => scoreJob(profile, j, { now: NOW })));
    expect(gaps[0]?.skill).toBe("Storybook");
    expect(gaps[0]?.jobCount).toBe(2);
  });

  it("builds a JD checklist", () => {
    const fe = job({ title: "프론트엔드", techStacks: ["React"], deadline: "2026-10-28T23:59:59+09:00", minCareer: 1, maxCareer: 3 });
    const items = jdChecklist(fe, scoreJob(profile, fe, { now: NOW }), NOW);
    expect(items.find((i) => i.label === "마감")?.value).toMatch(/^D-[34]/);
    expect(items.find((i) => i.label === "연봉 정보")?.value).toBe("비공개");
  });

  it("caps jobs scored from the title alone and says why", () => {
    const titleOnly = scoreJob(profile, job({ title: "React 프론트엔드 개발자", description: null, techStacks: [] }), { now: NOW });
    expect(titleOnly.score).toBeLessThanOrEqual(75);
    expect(titleOnly.warnings.join()).toContain("제목과 직무 분류로만");
    const tagged = scoreJob(profile, job({ title: "React 프론트엔드 개발자", description: null, techStacks: ["React", "TypeScript"] }), { now: NOW });
    expect(tagged.warnings.join()).not.toContain("제목과 직무 분류로만");
    expect(tagged.score).toBeLessThanOrEqual(85);
    expect(tagged.warnings.join()).toContain("기술 태그로만");
  });
});
