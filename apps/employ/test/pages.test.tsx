import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { JobDetailPage } from "../src/pages/JobDetailPage";
import { JobRow } from "../src/pages/JobsPage";
import { ResumeDetailPage, ResumeDocument } from "../src/pages/ResumeDetailPage";
import { WorkerNotice } from "../src/pages/ResumesPage";
import type { JobListItem, ResumeContent, StatusResponse } from "../src/types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const job: JobListItem["job"] = {
  id: "wanted:1",
  source: "wanted",
  url: "https://example.com/job",
  title: "프론트엔드 개발자",
  company: "가나소프트",
  location: "서울",
  categories: [],
  techStacks: [],
  minCareer: 1,
  maxCareer: 3,
  newcomer: false,
  employmentType: "정규직",
  deadline: null,
  alwaysOpen: true,
  salaryText: null,
  educationText: null,
  description: { qualifications: "React 2년 이상" },
};

const match: NonNullable<JobListItem["match"]> = {
  score: 82,
  track: "frontend",
  matchedSkills: ["React", "Next.js"],
  missingSkills: ["GraphQL"],
  missingPreferred: [],
  reasons: ["핵심 스택이 맞습니다"],
  warnings: ["요구 연차가 조금 높습니다"],
};

const content: ResumeContent = {
  title: "오승민",
  headline: "프론트엔드 개발자",
  summary: "요약 문장",
  skills: [{ label: "주력", items: ["React", "Next.js"] }],
  experience: [{ company: "벽촌", role: "개발자", period: "2025.06 - 현재", projects: [{ name: "법조인대관", bullets: ["Lighthouse 80 → 99"] }] }],
  activities: [],
  education: ["숭실대학교"],
  certifications: ["정보처리기사"],
  tailoringNotes: ["성능 경험을 앞에 뒀습니다"],
  gaps: ["GraphQL 실무 경험 없음"],
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("shows only the login form without a session and logs in", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/me") return json({ admin: false });
      return json({ ok: true });
    });
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(await screen.findByLabelText("비밀번호")).toBeTruthy();
    expect(screen.queryByText("추천 공고")).toBeNull();
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes("/employ/"))).toBe(true);
  });
});

describe("JobRow", () => {
  it("shows score, company, and matched skills", () => {
    render(<MemoryRouter><ul><JobRow item={{ job, match, firstSeenAt: "", status: null }} /></ul></MemoryRouter>);
    expect(screen.getByLabelText("매칭 82점").dataset.tier).toBe("high");
    expect(screen.getByText("가나소프트")).toBeTruthy();
    expect(screen.getByText("React, Next.js")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/jobs/wanted%3A1");
  });
});

describe("JobDetailPage", () => {
  const renderDetail = () =>
    render(
      <MemoryRouter initialEntries={["/jobs/wanted%3A1"]}>
        <Routes>
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/resumes/:id" element={<p>이력서 화면</p>} />
        </Routes>
      </MemoryRouter>,
    );

  it("queues a resume with the button and moves to its page", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return json({ id: 9, status: "queued" }, 202);
      return json({ job, match, status: null, resumes: [] });
    });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "이 공고에 맞춰 이력서 만들기" }));
    await screen.findByText("이력서 화면");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toBe("/api/employ/jobs/wanted%3A1/resume");
  });

  it("explains when a source has no description", async () => {
    fetchMock.mockResolvedValue(json({ job: { ...job, description: null }, match: null, status: null, resumes: [] }));
    renderDetail();
    expect(await screen.findByText(/본문을 제공하지 않아/)).toBeTruthy();
  });
});

describe("ResumeDetailPage", () => {
  const renderResume = (resume: Record<string, unknown>, online = true) => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/status")) return json({ worker: { online, lastSeen: null }, batchRunning: false, runs: [], counts: { active: 0, newSince: 0, closingSoon: 0 } });
      return json({ company: "가나소프트", title: "프론트", url: "https://example.com", resume: { id: 1, jobId: "wanted:1", content: null, figmaUrl: null, figmaError: null, error: null, createdAt: "", finishedAt: null, ...resume } });
    });
    render(
      <MemoryRouter initialEntries={["/resumes/1"]}>
        <Routes><Route path="/resumes/:id" element={<ResumeDetailPage />} /></Routes>
      </MemoryRouter>,
    );
  };

  it("warns that the request waits when the worker is off", async () => {
    renderResume({ status: "queued" }, false);
    expect(await screen.findByText(/Mac 워커가 꺼져/)).toBeTruthy();
  });

  it("links to Figma when finished", async () => {
    renderResume({ status: "done", content, figmaUrl: "https://www.figma.com/design/abc" });
    const link = await screen.findByRole("link", { name: "피그마에서 열기" });
    expect(link.getAttribute("href")).toContain("figma.com");
  });

  it("keeps the resume when only Figma failed", async () => {
    renderResume({ status: "done", content, figmaError: "연결 안 됨" });
    expect(await screen.findByText(/피그마 작성은 실패/)).toBeTruthy();
    expect(screen.getByText("요약 문장")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "피그마에서 열기" })).toBeNull();
  });

  it("shows the failure reason", async () => {
    renderResume({ status: "failed", error: "claude 실행 실패" });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("claude 실행 실패"));
  });
});

describe("ResumeDocument", () => {
  it("renders every section", () => {
    render(<ResumeDocument content={content} />);
    for (const text of ["법조인대관", "Lighthouse 80 → 99", "React, Next.js", "숭실대학교", "정보처리기사"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });
});

describe("WorkerNotice", () => {
  it("stays quiet while the worker is online", () => {
    const { container } = render(<WorkerNotice status={{ worker: { online: true, lastSeen: null } } as StatusResponse} />);
    expect(container.textContent).toBe("");
  });
});
