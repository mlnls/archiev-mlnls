import { Link, useParams } from "react-router";
import { RESUME_STATUS_LABELS, useApi } from "../lib";
import type { ResumeContent, ResumeJob, StatusResponse } from "../types";
import { WorkerNotice } from "./ResumesPage";

interface Detail {
  resume: ResumeJob;
  company: string;
  title: string;
  url: string;
}

export function ResumeDocument({ content }: { content: ResumeContent }) {
  return (
    <article className="resume">
      <header>
        <h2>{content.title}</h2>
        <p className="resume-headline">{content.headline}</p>
      </header>
      <p>{content.summary}</p>

      <section>
        <h3>기술</h3>
        <dl className="resume-skills">
          {content.skills.map((s) => (
            <div key={s.label}><dt>{s.label}</dt><dd>{s.items.join(", ")}</dd></div>
          ))}
        </dl>
      </section>

      <section>
        <h3>경력</h3>
        {content.experience.map((e) => (
          <div key={e.company} className="resume-block">
            <div className="resume-line"><b>{e.company}</b> <span>{e.role}</span><time>{e.period}</time></div>
            {e.projects.map((p) => (
              <div key={p.name} className="resume-project">
                <h4>{p.name}</h4>
                <ul>{p.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
              </div>
            ))}
          </div>
        ))}
      </section>

      {content.activities.length > 0 && (
        <section>
          <h3>활동</h3>
          {content.activities.map((a) => (
            <div key={a.name} className="resume-block">
              <div className="resume-line"><b>{a.name}</b> <span>{a.role}</span><time>{a.period}</time></div>
              <ul>{a.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>학력·자격</h3>
        <ul>{[...content.education, ...content.certifications].map((t) => <li key={t}>{t}</li>)}</ul>
      </section>
    </article>
  );
}

export function ResumeDetailPage() {
  const id = useParams().id ?? "";
  // 끝나기 전까지만 자주 확인합니다
  const first = useApi<Detail>(`/employ/resumes/${id}`, 4000);
  const status = useApi<StatusResponse>("/employ/status", 15000);
  const { data, error } = first;
  if (error) return <main className="page"><p className="error" role="alert">{error.message}</p></main>;
  if (!data) return null;
  const { resume } = data;
  const inProgress = resume.status === "queued" || resume.status === "running";

  return (
    <main className="page resume-page">
      <div className="no-print">
        <Link className="back" to="/resumes">이력서</Link>
        <h1>{data.company}</h1>
        <p className="muted">{data.title} · <a href={data.url} target="_blank" rel="noreferrer">공고 원문</a></p>
        <p className="progress" role="status">{RESUME_STATUS_LABELS[resume.status]}{inProgress && resume.content ? ", 피그마에 그리는 중" : ""}</p>
        {inProgress && <WorkerNotice status={status.data} />}
        {resume.status === "failed" && <p className="error" role="alert">{resume.error}</p>}
        {resume.content && (
          <div className="actions">
            {resume.figmaUrl && <a className="btn btn-primary" href={resume.figmaUrl} target="_blank" rel="noreferrer">피그마에서 열기</a>}
            <button type="button" className="btn" onClick={() => window.print()}>PDF로 저장</button>
          </div>
        )}
        {resume.figmaError && <p className="notice" role="status">피그마 작성은 실패했습니다. 이력서 내용은 아래에 그대로 있습니다. ({resume.figmaError})</p>}
        {resume.content && (resume.content.tailoringNotes.length > 0 || resume.content.gaps.length > 0) && (
          <details className="notes" open>
            <summary>맞춤 메모</summary>
            {resume.content.tailoringNotes.length > 0 && <><h2>이렇게 맞췄습니다</h2><ul>{resume.content.tailoringNotes.map((t) => <li key={t}>{t}</li>)}</ul></>}
            {resume.content.gaps.length > 0 && <><h2>공고 요건 중 경험이 없는 부분</h2><ul>{resume.content.gaps.map((t) => <li key={t}>{t}</li>)}</ul></>}
          </details>
        )}
      </div>
      {resume.content && <ResumeDocument content={resume.content} />}
    </main>
  );
}
