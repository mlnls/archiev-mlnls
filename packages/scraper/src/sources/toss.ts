import { makeJobId, type JobDescription, type NormalizedJob } from "@archiev/core";
import { fetchJson } from "../http";
import { cleanText, envFlag, isTechRole, kstToIso, type SourceAdapter } from "./types";

/**
 * 토스 (toss.im/career) — 토스·토스뱅크·토스증권·토스페이먼츠 등 계열사 포함
 * 토스 채용 페이지가 쓰는 공개 API이며 내부는 Greenhouse입니다. (2026-10 확인)
 *   GET https://api-public.toss.im/api/v3/ipd-eggnog/career/job-groups
 *   → success[] (포지션 묶음) → jobs[] (계열사별 공고). 본문(JD)이 마크다운으로 metadata에 들어 있어 상세 조회가 필요 없습니다.
 */

const API = "https://api-public.toss.im/api/v3/ipd-eggnog/career/job-groups";

/** Greenhouse 커스텀 필드 id (이름이 길고 바뀔 수 있어 id로 찾음) */
const META = {
  category: 24623243003, // 커리어 페이지 노출 Job Category (예: App, Frontend, Server)
  subsidiary: 4169410003, // 소속 자회사 (예: 토스, 토스뱅크)
  employment: 4112432003, // Employment_Type (정규직 등)
  description: 4155730003, // Job Description (마크다운)
  keywords: 4194643003, // 외부 노출 키워드 (예: "개발,Android,Kotlin")
  deadline: 11431213003, // 서류 마감일
  hidden: 5038345003, // 커리어 페이지 미노출 여부
} as const;

interface TossMeta {
  id: number;
  name?: string;
  value: unknown;
  value_type?: string;
}

export interface TossJob {
  id: number;
  title: string;
  absolute_url?: string;
  location?: { name?: string } | null;
  metadata?: TossMeta[];
  updated_at?: string;
  first_published?: string;
  company_name?: string;
}

export interface TossResponse {
  resultType?: string;
  success?: { id: number; title: string; primary_job?: TossJob; jobs?: TossJob[] }[];
}

const metaValue = (job: TossJob, id: number): unknown => job.metadata?.find((m) => m.id === id)?.value ?? null;
const metaText = (job: TossJob, id: number): string | null => {
  const v = metaValue(job, id);
  if (v == null) return null;
  if (Array.isArray(v)) return v.join(", ") || null;
  return String(v).trim() || null;
};

/** 토스 JD 마크다운을 "# 제목" 기준으로 칸에 나눕니다 */
export function splitTossMarkdown(md: string | null): JobDescription | null {
  if (!md) return null;
  const sections: { head: string; body: string[] }[] = [{ head: "", body: [] }];
  for (const line of md.split(/\r?\n/)) {
    const h = /^#{1,3}\s+(.+)$/.exec(line.trim());
    if (h) sections.push({ head: h[1]!, body: [] });
    else sections[sections.length - 1]!.body.push(line);
  }
  const pick = (re: RegExp) =>
    cleanText(
      sections
        .filter((s) => re.test(s.head))
        .map((s) => s.body.join("\n"))
        .join("\n\n"),
    );
  // 토스 JD의 실제 제목들 (2026-10 기준): "합류하게 될 팀에 대해 알려드려요", "합류하면 함께할 업무예요",
  // "이런 분과 함께하고 싶어요", "이런 경험이 있다면 더 좋아요", "토스로의 합류 여정", "토스에서 사용하는 기술" …
  const desc: JobDescription = {
    intro: pick(/(팀|포지션|도메인)에 대해|사용하는 기술|^$/),
    responsibilities: pick(/함께\s?할\s?업무|담당\s?업무|주요\s?업무/),
    qualifications: pick(/함께하고 싶어요|자격\s?요건/),
    preferred: pick(/더 좋아요|우대/),
    process: pick(/합류\s?여정|채용\s?절차|전형/),
    benefits: null,
  };
  // 섹션 이름이 예상과 다르면 통째로 소개에 넣어 AI 분석이 볼 수 있게 합니다
  if (!desc.responsibilities && !desc.qualifications) desc.intro = cleanText(md);
  return desc;
}

export function parseToss(res: TossResponse): NormalizedJob[] {
  const out = new Map<string, NormalizedJob>();
  for (const group of res.success ?? []) {
    for (const job of group.jobs ?? (group.primary_job ? [group.primary_job] : [])) {
      if (metaValue(job, META.hidden) === true) continue;
      const category = metaText(job, META.category);
      const keywords = (metaText(job, META.keywords) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!isTechRole(job.title, category, keywords.join(" "))) continue;
      const subsidiary = metaText(job, META.subsidiary);
      const deadline = metaText(job, META.deadline);
      const id = makeJobId("toss", job.id);
      out.set(id, {
        id,
        source: "toss",
        externalId: String(job.id),
        url: job.absolute_url || `https://toss.im/career/job-detail?gh_jid=${job.id}`,
        title: job.title.trim(),
        company: subsidiary && subsidiary !== "ETC" ? subsidiary : "토스",
        companyLogo: null,
        location: job.location?.name ?? null,
        categories: category ? [category] : [],
        // 첫 키워드는 직군(예: "개발")이라 빼고 나머지를 스택 후보로
        techStacks: keywords.slice(1),
        minCareer: null,
        maxCareer: null,
        newcomer: /신입|주니어|junior|인턴|intern/i.test(job.title),
        employmentType: metaText(job, META.employment),
        deadline: deadline ? kstToIso(deadline.slice(0, 10)) : null,
        alwaysOpen: !deadline,
        postedAt: job.first_published ? new Date(job.first_published).toISOString() : null,
        salaryText: null,
        educationText: null,
        tags: keywords.slice(0, 1),
        description: splitTossMarkdown(metaText(job, META.description)),
      });
    }
  }
  return [...out.values()];
}

export const toss: SourceAdapter = {
  id: "toss",
  enabled: (env) => envFlag(env.SOURCE_TOSS, true),
  async list(ctx) {
    const res = await fetchJson<TossResponse>(API, { headers: { Origin: "https://toss.im", Referer: "https://toss.im/career/jobs" } });
    const jobs = parseToss(res);
    ctx.log(`  toss: 포지션 ${res.success?.length ?? 0}개 중 개발 직군 공고 ${jobs.length}건`);
    return jobs;
  },
};
