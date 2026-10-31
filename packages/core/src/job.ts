export const JOB_SOURCES = [
  "wanted",
  "jumpit",
  "saramin",
  "jobkorea",
  "rocketpunch",
  "jasoseol",
  "toss",
  "naver",
  "line",
  "kt",
  "greenhouse",
] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const SOURCE_LABELS: Record<JobSource, string> = {
  wanted: "원티드",
  jumpit: "점핏",
  saramin: "사람인",
  jobkorea: "잡코리아",
  rocketpunch: "로켓펀치",
  jasoseol: "자소설닷컴",
  toss: "토스",
  naver: "네이버",
  line: "라인",
  kt: "KT",
  greenhouse: "기업 채용페이지",
};

/** 공고 본문을 소스와 무관하게 같은 칸으로 나눈 형태 */
export interface JobDescription {
  intro?: string | null;
  responsibilities?: string | null;
  qualifications?: string | null;
  preferred?: string | null;
  benefits?: string | null;
  process?: string | null;
}

/** 모든 수집 소스가 이 형태로 변환되어 DB에 저장됩니다 */
export interface NormalizedJob {
  /** `${source}:${externalId}` */
  id: string;
  source: JobSource;
  externalId: string;
  url: string;
  title: string;
  company: string;
  companyLogo: string | null;
  location: string | null;
  /** 소스가 붙인 직무 분류명 (예: "프론트엔드 개발자", "devops/시스템 엔지니어") */
  categories: string[];
  /** 소스가 태깅한 기술 스택 원문 */
  techStacks: string[];
  minCareer: number | null;
  maxCareer: number | null;
  newcomer: boolean;
  employmentType: string | null;
  /** ISO 문자열, 상시채용이면 null */
  deadline: string | null;
  alwaysOpen: boolean;
  postedAt: string | null;
  salaryText: string | null;
  educationText: string | null;
  tags: string[];
  /** 목록 API만으로는 비어 있을 수 있고, 상세 조회 후 채워집니다 */
  description: JobDescription | null;
}

export function makeJobId(source: JobSource, externalId: string | number): string {
  return `${source}:${externalId}`;
}

/** 본문 칸을 하나의 텍스트로 합칩니다 (스킬 추출, AI 프롬프트용) */
export function descriptionToText(d: JobDescription | null | undefined): string {
  if (!d) return "";
  const parts: [string, string | null | undefined][] = [
    ["회사/포지션 소개", d.intro],
    ["주요 업무", d.responsibilities],
    ["자격 요건", d.qualifications],
    ["우대 사항", d.preferred],
    ["혜택/복지", d.benefits],
    ["채용 절차", d.process],
  ];
  return parts
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `[${k}]\n${v!.trim()}`)
    .join("\n\n");
}
