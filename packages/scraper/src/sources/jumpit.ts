import { makeJobId, type NormalizedJob } from "@archiev/core";
import { fetchJson, sleep } from "../http";
import { cleanText, envFlag, kstToIso, type SourceAdapter } from "./types";

/**
 * 점핏 (jumpit.saramin.co.kr) - 사람인의 개발자 채용 서비스
 * 점핏 웹이 쓰는 JSON 엔드포인트입니다. (2026-10 확인)
 *   목록: https://jumpit-api.saramin.co.kr/api/positions?jobCategory=2&sort=reg_dt&page=1  (페이지당 16건)
 *   상세: https://jumpit-api.saramin.co.kr/api/position/{id}
 */

const API = "https://jumpit-api.saramin.co.kr/api";
const WEB = "https://jumpit.saramin.co.kr";
const PAGE_SIZE = 16;

/** 점핏 jobCategory 코드 */
export const JUMPIT_CATEGORIES: Record<number, string> = {
  2: "프론트엔드 개발자",
  3: "웹 풀스택 개발자",
  9: "devops/시스템 엔지니어",
};

interface JumpitListItem {
  id: number;
  jobCategory?: string;
  logo?: string | null;
  title: string;
  companyName: string;
  techStacks?: string[];
  newcomer?: boolean;
  minCareer?: number | null;
  maxCareer?: number | null;
  locations?: string[];
  alwaysOpen?: boolean;
  closedAt?: string | null;
}

interface JumpitListResponse {
  status?: number;
  result?: { totalCount?: number; page?: number; positions?: JumpitListItem[] };
}

export function parseJumpitList(res: JumpitListResponse): NormalizedJob[] {
  return (res.result?.positions ?? []).map((p) => ({
    id: makeJobId("jumpit", p.id),
    source: "jumpit",
    externalId: String(p.id),
    url: `${WEB}/position/${p.id}`,
    title: p.title?.trim() ?? "",
    company: p.companyName?.trim() ?? "",
    companyLogo: p.logo ?? null,
    location: p.locations?.length ? p.locations.join(", ") : null,
    categories: (p.jobCategory ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    techStacks: p.techStacks ?? [],
    minCareer: p.minCareer ?? null,
    maxCareer: p.maxCareer != null && p.maxCareer < 30 ? p.maxCareer : null,
    newcomer: !!p.newcomer,
    employmentType: null,
    deadline: p.alwaysOpen ? null : kstToIso(p.closedAt),
    alwaysOpen: !!p.alwaysOpen,
    postedAt: null,
    salaryText: null,
    educationText: null,
    tags: [],
    description: null,
  }));
}

interface JumpitDetailResponse {
  result?: {
    id: number;
    title?: string;
    companyName?: string;
    logo?: string;
    techStacks?: { stack: string }[];
    serviceInfo?: string;
    responsibility?: string;
    qualifications?: string;
    preferredRequirements?: string;
    welfares?: string;
    recruitProcess?: string;
    newcomer?: boolean;
    minCareer?: number;
    maxCareer?: number;
    publishedAt?: string;
    closedAt?: string;
    location?: string;
    tags?: { name: string }[];
    alwaysOpen?: boolean;
    educationName?: string;
    jobCategories?: { id: number; name: string }[];
  };
}

/** 본문에서 "연봉 5,000 ~ 6,500만원" 같은 표기를 찾아냅니다 */
export function findSalary(text: string): string | null {
  const m = /연봉[^\n]{0,8}?(\d[\d,]*\s?(?:만\s?원)?\s?[~-]\s?\d[\d,]*\s?만\s?원)/.exec(text);
  return m ? m[1]!.replace(/\s+/g, " ") : null;
}

export function parseJumpitDetail(base: NormalizedJob, res: JumpitDetailResponse): NormalizedJob {
  const r = res.result;
  if (!r) return base;
  const process = cleanText(r.recruitProcess);
  const benefits = cleanText(r.welfares);
  const employment = /고용\s?형태\s?:?\s?([^\n(]+)/.exec(process ?? "")?.[1]?.trim() ?? null;
  return {
    ...base,
    companyLogo: r.logo ?? base.companyLogo,
    techStacks: r.techStacks?.length ? r.techStacks.map((t) => t.stack) : base.techStacks,
    location: r.location?.trim() || base.location,
    categories: r.jobCategories?.length ? r.jobCategories.map((c) => c.name) : base.categories,
    postedAt: kstToIso(r.publishedAt) ?? base.postedAt,
    deadline: r.alwaysOpen ? null : (kstToIso(r.closedAt) ?? base.deadline),
    alwaysOpen: r.alwaysOpen ?? base.alwaysOpen,
    educationText: r.educationName?.trim() || null,
    employmentType: employment ?? base.employmentType,
    salaryText: findSalary(`${process ?? ""}\n${benefits ?? ""}`) ?? base.salaryText,
    tags: (r.tags ?? []).map((t) => t.name),
    description: {
      intro: cleanText(r.serviceInfo),
      responsibilities: cleanText(r.responsibility),
      qualifications: cleanText(r.qualifications),
      preferred: cleanText(r.preferredRequirements),
      benefits,
      process,
    },
  };
}

export const jumpit: SourceAdapter = {
  id: "jumpit",
  enabled: (env) => envFlag(env.SOURCE_JUMPIT, true),
  detailLimit: 60,
  async list(ctx) {
    const out = new Map<string, NormalizedJob>();
    for (const cat of Object.keys(JUMPIT_CATEGORIES).map(Number)) {
      for (let page = 1; page <= ctx.maxPages; page++) {
        const res = await fetchJson<JumpitListResponse>(`${API}/positions?jobCategory=${cat}&sort=reg_dt&page=${page}`, {
          headers: { Referer: `${WEB}/positions`, Origin: WEB },
        });
        const items = parseJumpitList(res);
        for (const it of items) if (!out.has(it.id)) out.set(it.id, it);
        ctx.log(`  jumpit ${JUMPIT_CATEGORIES[cat]} p${page}: ${items.length}건`);
        const total = res.result?.totalCount ?? 0;
        if (items.length < PAGE_SIZE || page * PAGE_SIZE >= total) break;
        await sleep(ctx.delayMs);
      }
      await sleep(ctx.delayMs);
    }
    return [...out.values()];
  },
  async detail(job, ctx) {
    await sleep(ctx.delayMs);
    const res = await fetchJson<JumpitDetailResponse>(`${API}/position/${job.externalId}`, {
      headers: { Referer: `${WEB}/position/${job.externalId}`, Origin: WEB },
    });
    return parseJumpitDetail(job, res);
  },
};
