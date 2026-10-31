import { scoreJob, type MatchResult, type Profile } from "@archiev/core";
import { listActiveJobs, saveMatches, type Db } from "@archiev/db";

/** 활성 공고 전체를 현재 프로필로 다시 채점합니다 (프로필 수정 후 호출) */
export async function rescoreAll(db: Db, profile: Profile, now = new Date()): Promise<MatchResult[]> {
  const active = await listActiveJobs(db);
  const results = active.map((j) => scoreJob(profile, j, { now, firstSeenAt: j.firstSeenAt }));
  await saveMatches(db, results, now);
  return results;
}
