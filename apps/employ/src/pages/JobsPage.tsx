import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { careerLabel, deadlineLabel, scoreTier, SOURCES, sourceLabel, useApi } from "../lib";
import type { JobListItem } from "../types";

const PAGE_SIZE = 40;

export function JobRow({ item }: { item: JobListItem }) {
  const { job, match } = item;
  const score = match?.score ?? 0;
  const facts = [job.location, careerLabel(job.minCareer, job.maxCareer, job.newcomer), sourceLabel(job.source), deadlineLabel(job.deadline, job.alwaysOpen)].filter(Boolean);
  return (
    <li>
      <Link to={`/jobs/${encodeURIComponent(job.id)}`} className="job-row">
        <span className="score" data-tier={scoreTier(score)} aria-label={`매칭 ${score}점`}>{score}</span>
        <span className="job-main">
          <span className="job-company">{job.company}</span>
          <span className="job-title">{job.title}</span>
          {match?.matchedSkills.length ? <span className="job-skills">{match.matchedSkills.slice(0, 6).join(", ")}</span> : null}
        </span>
        <span className="job-facts">{facts.join(" · ")}</span>
      </Link>
    </li>
  );
}

export function JobsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(Number(params.get("page") ?? 1) || 1, 1);
  const query = useMemo(() => {
    const q = new URLSearchParams(params);
    q.delete("page");
    q.set("limit", String(PAGE_SIZE));
    q.set("offset", String((page - 1) * PAGE_SIZE));
    return q.toString();
  }, [params, page]);
  const { data, error, loading } = useApi<{ total: number; items: JobListItem[] }>(`/employ/jobs?${query}`);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next, { replace: true });
  };

  const goTo = (n: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(n));
    setParams(next);
    window.scrollTo(0, 0);
  };

  const totalPages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;

  return (
    <main className="page wide">
      <div className="page-head">
        <h1>추천 공고</h1>
        {data && <p className="muted">{data.total.toLocaleString("ko-KR")}건, 매일 오전 8시 갱신</p>}
      </div>
      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <input className="field" type="search" aria-label="검색" placeholder="회사, 공고, 기술 검색" defaultValue={params.get("q") ?? ""} onChange={(e) => setFilter("q", e.target.value)} />
        <select className="field" aria-label="직무" value={params.get("track") ?? ""} onChange={(e) => setFilter("track", e.target.value)}>
          <option value="">전체 직무</option>
          <option value="frontend">프론트엔드</option>
          <option value="infra">인프라</option>
        </select>
        <select className="field" aria-label="출처" value={params.get("source") ?? ""} onChange={(e) => setFilter("source", e.target.value)}>
          <option value="">전체 출처</option>
          {SOURCES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select className="field" aria-label="최소 점수" value={params.get("minScore") ?? ""} onChange={(e) => setFilter("minScore", e.target.value)}>
          <option value="">전체 점수</option>
          <option value="70">70점 이상</option>
          <option value="50">50점 이상</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={params.get("newOnly") === "1"} onChange={(e) => setFilter("newOnly", e.target.checked ? "1" : "")} />
          오늘 새 공고
        </label>
      </form>
      {error && <p className="error" role="alert">{error.message}</p>}
      {!loading && data?.items.length === 0 && <p className="empty">조건에 맞는 공고가 없습니다.</p>}
      <ol className="job-list" aria-busy={loading}>
        {data?.items.map((item) => <JobRow key={item.job.id} item={item} />)}
      </ol>
      {totalPages > 1 && (
        <nav className="pager" aria-label="페이지">
          <button type="button" className="btn" disabled={page <= 1} onClick={() => goTo(page - 1)}>이전</button>
          <span className="muted">{page} / {totalPages}</span>
          <button type="button" className="btn" disabled={page >= totalPages} onClick={() => goTo(page + 1)}>다음</button>
        </nav>
      )}
    </main>
  );
}
