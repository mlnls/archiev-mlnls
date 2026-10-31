import { describe, expect, it } from "vitest";
import { findSalary, parseJumpitDetail, parseJumpitList } from "../src/sources/jumpit";
import { parseSaramin } from "../src/sources/saramin";
import { kstToIso } from "../src/sources/types";
import { parseWantedDetail, parseWantedList } from "../src/sources/wanted";
import jumpitDetail from "./fixtures/jumpit-detail.json";
import jumpitList from "./fixtures/jumpit-list.json";
import saramin from "./fixtures/saramin.json";
import wantedDetail from "./fixtures/wanted-detail.json";
import wantedList from "./fixtures/wanted-list.json";

describe("kstToIso", () => {
  it("treats timezone-less timestamps as KST", () => {
    expect(kstToIso("2026-11-23T23:59:59")).toBe("2026-11-23T14:59:59.000Z");
    expect(kstToIso("2026-11-23 23:59:59")).toBe("2026-11-23T14:59:59.000Z");
    expect(kstToIso("2026-11-30")).toBe("2026-11-30T14:59:59.000Z");
    expect(kstToIso(null)).toBeNull();
  });
});

describe("jumpit", () => {
  const list = parseJumpitList(jumpitList as never);

  it("parses list items", () => {
    expect(list).toHaveLength(3);
    const fe = list[0]!;
    expect(fe.id).toBe("jumpit:55376222");
    expect(fe.url).toBe("https://jumpit.saramin.co.kr/position/55376222");
    expect(fe.techStacks).toContain("Next.js");
    expect(fe.minCareer).toBe(3);
    expect(fe.deadline).toBe("2026-11-23T14:59:59.000Z");
    expect(list[1]!.categories).toContain("devops/시스템 엔지니어");
    expect(list[2]!.alwaysOpen).toBe(true);
    expect(list[2]!.deadline).toBeNull();
  });

  it("enriches with detail fields", () => {
    const d = parseJumpitDetail(list[0]!, jumpitDetail as never);
    expect(d.description?.qualifications).toContain("React 기반 개발 경험");
    expect(d.description?.preferred).toContain("Storybook");
    expect(d.description?.responsibilities).not.toContain("\r");
    expect(d.educationText).toBe("대학교졸업(4년) 이상");
    expect(d.salaryText).toBe("5,000 ~ 6,500만원");
    expect(d.employmentType).toBe("정규직");
    expect(d.postedAt).toBe("2026-10-24T15:00:00.000Z");
    expect(d.tags).toEqual(["급성장중"]);
  });

  it("finds salary ranges in free text", () => {
    expect(findSalary("• 연봉 4,000~5,500만원 (협의)")).toBe("4,000~5,500만원");
    expect(findSalary("연봉: 회사 내규에 따름")).toBeNull();
  });
});

describe("wanted", () => {
  const list = parseWantedList(wantedList as never, 669);

  it("parses list items", () => {
    expect(list).toHaveLength(2);
    const a = list[0]!;
    expect(a.id).toBe("wanted:335808");
    expect(a.url).toBe("https://www.wanted.co.kr/wd/335808");
    expect(a.location).toBe("인천 연수구");
    expect(a.minCareer).toBe(2);
    expect(a.maxCareer).toBeNull(); // annual_to=100 → 제한 없음
    expect(a.employmentType).toBe("정규직");
    expect(a.categories).toEqual(["서버 개발자", "프론트엔드 개발자"]);
    // 실제 목록 응답의 skill_tags는 숫자 id라 이름을 얻을 수 없음 → 상세에서 채움
    expect(list[1]!.techStacks).toEqual([]);
    expect(list[1]!.alwaysOpen).toBe(true);
  });

  it("enriches with detail fields", () => {
    const d = parseWantedDetail(list[0]!, wantedDetail as never);
    expect(d.description?.responsibilities).toContain("Core Stack");
    expect(d.description?.process).toContain("폰 스크리닝");
    expect(d.companyLogo).toContain("logo_thumb");
    expect(d.tags).toEqual(["장비지원", "유연근무"]);
    expect(d.alwaysOpen).toBe(true);
    expect(d.techStacks).toEqual(["React", "TypeScript", "REST"]);
    expect(d.categories).toEqual(expect.arrayContaining(["자바 개발자", "프론트엔드 개발자"]));
  });
});

describe("saramin", () => {
  it("parses the official API JSON shape", () => {
    const [j] = parseSaramin(saramin as never);
    expect(j!.id).toBe("saramin:50000001");
    expect(j!.company).toBe("(주)테스트소프트");
    expect(j!.location).toBe("서울 > 강남구");
    expect(j!.minCareer).toBe(2);
    expect(j!.maxCareer).toBe(5);
    expect(j!.techStacks).toContain("Next.js");
    expect(j!.categories).toEqual(["프론트엔드", "웹개발"]);
    expect(j!.alwaysOpen).toBe(false);
    expect(j!.deadline).toBe(new Date(1795391999 * 1000).toISOString());
  });

  it("throws on API errors", () => {
    expect(() => parseSaramin({ code: 2, message: "사용 불가능한 access-key 입니다." } as never)).toThrow(/access-key/);
  });
});
