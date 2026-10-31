import { makeJobId, type NormalizedJob } from "@archiev/core";
import { fetchJson } from "../http";
import { envFlag, isTechRole, kstToIso, type SourceAdapter } from "./types";

/**
 * KT 그룹 (recruit.kt.com) — KT 및 계열사(kt cloud, kt ds, kt sat …)
 * KT 채용 페이지가 쓰는 목록 엔드포인트입니다. (2026-10 확인)
 *   GET https://recruit.kt.com/api/recruit?currentPage=1&pageSize=100&isInProgress=true&isContainsContents=false
 *   → { isSuccess, data[] }. 공고 하나에 여러 모집 분야(recruitSectorList)가 들어 있습니다.
 */

const BASE = "https://recruit.kt.com";

export interface KtNotice {
  recruitNoticeSn: number;
  recruitNoticeName?: string;
  title?: string;
  company?: string;
  recruitClassName?: string; // 신입, 경력
  recruitTypeName?: string; // 일반채용, 공개채용 …
  recruitSectorList?: { recruitSectorSn?: number; recruitSectorName?: string }[] | string;
  receiveStartDatetime?: string; // "2026-10-19 00:00:00"
  receiveEndDatetime?: string;
  recruitNoticeUrl?: string | null;
  isInProgress?: boolean;
}

function sectors(n: KtNotice): string[] {
  let list = n.recruitSectorList;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list) as KtNotice["recruitSectorList"];
    } catch {
      list = [];
    }
  }
  return (Array.isArray(list) ? list : []).map((s) => s.recruitSectorName?.trim() ?? "").filter(Boolean);
}

export function parseKt(data: KtNotice[]): NormalizedJob[] {
  return data
    .filter((n) => n.isInProgress !== false)
    .map((n) => ({ n, sec: sectors(n), title: (n.recruitNoticeName || n.title || "").trim() }))
    .filter(({ sec, title }) => isTechRole(title, ...sec))
    .map(({ n, sec, title }) => ({
      id: makeJobId("kt", n.recruitNoticeSn),
      source: "kt" as const,
      externalId: String(n.recruitNoticeSn),
      url: n.recruitNoticeUrl || `${BASE}/careers`,
      title,
      company: n.company?.trim() || "KT",
      companyLogo: null,
      location: null,
      // 기술 쪽 모집 분야만 분류로 (비개발 분야가 섞인 통합 공고가 많음)
      categories: sec.filter((s) => isTechRole(s)),
      techStacks: [],
      minCareer: n.recruitClassName === "신입" ? 0 : null,
      maxCareer: null,
      newcomer: n.recruitClassName === "신입",
      employmentType: null,
      deadline: kstToIso(n.receiveEndDatetime),
      alwaysOpen: false,
      postedAt: kstToIso(n.receiveStartDatetime),
      salaryText: null,
      educationText: null,
      tags: [n.recruitTypeName, n.recruitClassName, ...sec.filter((s) => !isTechRole(s)).slice(0, 3)].filter((s): s is string => !!s),
      description: null,
    }));
}

export const kt: SourceAdapter = {
  id: "kt",
  enabled: (env) => envFlag(env.SOURCE_KT, true),
  async list(ctx) {
    const res = await fetchJson<{ isSuccess?: boolean; data?: KtNotice[] }>(
      `${BASE}/api/recruit?currentPage=1&pageSize=100&isInProgress=true&isContainsContents=false`,
      { headers: { Referer: `${BASE}/careers` } },
    );
    const jobs = parseKt(res.data ?? []);
    ctx.log(`  kt: 진행 중 ${res.data?.length ?? 0}건 중 기술 직군 ${jobs.length}건`);
    return jobs;
  },
};
