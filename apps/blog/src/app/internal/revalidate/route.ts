import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";

/** API가 글을 저장한 뒤 호출합니다. 공개 라우트지만 비밀값 없이는 동작하지 않습니다 */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  revalidateTag("posts", { expire: 0 });
  revalidatePath("/", "layout");
  return Response.json({ ok: true });
}
