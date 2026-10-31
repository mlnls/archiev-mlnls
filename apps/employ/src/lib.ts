import { useCallback, useEffect, useState } from "react";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...rest,
    headers: json === undefined ? rest.headers : { "content-type": "application/json" },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "요청을 처리하지 못했습니다");
  return data as T;
}

/** 조회 훅. pollMs를 주면 그 간격으로 다시 불러옵니다 */
export function useApi<T>(path: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(!!path);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(!!path);
    void reload();
    if (!pollMs) return;
    const timer = setInterval(() => void reload(), pollMs);
    return () => clearInterval(timer);
  }, [reload, pollMs, path]);

  return { data, error, loading, reload };
}

const dayMs = 86_400_000;

/** 마감까지 남은 날을 사람이 읽는 말로 */
export function deadlineLabel(deadline: string | null, alwaysOpen: boolean, now = new Date()): string {
  if (!deadline) return alwaysOpen ? "상시" : "";
  const left = new Date(deadline).getTime() - now.getTime();
  if (left < 0) return "마감";
  const days = Math.ceil(left / dayMs);
  if (days === 0) return "오늘 마감";
  return `D-${days}`;
}

export function careerLabel(min: number | null, max: number | null, newcomer: boolean): string {
  if (min == null && max == null) return newcomer ? "경력 무관" : "";
  if (min === 0 && max === 0) return "신입";
  if (min != null && max != null) return `${min}~${max}년`;
  return `${min ?? 0}년 이상`;
}

export const formatDateTime = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso))
    : "";

/** 점수에 따른 표시 단계 */
export const scoreTier = (score: number) => (score >= 70 ? "high" : score >= 50 ? "mid" : "low");

export const SOURCES: [string, string][] = [
  ["wanted", "원티드"],
  ["jumpit", "점핏"],
  ["saramin", "사람인"],
  ["jobkorea", "잡코리아"],
  ["jasoseol", "자소설닷컴"],
  ["toss", "토스"],
  ["naver", "네이버"],
  ["line", "라인"],
  ["kt", "KT"],
  ["greenhouse", "기업 채용페이지"],
];
export const sourceLabel = (id: string) => SOURCES.find(([k]) => k === id)?.[1] ?? id;

export const STATUS_LABELS: Record<string, string> = {
  interested: "관심",
  applied: "지원 완료",
  document_passed: "서류 합격",
  interview: "면접",
  offer: "최종 합격",
  rejected: "불합격",
  hidden: "숨김",
};

export const RESUME_STATUS_LABELS: Record<string, string> = {
  queued: "대기 중",
  running: "작성 중",
  done: "완료",
  failed: "실패",
};
