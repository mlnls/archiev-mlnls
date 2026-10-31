import { makeJobId, type NormalizedJob } from "@archiev/core";
import * as cheerio from "cheerio";
import { fetchHtml, fetchJson, sleep } from "../http";
import { envFlag, type SourceAdapter, type SourceContext } from "./types";

/**
 * 사람인 공식 오픈 API (https://oapi.saramin.co.kr/guide/job-search)
 * SARAMIN_ACCESS_KEY 가 있으면 공식 API를, 없으면 공개 검색 페이지를 씁니다.
 * 어느 쪽도 본문(JD) 전문은 주지 않아 키워드/직무 분류로만 매칭합니다.
 */

const API = "https://oapi.saramin.co.kr/job-search";
const PAGE_SIZE = 110; // API 최대값

export const SARAMIN_KEYWORDS = ["프론트엔드", "React", "Next.js", "DevOps", "클라우드 엔지니어", "인프라 엔지니어"];

type Coded = { code?: string | number; name?: string; min?: string | number; max?: string | number } | string | undefined;

interface SaraminJob {
  id: string | number;
  url?: string;
  active?: string | number;
  "posting-timestamp"?: string | number;
  "expiration-timestamp"?: string | number;
  "close-type"?: Coded;
  company?: { detail?: { name?: string; href?: string }; name?: string | { content?: string } };
  position?: {
    title?: string;
    location?: Coded;
    "job-type"?: Coded;
    "job-mid-code"?: Coded;
    "job-code"?: Coded;
    "experience-level"?: Coded;
    "required-education-level"?: Coded;
  };
  keyword?: string;
  salary?: Coded;
}

interface SaraminResponse {
  jobs?: { count?: number; start?: number; total?: string | number; job?: SaraminJob[] };
  code?: number;
  message?: string;
}

const nameOf = (c: Coded): string | null => (typeof c === "string" ? c : (c?.name ?? null))?.trim() || null;
const codeOf = (c: Coded): string | null => (typeof c === "object" && c?.code != null ? String(c.code) : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : null;
};
const tsToIso = (v: unknown) => {
  const n = num(v);
  return n ? new Date(n * 1000).toISOString() : null;
};

