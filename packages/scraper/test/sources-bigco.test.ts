import { normalizeProfile, scoreJob, type Profile } from "@archiev/core";
import profileJson from "../../../data/profile.example.json";
import { describe, expect, it } from "vitest";
import { parseBoards, parseGreenhouse, type GreenhouseJob } from "../src/sources/greenhouse";
import { itDutyNames, parseJasoseol, type JasoseolDutyGroup, type JasoseolEmployment } from "../src/sources/jasoseol";
import { parseKt, type KtNotice } from "../src/sources/kt";
import { parseLine } from "../src/sources/line";
import { parseNaver } from "../src/sources/naver";
import { parseToss } from "../src/sources/toss";
import { htmlToText, isKoreaLocation, isTechRole, splitSections } from "../src/sources/types";
import greenhouseFx from "./fixtures/greenhouse.json";
import jasoseolFx from "./fixtures/jasoseol.json";
import ktFx from "./fixtures/kt.json";
import lineFx from "./fixtures/line.json";
import naverFx from "./fixtures/naver.json";
import tossFx from "./fixtures/toss.json";

const NOW = new Date("2026-10-26T12:00:00+09:00");

describe("helpers", () => {
  it("detects tech roles and Korean locations", () => {
    expect(isTechRole("Frontend Developer")).toBe(true);
    expect(isTechRole("임원 비서", "Coupang Play")).toBe(false);
    expect(isTechRole("Account Manager (Credit)", "Sales")).toBe(false);
    expect(isKoreaLocation("Seoul, South Korea")).toBe(true);
    expect(isKoreaLocation("Taoyuan, Taiwan")).toBe(false);
    expect(isKoreaLocation(null)).toBe(true);
  });

  it("decodes double-escaped Greenhouse HTML and splits sections", () => {
    const text = htmlToText("&lt;p&gt;&lt;strong&gt;자격 요건&lt;/strong&gt;&lt;/p&gt;&lt;ul&gt;&lt;li&gt;React&amp;nbsp;3년&lt;/li&gt;&lt;/ul&gt;");
    expect(text).toBe("자격 요건\n- React 3년");
    const d = splitSections("소개 문단\n담당 업무\n- API 개발\n자격 요건\n- Go 3년\n우대 사항\n- Kubernetes");
    expect(d?.intro).toBe("소개 문단");
    expect(d?.responsibilities).toBe("- API 개발");
    expect(d?.qualifications).toBe("- Go 3년");
    expect(d?.preferred).toBe("- Kubernetes");
    // 제목을 못 찾으면 본문 전체를 qualifications로
    expect(splitSections("React와 TypeScript를 씁니다")?.qualifications).toBe("React와 TypeScript를 씁니다");
  });
});

describe("jasoseol", () => {
  const duties = itDutyNames(jasoseolFx.dutyGroups as JasoseolDutyGroup[]);

  it("collects IT duty codes under IT·인터넷", () => {
    expect(duties.get(175)).toBe("프론트엔드개발");
    expect(duties.get(166)).toBe("네트워크·보안·운영");
    expect(duties.get(178)).toBe("웹개발 기타");
    expect(duties.has(103)).toBe(false);
    expect(duties.has(194)).toBe(false);
  });

  it("keeps open postings with IT duties only", () => {
    const jobs = parseJasoseol(jasoseolFx.employment as JasoseolEmployment[], duties, NOW);
    expect(jobs.map((j) => j.id)).toEqual(["jasoseol:105357", "jasoseol:105500"]);
    const samsung = jobs[1]!;
    expect(samsung.company).toBe("삼성전자");
    expect(samsung.url).toBe("https://jasoseol.com/recruit/105500");
    expect(samsung.categories).toEqual(["프론트엔드개발", "서버·백엔드개발"]);
    expect(samsung.newcomer).toBe(true);
    expect(samsung.minCareer).toBe(0);
    expect(samsung.deadline).toBe("2026-11-05T08:00:00.000Z");
    expect(samsung.tags).toEqual(["대기업", "공채", "신입"]);
    expect(jobs[0]!.companyLogo).toMatch(/^https:/);
    expect(jobs[0]!.newcomer).toBe(false);
  });
});

