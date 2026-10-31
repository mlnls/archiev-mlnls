import type { NormalizedJob } from "@archiev/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDb,
  dashboardCounts,
  deactivateUnseen,
  getDb,
  getJobDetail,
  idsWithoutDetail,
  listJobs,
  listPipeline,
  saveMatches,
  setJobStatus,
  updateJobDetail,
  upsertJobs,
  type Db,
} from "../src";

process.env.DB_FILE = "memory";
delete process.env.DATABASE_URL;

function job(id: string, extra: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    id: `jumpit:${id}`,
    source: "jumpit",
    externalId: id,
    url: `https://jumpit.saramin.co.kr/position/${id}`,
    title: `프론트엔드 개발자 ${id}`,
    company: "테스트컴퍼니",
    companyLogo: null,
    location: "서울 강남구",
    categories: ["프론트엔드 개발자"],
    techStacks: ["React"],
    minCareer: 1,
    maxCareer: 3,
    newcomer: false,
    employmentType: null,
    deadline: "2026-11-30T23:59:59+09:00",
    alwaysOpen: false,
    postedAt: null,
    salaryText: null,
    educationText: null,
    tags: [],
    description: null,
    ...extra,
  };
}

let db: Db;
beforeAll(async () => {
  db = await getDb();
});
afterAll(async () => {
  await closeDb();
});

describe("repo", () => {
  it("upserts jobs and reports which are new", async () => {
    const t0 = new Date("2026-10-24T07:00:00+09:00");
    const r1 = await upsertJobs(db, [job("1"), job("2")], t0);
    expect(r1.newIds.sort()).toEqual(["jumpit:1", "jumpit:2"]);
    const r2 = await upsertJobs(db, [job("2"), job("3")], new Date("2026-10-25T07:00:00+09:00"));
    expect(r2.newIds).toEqual(["jumpit:3"]);
  });

  it("keeps a fetched description when the list API sends none", async () => {
    await updateJobDetail(db, job("2", { description: { qualifications: "React 3년" }, techStacks: ["React", "Next.js"] }));
    expect(await idsWithoutDetail(db, ["jumpit:2", "jumpit:3"])).toEqual(["jumpit:3"]);
    await upsertJobs(db, [job("2")]);
    const d = await getJobDetail(db, "jumpit:2");
    expect(d?.job.description?.qualifications).toBe("React 3년");
  });

  it("deactivates jobs not seen in the latest run", async () => {
    const n = await deactivateUnseen(db, "jumpit", new Date("2026-10-25T06:59:00+09:00"));
    expect(n).toBe(1); // jumpit:1 은 24일에만 보였음
    const { items } = await listJobs(db);
    expect(items.map((i) => i.job.id)).not.toContain("jumpit:1");
  });

  it("lists by score, hides excluded and hidden jobs, tracks pipeline", async () => {
    await saveMatches(db, [
      { jobId: "jumpit:2", score: 88, track: "frontend", excluded: false } as never,
      { jobId: "jumpit:3", score: 40, track: "frontend", excluded: true } as never,
    ]);
    let { items, total } = await listJobs(db);
    expect(total).toBe(1);
    expect(items[0]?.job.id).toBe("jumpit:2");

    await setJobStatus(db, "jumpit:2", "applied", "10/25 지원");
    expect((await listPipeline(db))[0]?.status.note).toBe("10/25 지원");

    await setJobStatus(db, "jumpit:2", "hidden");
    ({ items } = await listJobs(db));
    expect(items).toHaveLength(0);
  });

  it("searches by keyword, keeps tagged stacks, counts for the dashboard (SQLite 전용 SQL)", async () => {
    const now = new Date("2026-10-26T09:00:00+09:00");
    await upsertJobs(
      db,
      [
        job("9", { title: "인프라 엔지니어", techStacks: ["Kubernetes"], deadline: "2026-10-28T23:59:59+09:00" }),
        job("10", { techStacks: ["Vue.js"], deadline: "2026-12-31T23:59:59+09:00" }),
      ],
      now,
    );
    // 목록 API가 스택을 비워 보내면 기존 스택을 유지
    await upsertJobs(db, [job("9", { title: "인프라 엔지니어", techStacks: [], deadline: "2026-10-28T23:59:59+09:00" })], now);
    expect((await getJobDetail(db, "jumpit:9"))?.job.techStacks).toEqual(["Kubernetes"]);

    const { items, total } = await listJobs(db, { q: "kubernetes" });
    expect(total).toBe(1);
    expect(items[0]?.job.id).toBe("jumpit:9");

    const c = await dashboardCounts(db, new Date("2026-10-26T00:00:00+09:00"), now);
    expect(c.newSince).toBe(2);
    expect(c.closingSoon).toBe(1);
    expect(c.active).toBeGreaterThanOrEqual(3);
  });
});
