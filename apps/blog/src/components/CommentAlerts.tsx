"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client";

/** 새 댓글을 보낼 Discord 또는 Slack 웹훅을 정합니다 */
export function CommentAlerts() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ configured: boolean }>("/admin/notify").then((r) => setConfigured(r.configured)).catch((e: Error) => setError(e.message));
  }, []);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await action());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("/admin/notify", { method: "PUT", json: { url } });
      await api("/admin/notify/test", { method: "POST" }).finally(() => setConfigured(true));
      setUrl("");
      return "저장하고 시험 메시지를 보냈습니다.";
    });
  };

  const remove = () =>
    void run(async () => {
      await api("/admin/notify", { method: "PUT", json: { url: null } });
      setConfigured(false);
      return "알림을 껐습니다.";
    });

  return (
    <section className="alerts" aria-labelledby="alerts-title">
      <h2 id="alerts-title">댓글 알림</h2>
      <p className="alerts-status">
        {configured === null ? "확인하는 중입니다." : configured ? "켜져 있습니다. 주소를 다시 넣으면 바뀝니다." : "꺼져 있습니다. Discord 또는 Slack 웹훅 주소를 넣으면 켜집니다."}
      </p>
      <form className="alerts-form" onSubmit={save}>
        <input
          className="field"
          type="url"
          required
          autoComplete="off"
          aria-label="웹훅 주소"
          placeholder="https://discord.com/api/webhooks/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>저장</button>
        {configured && <button type="button" className="btn" disabled={busy} onClick={remove}>끄기</button>}
      </form>
      {message && <p className="alerts-status" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
