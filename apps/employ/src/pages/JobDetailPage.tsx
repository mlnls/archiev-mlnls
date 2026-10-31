import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, careerLabel, deadlineLabel, RESUME_STATUS_LABELS, scoreTier, sourceLabel, STATUS_LABELS, useApi } from "../lib";
import type { Job, Match, ResumeJob } from "../types";

interface Detail {
  job: Job;
  match: Match | null;
  status: string | null;
  resumes: ResumeJob[];
}

const SECTIONS: [keyof NonNullable<Job["description"]>, string][] = [
  ["intro", "소개"],
  ["responsibilities", "주요 업무"],
  ["qualifications", "자격 요건"],
  ["preferred", "우대 사항"],
  ["process", "채용 절차"],
  ["benefits", "복지"],
];

export function JobDetailPage() {
  const id = useParams().id ?? "";
  const navigate = useNavigate();
  const { data, error, reload } = useApi<Detail>(`/employ/jobs/${encodeURIComponent(id)}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <main className="page"><p className="error" role="alert">{error.message}</p></main>;
  if (!data) return null;
  const { job, match, status, resumes } = data;

  async function createResume() {
    setBusy(true);
    setActionError(null);
    try {
      const created = await api<ResumeJob>(`/employ/jobs/${encodeURIComponent(id)}/resume`, { method: "POST" });
      navigate(`/resumes/${created.id}`);
    } catch (e) {
      setActionError((e as Error).message);
      setBusy(false);
    }
  }

  async function changeStatus(value: string) {
    try {
      await api(`/employ/jobs/${encodeURIComponent(id)}/status`, { method: "PUT", json: { status: value || null } });
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  const facts = [job.location, careerLabel(job.minCareer, job.maxCareer, job.newcomer), job.employmentType, job.salaryText, job.educationText, deadlineLabel(job.deadline, job.alwaysOpen), sourceLabel(job.source)].filter(Boolean);
  const sections = SECTIONS.filter(([k]) => job.description?.[k]?.trim());

  return (
    <main className="page detail">
      <div>
        <Link className="back" to="/">추천 공고</Link>
        <p className="job-company big">{job.company}</p>
        <h1>{job.title}</h1>
        <p className="muted">{facts.join(" · ")}</p>
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void createResume()}>
            {busy ? "요청 중" : "이 공고에 맞춰 이력서 만들기"}
          </button>
          <a className="btn" href={job.url} target="_blank" rel="noreferrer">공고 원문</a>
          <select className="field status-select" aria-label="지원 상태" value={status ?? ""} onChange={(e) => void changeStatus(e.target.value)}>
            <option value="">상태 없음</option>
            {Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        {actionError && <p className="error" role="alert">{actionError}</p>}

        {sections.length > 0 ? (
          sections.map(([k, label]) => (
            <section key={k} className="jd">
              <h2>{label}</h2>
              <p>{job.description?.[k]}</p>
            </section>
          ))
        ) : (
          <p className="empty">이 출처는 본문을 제공하지 않아 제목과 직무 분류로만 채점했습니다. 자세한 내용은 공고 원문에서 확인해 주세요.</p>
        )}
      </div>

      <aside className="side">
        {match && (
          <>
            <div className="side-score">
              <span className="score large" data-tier={scoreTier(match.score)}>{match.score}</span>
              <span className="muted">점 / 100</span>
            </div>
            <SideList title="맞는 이유" items={match.reasons} />
            <SideList title="확인할 점" items={match.warnings} tone="warn" />
            <SideList title="부족한 기술" items={match.missingSkills} />
          </>
        )}
        {resumes.length > 0 && (
          <section>
            <h2>이 공고로 만든 이력서</h2>
            <ul>
              {resumes.map((r) => (
                <li key={r.id}><Link to={`/resumes/${r.id}`}>이력서 #{r.id}</Link> <span className="muted">{RESUME_STATUS_LABELS[r.status]}</span></li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </main>
  );
}

function SideList({ title, items, tone }: { title: string; items: string[]; tone?: "warn" }) {
  if (!items.length) return null;
  return (
    <section data-tone={tone}>
      <h2>{title}</h2>
      <ul>{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </section>
  );
}
