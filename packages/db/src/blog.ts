import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { comments, commentUsers, posts, type PostRow } from "./schema";

export interface PostInput {
  slug: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  coverImage?: string | null;
  published: boolean;
}

export type PostListItem = Omit<PostRow, "body"> & { readingMinutes: number };

/** 한국어 기준 분당 약 500자 */
const readingMinutesSql = sql<number>`max(1, round(length(${posts.body}) / 500.0))`.mapWith(Number);

const listColumns = {
  id: posts.id,
  slug: posts.slug,
  title: posts.title,
  summary: posts.summary,
  tags: posts.tags,
  coverImage: posts.coverImage,
  published: posts.published,
  publishedAt: posts.publishedAt,
  createdAt: posts.createdAt,
  updatedAt: posts.updatedAt,
  readingMinutes: readingMinutesSql,
};

/** 대표 이미지가 없는 글은 본문의 첫 이미지를 씁니다. 코드 블록 안의 예시는 이미지가 아닙니다 */
function firstBodyImage(body: string) {
  return /!\[[^\]]*\]\(([^)\s]+)/.exec(body.replace(/```[\s\S]*?```/g, ""))?.[1] ?? null;
}

export async function listPublishedPosts(db: Db, opts: { tag?: string; limit?: number; offset?: number } = {}) {
  const tagCond = opts.tag ? sql`exists (select 1 from json_each(${posts.tags}) where value = ${opts.tag})` : undefined;
  const where = and(eq(posts.published, true), tagCond);
  const rows = await db
    .select({ ...listColumns, body: posts.body })
    .from(posts)
    .where(where)
    .orderBy(desc(posts.publishedAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
  const items = rows.map(({ body, ...row }) => ({ ...row, coverImage: row.coverImage ?? firstBodyImage(body) }));
  const [count] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(posts).where(where);
  return { items: items as PostListItem[], total: count?.n ?? 0 };
}

export async function listAllPosts(db: Db) {
  return (await db.select(listColumns).from(posts).orderBy(desc(posts.updatedAt))) as PostListItem[];
}

export async function listTags(db: Db) {
  const rows = await db.all<{ tag: string; n: number }>(
    sql`select value as tag, count(*) as n from posts, json_each(posts.tags) where posts.published = 1 group by value order by n desc, value`,
  );
  return rows;
}

export async function getPostBySlug(db: Db, slug: string, opts: { includeDraft?: boolean } = {}) {
  const [row] = await db.select().from(posts).where(eq(posts.slug, slug));
  if (!row || (!row.published && !opts.includeDraft)) return null;
  return row;
}

export async function getPostById(db: Db, id: number) {
  const [row] = await db.select().from(posts).where(eq(posts.id, id));
  return row ?? null;
}

export async function createPost(db: Db, input: PostInput, now = new Date()) {
  const [row] = await db
    .insert(posts)
    .values({ ...input, publishedAt: input.published ? now : null, createdAt: now, updatedAt: now })
    .returning();
  return row!;
}

export async function updatePost(db: Db, id: number, input: PostInput, now = new Date()) {
  const existing = await getPostById(db, id);
  if (!existing) return null;
  // 처음 공개한 날짜는 유지합니다. 수정일은 updatedAt으로 따로 남습니다.
  const publishedAt = input.published ? (existing.publishedAt ?? now) : existing.publishedAt;
  const [row] = await db.update(posts).set({ ...input, publishedAt, updatedAt: now }).where(eq(posts.id, id)).returning();
  return row ?? null;
}

export async function deletePost(db: Db, id: number) {
  await db.delete(posts).where(eq(posts.id, id));
}

// ─────────────── 댓글 ───────────────

export async function listComments(db: Db, postId: number) {
  return db
    .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, username: commentUsers.username })
    .from(comments)
    .innerJoin(commentUsers, eq(commentUsers.id, comments.userId))
    .where(eq(comments.postId, postId))
    .orderBy(asc(comments.createdAt));
}

export async function findCommentUser(db: Db, username: string) {
  const [row] = await db.select().from(commentUsers).where(eq(commentUsers.username, username));
  return row ?? null;
}

export async function createCommentUser(db: Db, username: string, passwordHash: string) {
  const [row] = await db.insert(commentUsers).values({ username, passwordHash }).returning();
  return row!;
}

export async function addComment(db: Db, postId: number, userId: number, body: string) {
  const [row] = await db.insert(comments).values({ postId, userId, body }).returning();
  return row!;
}

export async function getComment(db: Db, id: number) {
  const [row] = await db
    .select({ id: comments.id, postId: comments.postId, userId: comments.userId, username: commentUsers.username, passwordHash: commentUsers.passwordHash })
    .from(comments)
    .innerJoin(commentUsers, eq(commentUsers.id, comments.userId))
    .where(eq(comments.id, id));
  return row ?? null;
}

export async function deleteComment(db: Db, id: number) {
  await db.delete(comments).where(eq(comments.id, id));
}
