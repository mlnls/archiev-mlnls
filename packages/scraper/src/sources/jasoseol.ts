import { makeJobId, type NormalizedJob } from "@archiev/core";
import { fetchJson } from "../http";
import { envFlag, type SourceAdapter } from "./types";

/**
 * 자소설닷컴 (jasoseol.com) — 대기업·중견기업 공채가 모이는 채용 달력
 * 자소설닷컴 웹이 쓰는 엔드포인트입니다. (2026-10 확인, robots.txt 허용 경로)
 *   목록: POST https://jasoseol.com/employment/calendar_list.json  {start_time, end_time}
 *         → 기간 안에 "시작 또는 마감"이 걸친 공고. 그래서 앞뒤로 넉넉한 기간을 한 번에 조회하고 마감 전 공고만 남깁니다.
 *   직무 코드표: GET https://jasoseol.com/api/v1/duty-groups  (대분류 large → 중분류 medium → 소분류 small)
 *   공고 페이지: https://jasoseol.com/recruit/{id}
 * 본문은 대부분 이미지라 목록 정보(회사·제목·직무·기간)만 씁니다.
 */

const BASE = "https://jasoseol.com";
/** 직무 대분류 "IT·인터넷" */
const IT_LARGE_GROUP_ID = 94;
const DAY = 24 * 60 * 60 * 1000;

export interface JasoseolDutyGroup {
  id: number;
  name: string;
  group_id: number | null;
  category: "large" | "medium" | "small" | string;
}

export interface JasoseolEmployment {
  id: number;
  name: string;
  title: string;
  start_time?: string | null;
  end_time?: string | null;
  image_file_name?: string | null;
  recruit_type?: number | null;
  business_size?: string | null;
  company_group?: { id?: number; name?: string; business_size?: string | null } | null;
  employments?: { id: number; division?: number | null; duty_groups?: { group_id: number }[]; apply?: string | null }[];
}

/** 모집 구분 코드 (화면 필터: 신입·경력·인턴·…). 확인된 값만 씁니다 */
const DIVISION: Record<number, string> = { 1: "신입", 2: "경력", 3: "인턴" };

const BUSINESS_SIZE: Record<string, string> = {
  big_business: "대기업",
  middle_market: "중견기업",
  public: "공공기관",
};

/** 직무 코드표에서 IT·인터넷 아래 모든 코드와 이름 */
export function itDutyNames(groups: JasoseolDutyGroup[]): Map<number, string> {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out = new Map<number, string>();
  for (const g of groups) {
    let cur: JasoseolDutyGroup | undefined = g;
    for (let depth = 0; cur && depth < 4; depth++) {
      if (cur.id === IT_LARGE_GROUP_ID) {
        if (g.id !== IT_LARGE_GROUP_ID) out.set(g.id, g.name === "기타" && g.group_id ? `${byId.get(g.group_id)?.name ?? ""} 기타` : g.name);
        break;
      }
      cur = cur.group_id != null ? byId.get(cur.group_id) : undefined;
    }
  }
  return out;
}

export function parseJasoseol(list: JasoseolEmployment[], itDuties: Map<number, string>, now = new Date()): NormalizedJob[] {
  const out: NormalizedJob[] = [];
  for (const e of list) {
    if (!e.end_time || new Date(e.end_time).getTime() < now.getTime()) continue;
    const parts = e.employments ?? [];
    const duties = new Set<string>();
    for (const p of parts) for (const d of p.duty_groups ?? []) if (itDuties.has(d.group_id)) duties.add(itDuties.get(d.group_id)!);
    if (duties.size === 0) continue; // IT 직무가 하나도 없는 공고는 건너뜀
    const divisions = [...new Set(parts.map((p) => (p.division != null ? DIVISION[p.division] : undefined)).filter(Boolean))] as string[];
    const size = e.business_size ?? e.company_group?.business_size ?? null;
    out.push({
      id: makeJobId("jasoseol", e.id),
      source: "jasoseol",
      externalId: String(e.id),
      url: `${BASE}/recruit/${e.id}`,
      title: e.title?.trim() ?? "",
      company: (e.company_group?.name ?? e.name ?? "").trim(),
      companyLogo: e.image_file_name?.startsWith("http") ? e.image_file_name : null,
      location: null,
      categories: [...duties],
      techStacks: [],
      minCareer: divisions.length === 1 && divisions[0] === "신입" ? 0 : null,
      maxCareer: null,
      newcomer: divisions.includes("신입") || divisions.includes("인턴"),
      employmentType: divisions.includes("인턴") ? "인턴" : null,
      deadline: new Date(e.end_time).toISOString(),
      alwaysOpen: false,
      postedAt: e.start_time ? new Date(e.start_time).toISOString() : null,
      salaryText: null,
      educationText: null,
      tags: [...(size && BUSINESS_SIZE[size] ? [BUSINESS_SIZE[size]!] : []), ...(e.recruit_type === 0 ? ["공채"] : []), ...divisions],
      description: null,
    });
  }
  return out;
}

export const jasoseol: SourceAdapter = {
  id: "jasoseol",
  enabled: (env) => envFlag(env.SOURCE_JASOSEOL, true),
  async list(ctx) {
    const headers = { Origin: BASE, Referer: `${BASE}/recruit` };
    const groups = await fetchJson<JasoseolDutyGroup[]>(`${BASE}/api/v1/duty-groups`, { headers });
    const itDuties = itDutyNames(groups);
    const now = Date.now();
    // 시작 또는 마감이 이 기간에 걸친 공고가 오므로, 진행 중인 공고를 놓치지 않게 앞뒤로 넉넉히 잡습니다
    const res = await fetchJson<{ employment?: JasoseolEmployment[] }>(`${BASE}/employment/calendar_list.json`, {
      headers,
      body: { start_time: new Date(now - 120 * DAY).toISOString(), end_time: new Date(now + 120 * DAY).toISOString() },
    });
    const jobs = parseJasoseol(res.employment ?? [], itDuties, new Date(now));
    ctx.log(`  jasoseol: 전체 ${res.employment?.length ?? 0}건 중 진행 중 IT 직무 ${jobs.length}건`);
    return jobs;
  },
};
