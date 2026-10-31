import { useState, type FormEvent } from "react";
import { api } from "../lib";

export function LoginPage({ onLogin }: { onLogin: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", json: { password } });
      await onLogin();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <h1>채용 레이더</h1>
      <form onSubmit={submit}>
        <input className="field" type="password" aria-label="비밀번호" placeholder="비밀번호" autoComplete="current-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "확인 중" : "로그인"}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </main>
  );
}
