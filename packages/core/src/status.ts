/** 지원 진행 상태 (클라이언트 컴포넌트에서도 쓰므로 DB 패키지가 아닌 core에 둡니다) */
export const JOB_STATUSES = ["interested", "applied", "document_passed", "interview", "offer", "rejected", "hidden"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  interested: "관심",
  applied: "지원 완료",
  document_passed: "서류 합격",
  interview: "면접",
  offer: "최종 합격",
  rejected: "불합격",
  hidden: "숨김",
};
