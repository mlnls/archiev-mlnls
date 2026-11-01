import { z } from "zod";
import { getKv, type Db } from "@archiev/db";

export const WEBHOOK_KEY = "comment_webhook_url";

/** 관리자가 넣는 값이지만 서버가 대신 요청을 보내므로 알림 서비스 주소만 받습니다 */
export const WebhookUrl = z
  .string()
  .trim()
  .max(500)
  .regex(/^https:\/\/(?:(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/|hooks\.slack\.com\/services\/)\S+$/, "Discord 또는 Slack 웹훅 주소를 넣어 주세요");

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** 댓글은 누구나 쓸 수 있으므로 @everyone 같은 전체 호출이 울리지 않게 막습니다 */
export function webhookPayload(url: string, message: string) {
  if (url.startsWith("https://hooks.slack.com/")) {
    return { text: message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") };
  }
  return { content: clip(message, 1900), allowed_mentions: { parse: [] } };
}

/** 웹훅 주소는 비밀값이므로 로그에 남기지 않습니다 */
export async function sendWebhook(url: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(webhookPayload(url, message)),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn(`comment webhook failed: ${res.status}`);
    return res.ok;
  } catch (e) {
    console.warn("comment webhook failed:", (e as Error).name);
    return false;
  }
}

export async function notifyComment(db: Db, c: { title: string; slug: string; username: string; body: string; siteUrl: string }) {
  try {
    const url = await getKv(db, WEBHOOK_KEY);
    if (!url) return;
    const link = `${c.siteUrl}/posts/${encodeURIComponent(c.slug)}#comments`;
    await sendWebhook(url, `새 댓글: ${c.title}\n${c.username}: ${clip(c.body, 500)}\n${link}`);
  } catch (e) {
    console.warn("comment notify failed:", (e as Error).name);
  }
}
