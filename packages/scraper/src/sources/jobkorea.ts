import * as cheerio from "cheerio";
import { makeJobId, type NormalizedJob } from "@archiev/core";
import { fetchHtml, sleep } from "../http";
import { parseCareerText } from "./saramin";
import { envFlag, isTechRole, type SourceAdapter } from "./types";

/**
 * 잡코리아 공개 검색 페이지 (robots.txt의 User-agent: * 에서 허용된 경로).
 * 개인 용도로 하루 한 번, 키워드별 최대 2페이지만 조회합니다.
 * 카드에 본문이 없어 제목·직무 분류로만 채점합니다.
 */
const KEYWORDS = ["프론트엔드", "React", "Next.js", "DevOps", "클라우드 엔지니어"];

export function parseJobKoreaSearch(html: string): NormalizedJob[] {
  const $ = cheerio.load(html);
  const out: NormalizedJob[] = [];
  $('[data-sentry-component="CardJob"]').each((_, el) => {
    const card = $(el);
    const links = card.find('a[href*="/Recruit/GI_Read/"]').toArray();
    const href = links[0] ? $(links[0]).attr("href") : undefined;
    const id = href && /GI_Read\/(\d+)/.exec(href)?.[1];
    if (!id) return;
    // 첫 링크는 로고입니다. 글자가 있는 링크가 순서대로 제목, 회사입니다.
    const texts = links.map((a) => $(a).text().trim()).filter(Boolean);
    const [title, company] = texts;
    if (!title || !company) return;
    const chips = card.find('[data-sentry-component="GrayChip"]').toArray().map((c) => $(c).text().trim());
    const location = chips.find((c) => /[시군구도]( 외 \d+)?$/.test(c) || /^(서울|경기|인천|부산|대구|대전|광주|울산|세종|강원|충[남북]|전[남북]|경[남북]|제주)/.test(c)) ?? null;
    const salary = chips.find((c) => /[월연]봉|월급|시급|만원|회사\s?내규/.test(c)) ?? null;
    const categories = chips.filter((c) => c !== location && c !== salary).flatMap((c) => c.split(",").map((s) => s.trim()));
    const all = card.text();
    const career = /(신입·경력|경력무관|신입|경력\s?\d+(?:~\d+)?년[↑이상]*|경력)/.exec(all.replace(/신입 지원 가능/g, ""))?.[1] ?? "";
    out.push({
      id: makeJobId("jobkorea", id),
      source: "jobkorea",
      externalId: id,
      url: `https://www.jobkorea.co.kr/Recruit/GI_Read/${id}`,
      title,
      company,
      companyLogo: null,
      location,
      categories: categories.filter(Boolean),
      techStacks: [],
      ...parseCareerText(career),
      employmentType: null,
      deadline: null,
      alwaysOpen: true,
      postedAt: null,
      salaryText: salary,
      educationText: null,
      tags: [],
      description: null,
    });
  });
  return out;
}

export const jobkorea: SourceAdapter = {
  id: "jobkorea",
  enabled: (env) => envFlag(env.SOURCE_JOBKOREA),
  unseenGraceDays: 14,
  async list(ctx) {
    const out = new Map<string, NormalizedJob>();
    for (const kw of KEYWORDS) {
      for (let page = 1; page <= Math.min(ctx.maxPages, 2); page++) {
        const qs = new URLSearchParams({ stext: kw, tabType: "recruit", Page_No: String(page) });
        const items = parseJobKoreaSearch(await fetchHtml(`https://www.jobkorea.co.kr/Search/?${qs}`));
        const tech = items.filter((j) => isTechRole(j.title, ...j.categories));
        for (const it of tech) out.set(it.id, it);
        ctx.log(`  jobkorea "${kw}" p${page}: ${tech.length}/${items.length}건`);
        await sleep(ctx.delayMs);
        if (!items.length) break;
      }
    }
    return [...out.values()];
  },
};
