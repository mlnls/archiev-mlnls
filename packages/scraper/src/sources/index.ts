import { greenhouse } from "./greenhouse";
import { jasoseol } from "./jasoseol";
import { jobkorea } from "./jobkorea";
import { jumpit } from "./jumpit";
import { kt } from "./kt";
import { line } from "./line";
import { naver } from "./naver";
import { rocketpunch } from "./rocketpunch";
import { saramin } from "./saramin";
import { toss } from "./toss";
import type { SourceAdapter } from "./types";
import { wanted } from "./wanted";

/**
 * 새 소스를 추가하려면 SourceAdapter를 구현해서 여기에 넣으면 됩니다.
 * 카카오(이용약관상 수집 금지), 우아한형제들(robots.txt 차단), LG(봇 차단), LinkedIn·Indeed(약관 금지),
 * 잡플래닛(Cloudflare가 서버 요청을 403으로 차단)은 넣지 않았습니다. 차단은 우회하지 않습니다.
 */
export const ALL_SOURCES: SourceAdapter[] = [wanted, jumpit, saramin, jobkorea, rocketpunch, jasoseol, toss, naver, line, kt, greenhouse];

export function enabledSources(env = process.env, only?: string[]): SourceAdapter[] {
  return ALL_SOURCES.filter((s) => (only?.length ? only.includes(s.id) : true) && s.enabled(env));
}

export { greenhouse, jasoseol, jobkorea, jumpit, kt, line, naver, rocketpunch, saramin, toss, wanted };
export type { SourceAdapter, SourceContext } from "./types";
