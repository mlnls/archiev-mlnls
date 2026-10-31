import { makeJobId, type NormalizedJob } from "@archiev/core";
import { fetchJson, sleep } from "../http";
import { cleanText, envFlag, kstToIso, type SourceAdapter } from "./types";

/**
 * 원티드 (wanted.co.kr)
 * 공식 공개 API가 아니라 원티드 웹이 쓰는 JSON 엔드포인트입니다.
 * 개인 용도로 하루 한 번, 적은 페이지만 조회하도록 제한합니다. 구조가 바뀌면 이 파일만 고치면 됩니다.
 * (2026-10 확인: /api/chaos/navigation/v1/results, /api/chaos/jobs/v4/{id}/details)
 */

const BASE = "https://www.wanted.co.kr";
const PAGE_SIZE = 20;

/** 수집할 원티드 직무 id (개발 직군 518 하위) */
export const WANTED_JOB_IDS: Record<number, string> = {
  669: "프론트엔드 개발자",
  873: "웹 개발자",
  674: "DevOps / 시스템 관리자",
  665: "시스템,네트워크 관리자",
};

/** 목록 응답의 category_tag.id → 이름 (트랙 판정에 쓰이는 것 위주) */
const CATEGORY_NAMES: Record<number, string> = {
  ...WANTED_JOB_IDS,
  872: "서버 개발자",
  660: "자바 개발자",
  899: "파이썬 개발자",
  895: "Node.js 개발자",
  10110: "소프트웨어 엔지니어",
  1634: "머신러닝 엔지니어",
  655: "데이터 엔지니어",
  677: "안드로이드 개발자",
  678: "iOS 개발자",
  1027: "블록체인 플랫폼 엔지니어",
  1026: "기술지원",
  900: "C,C++ 개발자",
  658: "임베디드 개발자",
};

const EMPLOYMENT: Record<string, string> = {
  regular: "정규직",
  contract: "계약직",
  intern: "인턴",
  freelancer: "프리랜서",
};

interface WantedListItem {
  id: number;
  position: string;
  company?: { id?: number; name?: string };
  address?: { country?: string; location?: string; district?: string } | null;
  category_tag?: { parent_id?: number; id?: number } | null;
  skill_tags?: unknown[];
  annual_from?: number | null;
  annual_to?: number | null;
  is_newbie?: boolean;
  employment_type?: string | null;
  due_time?: string | null;
}

interface WantedListResponse {
  data?: WantedListItem[];
  links?: { next?: string | null };
}

function tagText(t: unknown): string | null {
  if (typeof t === "string") return t;
  if (t && typeof t === "object") {
    const o = t as Record<string, unknown>;
    for (const k of ["text", "title", "name", "keyword"]) if (typeof o[k] === "string") return o[k] as string;
  }
  return null;
}

function careerBound(n: number | null | undefined): number | null {
  if (n == null || n < 0) return null;
  return n >= 30 ? null : n; // annual_to=100 은 '제한 없음'
}

export function parseWantedList(res: WantedListResponse, queriedJobId?: number): NormalizedJob[] {
  return (res.data ?? []).map((it) => {
    const catId = it.category_tag?.id;
    const categories = [
      ...(catId && CATEGORY_NAMES[catId] ? [CATEGORY_NAMES[catId]!] : []),
      ...(queriedJobId && WANTED_JOB_IDS[queriedJobId] && queriedJobId !== catId ? [WANTED_JOB_IDS[queriedJobId]!] : []),
    ];
    const loc = [it.address?.location, it.address?.district].filter(Boolean).join(" ") || null;
    return {
      id: makeJobId("wanted", it.id),
      source: "wanted",
      externalId: String(it.id),
      url: `${BASE}/wd/${it.id}`,
      title: it.position?.trim() ?? "",
      company: it.company?.name?.trim() ?? "",
      companyLogo: null,
      location: loc,
      categories,
      techStacks: (it.skill_tags ?? []).map(tagText).filter((x): x is string => !!x),
      minCareer: careerBound(it.annual_from),
      maxCareer: careerBound(it.annual_to),
      newcomer: !!it.is_newbie || it.annual_from === 0,
      employmentType: it.employment_type ? (EMPLOYMENT[it.employment_type] ?? it.employment_type) : null,
      deadline: kstToIso(it.due_time),
      alwaysOpen: !it.due_time,
      postedAt: null,
      salaryText: null,
      educationText: null,
      tags: [],
      description: null,
    } satisfies NormalizedJob;
  });
}

