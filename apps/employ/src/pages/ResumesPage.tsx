import { Link } from "react-router";
import { formatDateTime, RESUME_STATUS_LABELS, useApi } from "../lib";
import type { ResumeListItem, StatusResponse } from "../types";

export function WorkerNotice({ status }: { status: StatusResponse | null }) {
  if (!status || status.worker.online) return null;
  return (
    <p className="notice" role="status">
      Mac 워커가 꺼져 있어 요청이 대기열에 쌓입니다. 터미널에서 <code>pnpm worker</code>를 실행하면 순서대로 처리됩니다.
    </p>
  );
}

export function ResumesPage() {
  const { data, error } = useApi<ResumeListItem[]>("/employ/resumes", 8000);
  const status = useApi<StatusResponse>("/employ/status", 15000);
  return (
    <main className="page wide">
      <div className="page-head"><h1>이력서</h1></div>
      <WorkerNotice status={status.data} />
      {error && <p className="error" role="alert">{error.message}</p>}
      {data?.length === 0 && <p className="empty">아직 만든 이력서가 없습니다. 추천 공고에서 “이력서 만들기”를 눌러 주세요.</p>}
      <ul className="rows">
        {data?.map((r) => (
          <li key={r.id}>
            <Link to={`/resumes/${r.id}`} className="row-link">
              <span><b>{r.company}</b> {r.title}</span>
              <span className="muted nowrap">{RESUME_STATUS_LABELS[r.status]} · {formatDateTime(r.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
