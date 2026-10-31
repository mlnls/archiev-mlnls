import { useState } from "react";
import { api, formatDateTime, sourceLabel, useApi } from "../lib";
import type { StatusResponse } from "../types";

const RUN_LABELS: Record<string, string> = { running: "수집 중", success: "성공", partial: "일부 실패", failed: "실패" };

export function RunsPage() {
  const { data, error, reload } = useApi<StatusResponse>("/employ/status", 10000);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run() {
    setActionError(null);
    try {
      await api("/employ/batch/run", { method: "POST" });
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  const latest = data?.runs[0];
  return (
    <main className="page wide">
      <div className="page-head">
        <h1>수집 현황</h1>
        <button type="button" className="btn" disabled={data?.batchRunning} onClick={() => void run()}>
          {data?.batchRunning ? "수집 중" : "지금 수집"}
        </button>
      </div>
      {error && <p className="error" role="alert">{error.message}</p>}
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {data && (
        <dl className="stats">
          <div><dt>활성 공고</dt><dd>{data.counts.active.toLocaleString("ko-KR")}</dd></div>
          <div><dt>24시간 신규</dt><dd>{data.counts.newSince.toLocaleString("ko-KR")}</dd></div>
          <div><dt>5일 내 마감</dt><dd>{data.counts.closingSoon.toLocaleString("ko-KR")}</dd></div>
          <div><dt>Mac 워커</dt><dd>{data.worker.online ? "연결됨" : "꺼짐"}</dd></div>
        </dl>
      )}

      {latest?.stats && (
        <section className="block">
          <h2>최근 수집, 출처별</h2>
          <table className="table">
            <thead><tr><th>출처</th><th className="num">수집</th><th className="num">신규</th><th>상태</th></tr></thead>
            <tbody>
              {Object.entries(latest.stats.sources).map(([id, s]) => (
                <tr key={id}>
                  <td>{sourceLabel(id)}</td>
                  <td className="num">{s.fetched}</td>
                  <td className="num">{s.new}</td>
                  <td>{s.error ? <span className="error">{s.error.slice(0, 80)}</span> : "정상"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">잡플래닛은 서버 요청을 차단(Cloudflare 403)해서 수집하지 않습니다.</p>
        </section>
      )}

      <section className="block">
        <h2>수집 기록</h2>
        <ul className="rows">
          {data?.runs.map((r) => (
            <li key={r.id} className="row-static">
              <span>{formatDateTime(r.startedAt as string)} <span className="muted">{r.trigger === "schedule" ? "자동" : "수동"}</span></span>
              <span className="muted nowrap">{RUN_LABELS[r.status]}{r.stats ? ` · 신규 ${r.stats.newJobs}` : ""}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
