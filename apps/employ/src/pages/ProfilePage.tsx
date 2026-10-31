import { useEffect, useState } from "react";
import { api, useApi } from "../lib";

/** 이력서 작성과 매칭의 기준 데이터. 저장하면 전체 공고를 다시 채점합니다 */
export function ProfilePage() {
  const { data, error } = useApi<unknown>("/employ/profile");
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setText(JSON.stringify(data, null, 2));
  }, [data]);

  async function save() {
    setBusy(true);
    setMessage(null);
    setSaveError(null);
    try {
      const saved = await api<unknown>("/employ/profile", { method: "PUT", json: JSON.parse(text) });
      setText(JSON.stringify(saved, null, 2));
      setMessage("저장하고 공고를 다시 채점했습니다");
    } catch (e) {
      setSaveError(e instanceof SyntaxError ? "JSON 형식이 맞지 않습니다" : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page wide">
      <div className="page-head">
        <h1>프로필</h1>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? "저장 중" : "저장"}</button>
      </div>
      <p className="muted">추천 점수와 이력서는 이 데이터만 근거로 만듭니다.</p>
      {error && <p className="error" role="alert">{error.message}</p>}
      {saveError && <p className="error" role="alert">{saveError}</p>}
      {message && <p className="progress" role="status">{message}</p>}
      <textarea className="field profile-editor" aria-label="프로필 JSON" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
    </main>
  );
}
