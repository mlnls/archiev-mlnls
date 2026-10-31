import type { NormalizedJob } from "./job";
import type { MatchResult } from "./match";

export interface SkillGap {
  skill: string;
  /** 이 스킬을 요구한 상위 공고 수 */
  jobCount: number;
  /** 필수로 요구한 횟수 / 우대로 요구한 횟수 */
  requiredCount: number;
  preferredCount: number;
  /** 매칭 점수로 가중한 중요도 (정렬용) */
  weight: number;
  sampleJobIds: string[];
}

/**
 * 잘 맞는 공고들이 공통으로 요구하는데 내가 부족한 스킬을 모읍니다.
 * "무엇을 공부해야 하나"에 대한 데이터 기반 답.
 */
export function aggregateSkillGaps(matches: MatchResult[], opts: { minScore?: number; limit?: number } = {}): SkillGap[] {
  const minScore = opts.minScore ?? 45;
  const map = new Map<string, SkillGap>();
  for (const m of matches) {
    if (m.excluded || m.score < minScore) continue;
    const w = m.score / 100;
    const add = (skill: string, kind: "required" | "preferred") => {
      const g =
        map.get(skill) ??
        ({ skill, jobCount: 0, requiredCount: 0, preferredCount: 0, weight: 0, sampleJobIds: [] } satisfies SkillGap);
      g.jobCount++;
      if (kind === "required") {
        g.requiredCount++;
        g.weight += w;
      } else {
        g.preferredCount++;
        g.weight += w * 0.5;
      }
      if (g.sampleJobIds.length < 5) g.sampleJobIds.push(m.jobId);
      map.set(skill, g);
    };
    for (const s of m.missingSkills) add(s, "required");
    for (const s of m.missingPreferred) add(s, "preferred");
  }
  return [...map.values()].sort((a, b) => b.weight - a.weight).slice(0, opts.limit ?? 15);
}

export type ChecklistLevel = "ok" | "check" | "warn";
export interface ChecklistItem {
  label: string;
  value: string;
  level: ChecklistLevel;
  tip?: string;
}

/**
 * JD를 읽을 때 반드시 확인해야 할 항목을 공고 데이터로 자동 채웁니다.
 * (AI 분석 없이도 동작하는 기본 체크리스트)
 */
export function jdChecklist(job: NormalizedJob, match: MatchResult | null, now = new Date()): ChecklistItem[] {
  const d = job.description;
  const text = `${d?.qualifications ?? ""}\n${d?.preferred ?? ""}\n${d?.process ?? ""}\n${d?.benefits ?? ""}`;
  const items: ChecklistItem[] = [];

  // 1. 경력 범위
  const career =
    job.newcomer && !job.minCareer
      ? "신입 가능"
      : job.minCareer == null && job.maxCareer == null
        ? "미기재"
        : `${job.minCareer ?? 0}년 ~ ${job.maxCareer ?? "제한 없음"}${job.maxCareer != null ? "년" : ""}`;
  const careerWarn = match?.warnings.some((w) => w.startsWith("경력"));
  items.push({
    label: "경력 요건",
    value: career,
    level: careerWarn ? "warn" : job.minCareer == null && !job.newcomer ? "check" : "ok",
    tip: "‘N년 이상’은 하한선일 뿐 실제로는 비슷한 연차도 서류를 보는 경우가 많습니다. 자격 요건의 ‘경험’ 문장을 내 사례로 채울 수 있는지가 더 중요합니다.",
  });

  // 2. 필수 vs 우대 스택
  if (match) {
    items.push({
      label: "필수 스택 중 부족한 것",
      value: match.missingSkills.length ? match.missingSkills.join(", ") : "없음",
      level: match.missingSkills.length >= 3 ? "warn" : match.missingSkills.length ? "check" : "ok",
      tip: "필수에서 1~2개 빠지는 건 흔합니다. 빠진 기술과 비슷한 경험(대체 기술)을 이력서에 명시하세요.",
    });
    items.push({
      label: "우대 사항 중 부족한 것",
      value: match.missingPreferred.length ? match.missingPreferred.join(", ") : "없음",
      level: "ok",
      tip: "우대 사항은 이 팀이 지금 겪는 문제의 힌트입니다. 면접 질문이 여기서 많이 나옵니다.",
    });
  }

  // 3. 마감
  if (job.alwaysOpen || !job.deadline) {
    items.push({ label: "마감", value: "상시/채용시 마감", level: "check", tip: "상시 공고는 빨리 지원할수록 유리합니다." });
  } else {
    const days = Math.ceil((new Date(job.deadline).getTime() - now.getTime()) / 86_400_000);
    items.push({
      label: "마감",
      value: days < 0 ? "마감됨" : `D-${days} (${job.deadline.slice(0, 10)})`,
      level: days < 0 ? "warn" : days <= 5 ? "check" : "ok",
    });
  }

  // 4. 고용 형태 / 근무 형태
  const contract = /계약|파견|프리랜서|인턴/.test(`${job.employmentType ?? ""} ${text}`);
  items.push({
    label: "고용 형태",
    value: job.employmentType ?? (contract ? "본문에 계약/파견 언급" : "미기재 (정규직 여부 확인)"),
    level: contract ? "warn" : job.employmentType ? "ok" : "check",
  });
  if (/파견|상주|SI\s?프로젝트|SM\s?운영|고객사/i.test(`${d?.responsibilities ?? ""} ${text}`)) {
    items.push({
      label: "SI/파견 여부",
      value: "본문에 파견·상주·고객사 관련 문구 있음",
      level: "warn",
      tip: "자사 서비스인지, 외부 프로젝트 투입인지 면접에서 꼭 물어보세요.",
    });
  }

  // 5. 학력
  if (job.educationText || /대학교?\s?졸업|대졸|학사/.test(text)) {
    items.push({
      label: "학력 조건",
      value: job.educationText ?? "본문에 학력 조건 있음",
      level: match?.warnings.some((w) => w.startsWith("학력")) ? "check" : "ok",
      tip: "2027년 2월 졸업 예정이라면 ‘졸업예정자 지원 가능’ 여부를 확인하세요.",
    });
  }

  // 6. 연봉 공개
  const salary = job.salaryText ?? (/\d[,\d]*\s?(~|-)\s?\d[,\d]*\s?만\s?원|연봉\s?\d/.test(text) ? "본문에 연봉 범위 있음" : null);
  items.push({
    label: "연봉 정보",
    value: salary ?? "비공개",
    level: salary ? "ok" : "check",
    tip: salary ? undefined : "비공개라면 잡플래닛/크레딧잡 등에서 평균 연봉을 미리 확인하세요.",
  });

  // 7. 전형 절차
  const steps: string[] = [];
  if (/코딩\s?테스트|코테|알고리즘/.test(text)) steps.push("코딩테스트");
  if (/과제/.test(text)) steps.push("과제");
  if (/라이브\s?코딩/.test(text)) steps.push("라이브코딩");
  if (/포트폴리오/.test(text)) steps.push("포트폴리오 제출");
  if (/영어|english/i.test(text)) steps.push("영어");
  items.push({
    label: "전형 특이사항",
    value: steps.length ? steps.join(" · ") : d?.process ? "일반 전형" : "미기재",
    level: steps.length ? "check" : "ok",
    tip: steps.includes("과제") ? "과제 전형은 README와 설계 의도 설명이 평가의 절반입니다." : undefined,
  });

  return items;
}