interface WantedDetailResponse {
  data?: {
    job?: {
      id: number;
      status?: string;
      due_time?: string | null;
      detail?: {
        intro?: string;
        main_tasks?: string;
        requirements?: string;
        preferred_points?: string;
        benefits?: string;
        hire_rounds?: string;
      };
      address?: { full_location?: string; location?: string; district?: string } | null;
      skill_tags?: unknown[];
      attraction_tags?: { title?: string }[];
      company?: { name?: string; logo_img?: { thumb?: string } | null };
      category_tag?: { parent_tag?: { id: number; text: string }; child_tags?: { id: number; text: string }[] } | null;
      employment_type?: string | null;
      annual_from?: number | null;
      annual_to?: number | null;
    };
  };
}

export function parseWantedDetail(base: NormalizedJob, res: WantedDetailResponse): NormalizedJob {
  const j = res.data?.job;
  if (!j) return base;
  const d = j.detail ?? {};
  // 목록의 skill_tags는 숫자 id뿐이고, 상세에서 {tag_type_id, text} 형태로 이름이 옵니다
  const skills = (j.skill_tags ?? []).map(tagText).filter((x): x is string => !!x);
  const childCats = (j.category_tag?.child_tags ?? []).map((c) => c.text).filter(Boolean);
  return {
    ...base,
    categories: childCats.length ? [...new Set([...childCats, ...base.categories])] : base.categories,
    company: j.company?.name?.trim() || base.company,
    companyLogo: j.company?.logo_img?.thumb ?? base.companyLogo,
    location: [j.address?.location, j.address?.district].filter(Boolean).join(" ") || base.location,
    techStacks: skills.length ? skills : base.techStacks,
    deadline: kstToIso(j.due_time) ?? base.deadline,
    alwaysOpen: !j.due_time,
    employmentType: j.employment_type ? (EMPLOYMENT[j.employment_type] ?? j.employment_type) : base.employmentType,
    tags: (j.attraction_tags ?? []).map((t) => t.title).filter((x): x is string => !!x),
    description: {
      intro: cleanText(d.intro),
      responsibilities: cleanText(d.main_tasks),
      qualifications: cleanText(d.requirements),
      preferred: cleanText(d.preferred_points),
      benefits: cleanText(d.benefits),
      process: cleanText(d.hire_rounds),
    },
  };
}

const HEADERS = { Referer: `${BASE}/wdlist/518`, "wanted-user-country": "KR", "wanted-user-language": "ko" };

export const wanted: SourceAdapter = {
  id: "wanted",
  enabled: (env) => envFlag(env.SOURCE_WANTED, true),
  detailLimit: 60,
  async list(ctx) {
    const out = new Map<string, NormalizedJob>();
    for (const jobId of Object.keys(WANTED_JOB_IDS).map(Number)) {
      for (let page = 0; page < ctx.maxPages; page++) {
        const url =
          `${BASE}/api/chaos/navigation/v1/results?job_group_id=518&job_ids=${jobId}` +
          `&country=kr&job_sort=job.latest_order&locations=all&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
        const res = await fetchJson<WantedListResponse>(url, { headers: HEADERS });
        const items = parseWantedList(res, jobId);
        for (const it of items) {
          const prev = out.get(it.id);
          out.set(it.id, prev ? { ...it, categories: [...new Set([...prev.categories, ...it.categories])] } : it);
        }
        ctx.log(`  wanted ${WANTED_JOB_IDS[jobId]} p${page + 1}: ${items.length}건`);
        if (items.length < PAGE_SIZE || !res.links?.next) break;
        await sleep(ctx.delayMs);
      }
      await sleep(ctx.delayMs);
    }
    return [...out.values()];
  },
  async detail(job, ctx) {
    await sleep(ctx.delayMs);
    const res = await fetchJson<WantedDetailResponse>(`${BASE}/api/chaos/jobs/v4/${job.externalId}/details`, { headers: HEADERS });
    return parseWantedDetail(job, res);
  },
};