export function parseSaraminJob(j: SaraminJob): NormalizedJob {
  const pos = j.position ?? {};
  const exp = pos["experience-level"];
  const expCode = codeOf(exp); // 1 신입, 2 경력, 3 신입/경력, 0 경력무관
  const closeType = codeOf(j["close-type"]); // 1 마감일, 2 채용시, 3 상시, 4 수시
  const company =
    j.company?.detail?.name ??
    (typeof j.company?.name === "string" ? j.company.name : j.company?.name?.content) ??
    "";
  const keywords = (j.keyword ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const min = typeof exp === "object" ? num(exp.min) : null;
  const max = typeof exp === "object" ? num(exp.max) : null;
  return {
    id: makeJobId("saramin", j.id),
    source: "saramin",
    externalId: String(j.id),
    url: j.url?.trim() || `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${j.id}`,
    title: pos.title?.trim() ?? "",
    company: company.trim(),
    companyLogo: null,
    location: nameOf(pos.location)?.replace(/&gt;/g, ">") ?? null,
    categories: (nameOf(pos["job-code"]) ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    techStacks: keywords,
    minCareer: expCode === "1" ? 0 : expCode === "0" ? null : (min ?? null),
    maxCareer: expCode === "1" ? 0 : max && max > 0 && max < 30 ? max : null,
    newcomer: expCode === "1" || expCode === "3",
    employmentType: nameOf(pos["job-type"]),
    deadline: closeType === "1" ? tsToIso(j["expiration-timestamp"]) : null,
    alwaysOpen: closeType !== "1",
    postedAt: tsToIso(j["posting-timestamp"]),
    salaryText: nameOf(j.salary),
    educationText: nameOf(pos["required-education-level"]),
    tags: [],
    description: null,
  };
}

export function parseSaramin(res: SaraminResponse): NormalizedJob[] {
  if (res.code && !res.jobs) throw new Error(`사람인 API 오류 ${res.code}: ${res.message ?? ""}`);
  return (res.jobs?.job ?? []).map(parseSaraminJob);
}

/** "~ 11/30(월)" → 올해(지났으면 내년) 11/30 마감 */
function parseSaraminDeadline(text: string, now: Date): { deadline: string | null; alwaysOpen: boolean } {
  const m = /(\d{1,2})\/(\d{1,2})/.exec(text);
  if (!m) return { deadline: null, alwaysOpen: true };
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = now.getFullYear();
  const pad = (n: number) => String(n).padStart(2, "0");
  let d = new Date(`${year}-${pad(month)}-${pad(day)}T23:59:59+09:00`);
  if (d.getTime() < now.getTime() - 30 * 86_400_000) {
    year += 1;
    d = new Date(`${year}-${pad(month)}-${pad(day)}T23:59:59+09:00`);
  }
  return { deadline: d.toISOString(), alwaysOpen: false };
}

export function parseCareerText(text: string): Pick<NormalizedJob, "minCareer" | "maxCareer" | "newcomer"> {
  const t = text.replace(/\s/g, "");
  const range = /(\d+)~(\d+)년/.exec(t);
  const min = /(\d+)년[↑이상]/.exec(t);
  const newcomer = /신입|경력무관/.test(t);
  if (range) return { minCareer: Number(range[1]), maxCareer: Number(range[2]), newcomer };
  if (min) return { minCareer: Number(min[1]), maxCareer: null, newcomer };
  if (/^신입$/.test(t)) return { minCareer: 0, maxCareer: 0, newcomer: true };
  return { minCareer: null, maxCareer: null, newcomer };
}

/** 공개 검색 결과 페이지의 공고 카드를 파싱합니다 */
export function parseSaraminSearch(html: string, now = new Date()): NormalizedJob[] {
  const $ = cheerio.load(html);
  const out: NormalizedJob[] = [];
  $(".item_recruit").each((_, el) => {
    const card = $(el);
    const id = card.attr("value")?.trim();
    const link = card.find(".job_tit a").first();
    const title = (link.attr("title") ?? link.text()).trim();
    const company = card.find(".corp_name a").first().text().trim();
    if (!id || !title || !company) return;
    const spans = card.find(".job_condition > span").toArray().map((x) => $(x).text().replace(/\s+/g, " ").trim());
    const posted = /(\d{2})\/(\d{2})\/(\d{2})/.exec(card.find(".job_day").text());
    out.push({
      id: makeJobId("saramin", id),
      source: "saramin",
      externalId: id,
      url: `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${id}`,
      title,
      company,
      companyLogo: null,
      location: spans[0] ?? null,
      categories: card.find(".job_sector a").toArray().map((x) => $(x).text().trim()).filter(Boolean),
      techStacks: [],
      ...parseCareerText(spans[1] ?? ""),
      employmentType: spans[3] ?? null,
      ...parseSaraminDeadline(card.find(".job_date .date").text(), now),
      postedAt: posted ? new Date(`20${posted[1]}-${posted[2]}-${posted[3]}T00:00:00+09:00`).toISOString() : null,
      salaryText: null,
      educationText: spans[2] ?? null,
      tags: [],
      description: null,
    });
  });
  return out;
}

async function listByApi(key: string, ctx: SourceContext) {
  // 매일 돌리므로 최근 7일 등록 공고만 (처음 실행 시에도 과도한 수집 방지)
  const since = Math.floor((Date.now() - 7 * 86_400_000) / 1000);
  const out = new Map<string, NormalizedJob>();
  for (const kw of SARAMIN_KEYWORDS) {
    for (let page = 0; page < Math.min(ctx.maxPages, 3); page++) {
      const qs = new URLSearchParams({
        "access-key": key,
        keywords: kw,
        sr: "directhire",
        sort: "pd",
        count: String(PAGE_SIZE),
        start: String(page),
        published_min: String(since),
      });
      const items = parseSaramin(await fetchJson<SaraminResponse>(`${API}?${qs}`));
      for (const it of items) out.set(it.id, it);
      ctx.log(`  saramin "${kw}" p${page + 1}: ${items.length}건`);
      if (items.length < PAGE_SIZE) break;
      await sleep(ctx.delayMs);
    }
    await sleep(ctx.delayMs);
  }
  return [...out.values()];
}

async function listBySearch(ctx: SourceContext) {
  const out = new Map<string, NormalizedJob>();
  for (const kw of SARAMIN_KEYWORDS) {
    for (let page = 1; page <= Math.min(ctx.maxPages, 2); page++) {
      const qs = new URLSearchParams({ searchword: kw, recruitPage: String(page), recruitPageCount: "40", recruitSort: "reg_dt" });
      const items = parseSaraminSearch(await fetchHtml(`https://www.saramin.co.kr/zf_user/search/recruit?${qs}`));
      for (const it of items) out.set(it.id, it);
      ctx.log(`  saramin "${kw}" p${page}: ${items.length}건`);
      await sleep(ctx.delayMs);
      if (items.length < 40) break;
    }
  }
  return [...out.values()];
}

export const saramin: SourceAdapter = {
  id: "saramin",
  enabled: (env) => envFlag(env.SOURCE_SARAMIN),
  unseenGraceDays: 14,
  list: (ctx) => {
    const key = process.env.SARAMIN_ACCESS_KEY;
    return key ? listByApi(key, ctx) : listBySearch(ctx);
  },
};