describe("toss", () => {
  const jobs = parseToss(tossFx as never);

  it("keeps visible engineering postings and drops sales/hidden ones", () => {
    expect(jobs.map((j) => j.id)).toEqual(["toss:5311744003", "toss:4071172003"]);
  });

  it("maps subsidiary, keywords and JD sections", () => {
    const fe = jobs[0]!;
    expect(fe.company).toBe("토스플레이스");
    expect(fe.techStacks).toEqual(["Typescript", "Next.js"]);
    expect(fe.alwaysOpen).toBe(true);
    expect(fe.description?.intro).toContain("오프라인 결제");
    expect(fe.description?.responsibilities).toContain("React와 TypeScript");
    expect(fe.description?.qualifications).toContain("3년 이상");
    expect(fe.description?.preferred).toContain("Electron");
    expect(fe.description?.process).toContain("서류 접수");
    const infra = jobs[1]!;
    expect(infra.deadline).toBe("2026-11-01T14:59:59.000Z");
    expect(infra.alwaysOpen).toBe(false);
  });
});

describe("naver", () => {
  const jobs = parseNaver(naverFx.list);
  it("keeps Tech postings and handles 상시 deadlines", () => {
    expect(jobs.map((j) => j.id)).toEqual(["naver:30005601", "naver:30005610"]);
    expect(jobs[0]!.categories).toEqual(["Tech", "Frontend"]);
    expect(jobs[0]!.deadline).toBe("2026-11-07T09:00:00.000Z");
    expect(jobs[0]!.employmentType).toBe("정규직");
    expect(jobs[1]!.alwaysOpen).toBe(true);
    expect(jobs[1]!.deadline).toBeNull();
    expect(jobs[1]!.company).toBe("NAVER Cloud");
    expect(jobs[1]!.url).toBe("https://recruit.navercorp.com/rcrt/view.do?annoId=30005610");
  });
});

describe("kt", () => {
  const jobs = parseKt(ktFx.data as KtNotice[]);
  it("keeps notices with tech sectors, parses stringified sector lists", () => {
    expect(jobs.map((j) => j.id)).toEqual(["kt:269556"]);
    expect(jobs[0]!.categories).toEqual(["AX개발", "NW설계/구축"]);
    expect(jobs[0]!.company).toBe("kt sat");
    expect(jobs[0]!.deadline).toBe("2026-10-28T14:59:59.000Z");
    expect(jobs[0]!.tags).toContain("해양서비스영업");
  });
});

describe("line", () => {
  const jobs = parseLine(lineFx as never, NOW);
  it("keeps open Korean engineering postings", () => {
    expect(jobs.map((j) => j.id)).toEqual(["line:3125"]);
    expect(jobs[0]!.company).toBe("LINE Plus");
    expect(jobs[0]!.url).toBe("https://careers.linecorp.com/ko/jobs/3125");
    expect(jobs[0]!.alwaysOpen).toBe(true);
    expect(jobs[0]!.categories).toEqual(["Engineering", "System Engineering"]);
  });
});

describe("greenhouse", () => {
  it("parses board spec", () => {
    expect(parseBoards("coupang:쿠팡, daangn")).toEqual([
      { board: "coupang", company: "쿠팡" },
      { board: "daangn", company: "daangn" },
    ]);
    expect(parseBoards(undefined).length).toBeGreaterThan(3);
  });

  it("keeps Korean tech postings with sectioned descriptions", () => {
    const jobs = parseGreenhouse("coupang", "쿠팡", greenhouseFx.jobs as GreenhouseJob[]);
    expect(jobs.map((j) => j.id)).toEqual(["greenhouse:coupang-8102540"]);
    const j = jobs[0]!;
    expect(j.company).toBe("쿠팡");
    expect(j.description?.intro).toContain("쿠팡파이낸셜");
    expect(j.description?.responsibilities).toContain("Spring Boot");
    expect(j.description?.qualifications).toContain("10년 이상");
    expect(j.description?.preferred).toContain("Kubernetes");
  });

  it("feeds JD skills to the matcher", () => {
    const profile = normalizeProfile(profileJson as Profile);
    const [backend] = parseGreenhouse("coupang", "쿠팡", greenhouseFx.jobs as GreenhouseJob[]);
    const [frontend] = parseToss(tossFx as never);
    const mb = scoreJob(profile, backend!, { now: NOW });
    const mf = scoreJob(profile, frontend!, { now: NOW });
    expect([...mb.matchedSkills, ...mb.missingSkills, ...mb.missingPreferred].join(" ")).toMatch(/kafka|메시지 큐/i);
    expect(mb.missingPreferred.join(" ")).toMatch(/kubernetes/i);
    // 예시 프로필은 프론트엔드 지향이라 토스 FE 공고가 더 높아야 함
    expect(mf.score).toBeGreaterThan(mb.score);
  });
});
