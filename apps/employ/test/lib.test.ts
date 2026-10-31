import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, careerLabel, deadlineLabel, scoreTier, sourceLabel } from "../src/lib";

afterEach(() => vi.unstubAllGlobals());

describe("deadlineLabel", () => {
  const now = new Date("2026-10-31T00:00:00+09:00");
  it.each([
    ["2026-11-03T23:59:59+09:00", false, "D-4"],
    ["2026-10-31T00:00:00+09:00", false, "오늘 마감"],
    ["2026-10-30T23:59:59+09:00", false, "마감"],
    [null, true, "상시"],
    [null, false, ""],
  ])("%s", (deadline, open, label) => expect(deadlineLabel(deadline, open, now)).toBe(label));
});

describe("careerLabel", () => {
  it.each([
    [0, 0, true, "신입"],
    [2, 5, false, "2~5년"],
    [3, null, false, "3년 이상"],
    [null, null, true, "경력 무관"],
    [null, null, false, ""],
  ])("%s~%s", (min, max, nc, label) => expect(careerLabel(min, max, nc)).toBe(label));
});

describe("scoreTier", () => {
  it.each([[70, "high"], [69, "mid"], [50, "mid"], [49, "low"]])("%i", (s, t) => expect(scoreTier(s as number)).toBe(t));
});

describe("sourceLabel", () => {
  it("falls back to the id", () => {
    expect(sourceLabel("jobkorea")).toBe("잡코리아");
    expect(sourceLabel("unknown")).toBe("unknown");
  });
});

describe("api", () => {
  it("sends cookies and json to the same origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api("/x", { method: "POST", json: { a: 1 } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/x");
    expect(init.credentials).toBe("include");
    expect(init.body).toBe('{"a":1}');
  });

  it("raises the server message with its status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"로그인이 필요합니다"}', { status: 401 })));
    const err = (await api("/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("로그인이 필요합니다");
  });
});
