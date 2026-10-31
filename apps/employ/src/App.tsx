import { NavLink, Route, Routes } from "react-router";
import { useApi } from "./lib";
import { JobDetailPage } from "./pages/JobDetailPage";
import { JobsPage } from "./pages/JobsPage";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ResumeDetailPage } from "./pages/ResumeDetailPage";
import { ResumesPage } from "./pages/ResumesPage";
import { RunsPage } from "./pages/RunsPage";

export function App() {
  const { data, loading, reload } = useApi<{ admin: boolean }>("/auth/me");
  if (loading) return null;
  if (!data?.admin) return <LoginPage onLogin={reload} />;
  return (
    <>
      <header className="top">
        <span className="brand">채용 레이더</span>
        <nav aria-label="주요 메뉴">
          <NavLink to="/" end>추천 공고</NavLink>
          <NavLink to="/resumes">이력서</NavLink>
          <NavLink to="/runs">수집 현황</NavLink>
          <NavLink to="/profile">프로필</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="/resumes" element={<ResumesPage />} />
        <Route path="/resumes/:id" element={<ResumeDetailPage />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<main className="page"><h1>페이지를 찾을 수 없습니다</h1></main>} />
      </Routes>
    </>
  );
}
