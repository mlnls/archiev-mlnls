import { describe, expect, it } from "vitest";
import { parseJobKoreaSearch } from "../src/sources/jobkorea";
import { parseCareerText, parseSaraminSearch } from "../src/sources/saramin";

const SARAMIN = `<div class="item_recruit" value="100">
  <div class="area_job">
    <h2 class="job_tit"><a title="프론트엔드 개발자" href="/x"><span>프론트엔드 개발자</span></a></h2>
    <div class="job_date"><span class="date">~ 11/30(월)</span></div>
    <div class="job_condition"><span><a>서울</a> <a>강남구</a></span><span>경력 2~5년</span><span>대졸↑</span><span>정규직</span></div>
    <div class="job_sector"><b><a>프론트엔드</a></b>, <a>웹개발</a> <span class="job_day">등록일 26/10/31</span></div>
  </div>
  <div class="area_corp"><strong class="corp_name"><a> (주)가나소프트 </a></strong></div>
</div>`;

const JOBKOREA = `<div data-sentry-component="CardJob">
  <a href="https://www.jobkorea.co.kr/Recruit/GI_Read/200?x=1"><img alt="logo"/></a>
  <a href="https://www.jobkorea.co.kr/Recruit/GI_Read/200?x=1">웹 프론트엔드 엔지니어</a>
  <a href="https://www.jobkorea.co.kr/Recruit/GI_Read/200?x=1">㈜다라게임즈</a>
  <div data-sentry-component="GrayChip"><span>경기 성남시</span></div>
  <div data-sentry-component="GrayChip"><span>게임·애니메이션, 프론트엔드개발자</span></div>
  <div data-sentry-component="GrayChip"><span>월급 300만원</span></div>
  <span>신입·경력</span>
</div>`;

describe("parseSaraminSearch", () => {
  it("reads a job card", () => {
    const [job] = parseSaraminSearch(SARAMIN, new Date("2026-10-31T00:00:00+09:00"));
    expect(job).toMatchObject({
      id: "saramin:100",
      title: "프론트엔드 개발자",
      company: "(주)가나소프트",
      location: "서울 강남구",
      minCareer: 2,
      maxCareer: 5,
      employmentType: "정규직",
      categories: ["프론트엔드", "웹개발"],
      alwaysOpen: false,
    });
    expect(job?.deadline).toBe("2026-11-30T14:59:59.000Z");
  });
});

describe("parseJobKoreaSearch", () => {
  it("skips the logo link and separates chips", () => {
    const [job] = parseJobKoreaSearch(JOBKOREA);
    expect(job).toMatchObject({
      id: "jobkorea:200",
      title: "웹 프론트엔드 엔지니어",
      company: "㈜다라게임즈",
      location: "경기 성남시",
      salaryText: "월급 300만원",
      categories: ["게임·애니메이션", "프론트엔드개발자"],
      newcomer: true,
    });
  });
});

describe("parseCareerText", () => {
  it.each([
    ["신입", { minCareer: 0, maxCareer: 0, newcomer: true }],
    ["경력무관", { minCareer: null, maxCareer: null, newcomer: true }],
    ["경력 3년↑", { minCareer: 3, maxCareer: null, newcomer: false }],
  ])("%s", (text, expected) => expect(parseCareerText(text)).toEqual(expected));
});
