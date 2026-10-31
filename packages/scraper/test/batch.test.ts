import type { NormalizedJob } from "@archiev/core";
import { closeDb, getDb, latestBatchRuns, listJobs, type Db } from "@archiev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBatch } from "../src/batch";
import { parseJumpitDetail, parseJumpitList } from "../src/sources/jumpit";
import type { SourceAdapter } from "../src/sources/types";
import jumpitDetail from "./fixtures/jumpit-detail.json";
import jumpitList from "./fixtures/jumpit-list.json";

process.env.DB_FILE = "memory";
delete process.env.DATABASE_URL;
delete process.env.NOTIFY_WEBHOOK_URL;

let db: Db;
beforeAll(async () => {
  db = await getDb();
});
afterAll(async () => {
  await closeDb();
});

function fakeJumpit(jobs: NormalizedJob[]): SourceAdapter {
  return {
    id: "jumpit",
    enabled: () => true,
    list: async () => jobs,
    detail: async (job) => (job.externalId === "55376222" ? parseJumpitDetail(job, jumpitDetail as never) : job),
  };
}

const failing: SourceAdapter = {
  id: "wanted",
  enabled: () => true,
  list: async () => {
    throw new Error("HTTP 403");
  },
};

describe("runBatch", () => {
  const all = parseJumpitList(jumpitList as never);
  const silent = () => {};

  it("collects, fetches details, scores, and records the run", async () => {
    const r = await runBatch({ db, sources: [fakeJumpit(all)], log: silent, now: () => new Date("2026-10-25T07:00:00+09:00") });
    expect(r.status).toBe("success");
    expect(r.stats.newJobs).toBe(3);
    expect(r.stats.scored).toBe(3);
    const { items } = await listJobs(db);
    const fe = items.find((i) => i.job.id === "jumpit:55376222");
    expect(fe?.job.description?.qualifications).toContain("React");
    expect(fe?.match?.track).toBe("frontend");
    expect(items[0]!.match!.score).toBeGreaterThanOrEqual(items.at(-1)!.match!.score);
  });

  it("deactivates jobs that disappeared and marks partial failures", async () => {
    const r = await runBatch({
      db,
      sources: [fakeJumpit(all.slice(0, 2)), failing],
      log: silent,
      now: () => new Date("2026-10-26T07:00:00+09:00"),
    });
    expect(r.status).toBe("partial");
    expect(r.stats.newJobs).toBe(0);
    expect(r.stats.deactivated).toBe(1);
    expect(r.stats.sources.wanted?.error).toContain("403");
    const runs = await latestBatchRuns(db, 5);
    expect(runs[0]?.status).toBe("partial");
    expect(runs).toHaveLength(2);
  });

  it("keeps unseen jobs during the grace period of search-based sources", async () => {
    const graced = { ...fakeJumpit(all.slice(0, 1)), unseenGraceDays: 14 };
    const r = await runBatch({ db, sources: [graced], log: silent, now: () => new Date("2026-10-27T07:00:00+09:00") });
    expect(r.stats.deactivated).toBe(0);
  });
});
