import { makeJobId, type NormalizedJob } from "@archiev/core";
import { fetchJson, sleep } from "../http";
import { cleanText, kstToIso, type SourceAdapter } from "./types";

/**
 * 로켓펀치 공식 Open API (https://docs.rocketpunch.com/openapi)
 * App Key 발급 후 ROCKETPUNCH_API_KEY 에 넣으면 활성화됩니다. 한도: 분당 60회, 일 5,000회.
 */

const API = "https://openapi.rocketpunch.com/api/v1";
const PAGE_SIZE = 50;
export const ROCKETPUNCH_KEYWORDS = ["프론트엔드", "React", "DevOps", "인프라"];

/** 숙련도 코드 → 대략적인 연차 범위 (로켓펀치는 연차 대신 숙련도를 씁니다) */
const SENIORITY_YEARS: Record<string, [number, number | null]> = {
  BEGINNER: [0, 1],
  JUNIOR: [1, 3],
  MIDLEVEL: [3, 7],
  SENIOR: [7, null],
  EXECUTIVE: [10, null],
};

const WORK_TYPE: Record<string, string> = { ONSITE: "출근", HYBRID: "하이브리드", REMOTE: "원격" };

interface RpCompany {
  id?: string | null;
  name: string;
  logoUrl?: string | null;
}

interface RpSummary {
  jobId: number;
  title: string;
  subtitle?: string | null;
  jobCategory?: string | null;
  seniorities?: string[];
  employmentTypes?: string[];
  workType?: string | null;
  company: RpCompany;
  endAt?: string | null;
  webUrl: string;
}

interface RpPage {
  totalItems: number;
  totalPages: number;
  page: number;
  pageSize: number;
  items: RpSummary[];
}

interface RpDetail extends RpSummary {
  status?: string;
  hiring?: boolean;
  description?: string | null;
  duty?: string | null;
  minimumQualification?: string | null;
  preferredQualification?: string | null;
  benefit?: string | null;
  hireProcess?: string | null;
  createdAt?: string;
  startAt?: string | null;
}

function careerRange(seniorities: string[] = []): [number | null, number | null] {
  const ranges = seniorities.map((s) => SENIORITY_YEARS[s]).filter((r): r is [number, number | null] => !!r);
  if (!ranges.length) return [null, null];
  const min = Math.min(...ranges.map((r) => r[0]));
  const max = ranges.some((r) => r[1] == null) ? null : Math.max(...ranges.map((r) => r[1]!));
  return [min, max];
}

export function parseRocketpunchSummary(it: RpSummary): NormalizedJob {
  const [min, max] = careerRange(it.seniorities);
  const remote = it.workType === "REMOTE" || it.workType === "HYBRID";
  return {
    id: makeJobId("rocketpunch", it.jobId),
    source: "rocketpunch",
    externalId: String(it.jobId),
    url: it.webUrl,
    title: [it.title, it.subtitle].filter(Boolean).join(" · "),
    company: it.company?.name ?? "",
    companyLogo: it.company?.logoUrl ?? null,
    location: null,
    categories: it.jobCategory ? [it.jobCategory] : [],
    techStacks: [],
    minCareer: min,
    maxCareer: max,
    newcomer: (it.seniorities ?? []).includes("BEGINNER"),
    employmentType: it.employmentTypes?.join(", ") || null,
    deadline: kstToIso(it.endAt),
    alwaysOpen: !it.endAt,
    postedAt: null,
    salaryText: null,
    educationText: null,
    tags: [it.workType ? (WORK_TYPE[it.workType] ?? it.workType) : null, remote ? "원격 가능" : null].filter(
      (x): x is string => !!x,
    ),
    description: null,
  };
}

export function parseRocketpunchDetail(base: NormalizedJob, d: RpDetail): NormalizedJob {
  return {
    ...parseRocketpunchSummary(d),
    // 상세의 hiring=false / status=finish 는 마감 처리
    deadline: d.hiring === false || d.status === "finish" ? new Date(0).toISOString() : (kstToIso(d.endAt) ?? base.deadline),
    postedAt: kstToIso(d.startAt ?? d.createdAt) ?? base.postedAt,
    description: {
      intro: cleanText(d.description),
      responsibilities: cleanText(d.duty),
      qualifications: cleanText(d.minimumQualification),
      preferred: cleanText(d.preferredQualification),
      benefits: cleanText(d.benefit),
      process: cleanText(d.hireProcess),
    },
  };
}

function headers() {
  return { "X-RP-API-Key": process.env.ROCKETPUNCH_API_KEY!, "Accept-Language": "ko" };
}

export const rocketpunch: SourceAdapter = {
  id: "rocketpunch",
  enabled: (env) => !!env.ROCKETPUNCH_API_KEY,
  detailLimit: 40,
  async list(ctx) {
    const out = new Map<string, NormalizedJob>();
    const delay = Math.max(ctx.delayMs, 1100); // 분당 60회 한도
    for (const kw of ROCKETPUNCH_KEYWORDS) {
      for (let page = 1; page <= ctx.maxPages; page++) {
        const qs = new URLSearchParams({ keyword: kw, sort: "DATE_DESC", page: String(page), pageSize: String(PAGE_SIZE) });
        for (const s of ["BEGINNER", "JUNIOR", "MIDLEVEL"]) qs.append("seniorities", s);
        const res = await fetchJson<RpPage>(`${API}/jobs?${qs}`, { headers: headers() });
        const items = (res.items ?? []).map(parseRocketpunchSummary);
        for (const it of items) out.set(it.id, it);
        ctx.log(`  rocketpunch "${kw}" p${page}: ${items.length}건`);
        if (page >= (res.totalPages ?? 1)) break;
        await sleep(delay);
      }
      await sleep(delay);
    }
    return [...out.values()];
  },
  async detail(job, ctx) {
    await sleep(Math.max(ctx.delayMs, 1100));
    const d = await fetchJson<RpDetail>(`${API}/jobs/${job.externalId}`, { headers: headers() });
    return parseRocketpunchDetail(job, d);
  },
};
