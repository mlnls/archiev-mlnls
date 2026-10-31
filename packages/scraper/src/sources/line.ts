import { makeJobId, type NormalizedJob } from "@archiev/core";
import { fetchJson } from "../http";
import { envFlag, isKoreaLocation, isTechRole, type SourceAdapter } from "./types";

/**
 * 라인 (careers.linecorp.com) — LINE Plus 등 국내 법인 공고만
 * 채용 사이트(Gatsby)가 빌드해 둔 정적 데이터 파일입니다. (2026-10 확인)
 *   GET https://careers.linecorp.com/page-data/ko/jobs/page-data.json
 *   → result.data.allStrapiJobs.edges[].node
 *   공고 페이지: https://careers.linecorp.com/ko/jobs/{strapiId}
 */

const BASE = "https://careers.linecorp.com";

type Named = { id?: number; name?: string };

export interface LineJobNode {
  strapiId: number;
  title: string;
  title_en?: string;
  publish?: boolean;
  is_public?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  until_filled?: boolean;
  employment_type?: Named[];
  job_unit?: Named[];
  job_fields?: Named[];
  companies?: Named[];
  cities?: (Named & { country?: number })[];
}

export interface LinePageData {
  result?: { data?: { allStrapiJobs?: { edges?: { node: LineJobNode }[] } } };
}

const names = (xs: Named[] | undefined) => (xs ?? []).map((x) => x.name?.trim() ?? "").filter(Boolean);

export function parseLine(res: LinePageData, now = new Date()): NormalizedJob[] {
  const out: NormalizedJob[] = [];
  for (const { node: n } of res.result?.data?.allStrapiJobs?.edges ?? []) {
    if (n.publish === false || n.is_public === false) continue;
    const cities = names(n.cities);
    if (!cities.some((c) => isKoreaLocation(c)) && cities.length) continue;
    const units = names(n.job_unit);
    const fields = names(n.job_fields).filter((f) => !/not in use/i.test(f));
    if (!(units.includes("Engineering") || isTechRole(n.title, n.title_en, ...fields))) continue;
    const end = n.end_date && !n.end_date.startsWith("2999") ? new Date(n.end_date) : null;
    if (end && end.getTime() < now.getTime()) continue;
    out.push({
      id: makeJobId("line", n.strapiId),
      source: "line",
      externalId: String(n.strapiId),
      url: `${BASE}/ko/jobs/${n.strapiId}`,
      title: n.title.trim(),
      company: names(n.companies)[0] ?? "LINE",
      companyLogo: null,
      location: cities.join(", ") || null,
      categories: [...units, ...fields],
      techStacks: [],
      minCareer: null,
      maxCareer: null,
      newcomer: /신입|new grad|intern|인턴/i.test(`${n.title} ${n.title_en ?? ""}`),
      employmentType: names(n.employment_type)[0] ?? null,
      deadline: end ? end.toISOString() : null,
      alwaysOpen: !end || !!n.until_filled,
      postedAt: n.start_date ? new Date(n.start_date).toISOString() : null,
      salaryText: null,
      educationText: null,
      tags: [],
      description: null,
    });
  }
  return out;
}

export const line: SourceAdapter = {
  id: "line",
  enabled: (env) => envFlag(env.SOURCE_LINE, true),
  async list(ctx) {
    const res = await fetchJson<LinePageData>(`${BASE}/page-data/ko/jobs/page-data.json`, { headers: { Referer: `${BASE}/ko/jobs/` } });
    const jobs = parseLine(res);
    ctx.log(`  line: 전체 ${res.result?.data?.allStrapiJobs?.edges?.length ?? 0}건 중 국내 기술 직군 ${jobs.length}건`);
    return jobs;
  },
};
