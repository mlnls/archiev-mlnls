import { makeJobId, type NormalizedJob } from "@archiev/core";
import { fetchJson } from "../http";
import { envFlag, isTechRole, kstToIso, type SourceAdapter } from "./types";

/**
 * 네이버 (recruit.navercorp.com) — 네이버 및 계열사
 * 네이버 채용 페이지가 쓰는 목록 엔드포인트입니다. (2026-10 확인)
 *   GET https://recruit.navercorp.com/rcrt/loadJobList.do?firstIndex=0&recordCountPerPage=300
 *   → { result, list[], totalSize }. 공고 페이지는 jobDetailLink (본문은 HTML 페이지라 목록 정보만 씀)
 */

const BASE = "https://recruit.navercorp.com";

export interface NaverJob {
  annoId: number;
  annoSubject: string;
  classCdNm?: string; // 대분류 (Tech, Service & Business, Design, Corporate)
  subJobCdNm?: string; // 세부 직무 (Frontend, AI/ML, …)
  sysCompanyCdNm?: string; // 회사 (NAVER, NAVER Cloud, …)
  empTypeCdNm?: string; // 정규, 계약 …
  entTypeCdNm?: string; // 신입, 경력, 무관
  reqTypeCdNm?: string; // 수시, 공채
  staYmdTime?: string; // "2026.10.08 12:00:00"
  endYmdTime?: string; // "2026.10.27 18:00:00", 2999 = 상시, 2099 = 채용 시 마감
  jobDetailLink?: string;
}

const naverTime = (s: string | undefined) => (s ? kstToIso(s.replace(/\./g, "-")) : null);

export function parseNaver(list: NaverJob[]): NormalizedJob[] {
  return list
    .filter((j) => j.classCdNm === "Tech" || isTechRole(j.subJobCdNm, j.annoSubject))
    .map((j) => {
      const year = Number(j.endYmdTime?.slice(0, 4));
      const alwaysOpen = year >= 2099;
      return {
        id: makeJobId("naver", j.annoId),
        source: "naver",
        externalId: String(j.annoId),
        url: j.jobDetailLink || `${BASE}/rcrt/view.do?annoId=${j.annoId}`,
        title: j.annoSubject.trim(),
        company: j.sysCompanyCdNm?.trim() || "NAVER",
        companyLogo: null,
        location: "성남 분당구",
        categories: [j.classCdNm, j.subJobCdNm].filter((s): s is string => !!s && s !== "공통"),
        techStacks: [],
        minCareer: j.entTypeCdNm === "신입" ? 0 : null,
        maxCareer: null,
        newcomer: j.entTypeCdNm === "신입" || j.entTypeCdNm === "무관",
        employmentType: j.empTypeCdNm ? `${j.empTypeCdNm}직`.replace("직직", "직") : null,
        deadline: alwaysOpen ? null : naverTime(j.endYmdTime),
        alwaysOpen,
        postedAt: naverTime(j.staYmdTime),
        salaryText: null,
        educationText: null,
        tags: [j.reqTypeCdNm, j.entTypeCdNm].filter((s): s is string => !!s),
        description: null,
      };
    });
}

export const naver: SourceAdapter = {
  id: "naver",
  enabled: (env) => envFlag(env.SOURCE_NAVER, true),
  async list(ctx) {
    const res = await fetchJson<{ list?: NaverJob[]; totalSize?: number }>(
      `${BASE}/rcrt/loadJobList.do?annoId=&sw=&subJobCdArr=&sysCompanyCdArr=&empTypeCdArr=&entTypeCdArr=&workAreaCdArr=&firstIndex=0&recordCountPerPage=300`,
      { headers: { Referer: `${BASE}/rcrt/list.do`, "X-Requested-With": "XMLHttpRequest" } },
    );
    const jobs = parseNaver(res.list ?? []);
    ctx.log(`  naver: 전체 ${res.totalSize ?? res.list?.length ?? 0}건 중 기술 직군 ${jobs.length}건`);
    return jobs;
  },
};
