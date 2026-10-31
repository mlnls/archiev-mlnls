import { makeJobId, type NormalizedJob } from "@archiev/core";
import { fetchJson, sleep } from "../http";
import { envFlag, htmlToText, isKoreaLocation, isTechRole, splitSections, type SourceAdapter } from "./types";

/**
 * 기업 채용 페이지 (Greenhouse 공개 Job Board API)
 * Greenhouse는 채용 보드를 외부에 공개하라고 만든 공식 API를 제공합니다. 키가 필요 없습니다.
 *   GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true
 *   https://developers.greenhouse.io/job-board.html
 *
 * 보드 목록은 GREENHOUSE_BOARDS 로 바꿀 수 있습니다: "보드:회사명,보드:회사명"
 * 기본값은 2026-10에 국내 공고가 있는 것을 확인한 보드입니다.
 * 새 회사를 추가하려면 그 회사 채용 페이지 링크의 gh_jid / boards.greenhouse.io/{보드} 를 확인하세요.
 */

export const DEFAULT_GREENHOUSE_BOARDS = "coupang:쿠팡,daangn:당근,krafton:크래프톤,lgairesearch:LG AI연구원,furiosaai:퓨리오사AI,moloco:몰로코,sendbird:센드버드";

const API = "https://boards-api.greenhouse.io/v1/boards";

export interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string } | null;
  updated_at?: string;
  first_published?: string;
  company_name?: string;
  content?: string;
  departments?: { name?: string }[];
  offices?: { name?: string }[];
  metadata?: { name?: string; value?: unknown }[] | null;
}

export function parseBoards(spec: string | undefined): { board: string; company: string }[] {
  return (spec?.trim() ? spec : DEFAULT_GREENHOUSE_BOARDS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [board, company] = s.split(":").map((x) => x.trim());
      return { board: board!, company: company || board! };
    });
}

export function parseGreenhouse(board: string, company: string, jobs: GreenhouseJob[]): NormalizedJob[] {
  return jobs
    .filter((j) => isKoreaLocation(j.location?.name) || (j.offices ?? []).some((o) => isKoreaLocation(o.name)))
    .filter((j) => isTechRole(j.title, ...(j.departments ?? []).map((d) => d.name)))
    .map((j) => {
      const meta = (name: RegExp) => j.metadata?.find((m) => m.name && name.test(m.name))?.value;
      const employment = meta(/employment\s?type/i);
      const departments = (j.departments ?? []).map((d) => d.name?.trim() ?? "").filter(Boolean);
      const keywords = meta(/^keywords?$/i);
      return {
        // 보드마다 id 공간이 같으므로 보드 이름을 붙입니다
        id: makeJobId("greenhouse", `${board}-${j.id}`),
        source: "greenhouse" as const,
        externalId: `${board}-${j.id}`,
        url: j.absolute_url,
        title: j.title.trim(),
        company,
        companyLogo: null,
        location: j.location?.name ?? null,
        categories: departments,
        techStacks: typeof keywords === "string" ? keywords.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12) : [],
        minCareer: null,
        maxCareer: null,
        newcomer: /신입|new grad|junior|주니어|intern|인턴/i.test(j.title),
        employmentType: typeof employment === "string" ? employment : null,
        deadline: null,
        alwaysOpen: true,
        postedAt: j.first_published ? new Date(j.first_published).toISOString() : null,
        salaryText: null,
        educationText: null,
        tags: [],
        description: splitSections(htmlToText(j.content)),
      };
    });
}

export const greenhouse: SourceAdapter = {
  id: "greenhouse",
  enabled: (env) => envFlag(env.SOURCE_GREENHOUSE, true),
  async list(ctx) {
    const out: NormalizedJob[] = [];
    const errors: string[] = [];
    for (const { board, company } of parseBoards(process.env.GREENHOUSE_BOARDS)) {
      try {
        const res = await fetchJson<{ jobs?: GreenhouseJob[] }>(`${API}/${encodeURIComponent(board)}/jobs?content=true`);
        const jobs = parseGreenhouse(board, company, res.jobs ?? []);
        ctx.log(`  greenhouse ${company}: 전체 ${res.jobs?.length ?? 0}건 중 국내 기술 직군 ${jobs.length}건`);
        out.push(...jobs);
      } catch (e) {
        // 보드 하나가 없어지거나 막혀도 나머지는 계속
        errors.push(`${board}: ${e instanceof Error ? e.message : String(e)}`);
        ctx.log(`  ✖ greenhouse ${company}: ${errors.at(-1)}`);
      }
      await sleep(ctx.delayMs);
    }
    if (!out.length && errors.length) throw new Error(errors.join(" / "));
    return out;
  },
};
