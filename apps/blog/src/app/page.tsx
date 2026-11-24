import { connection } from "next/server";
import { JsonLd } from "@/components/JsonLd";
import { PostList, TagRow } from "@/components/PostList";
import { fetchPosts, fetchTags } from "@/lib/api";
import { formatDate } from "@/lib/client";
import { siteGraph } from "@/lib/jsonld";
import { AUTHOR, CV_URL, SITE_HEADLINE, SITE_NAME } from "@/lib/site";

export default async function HomePage() {
  await connection();
  const [{ items, total }, tags] = await Promise.all([fetchPosts(), fetchTags()]);
  const latest = items[0]?.publishedAt ?? null;
  return (
    <main className="home">
      <JsonLd data={siteGraph()} />
      {/* 누가 무엇을 쓰는 곳인지 먼저 보여 주는 첫 화면 */}
      <section className="intro" aria-labelledby="intro-title">
        <div className="intro-main">
          <div className="intro-who">
            <span className="intro-face" aria-hidden="true">ml</span>
            <span>{AUTHOR.name} · 프론트엔드 개발자</span>
          </div>
          <h1 id="intro-title">
            <span className="sr-only">{SITE_NAME}: </span>
            {SITE_HEADLINE}
          </h1>
          <div className="intro-links">
            <a className="pill is-dark" href={CV_URL}>소개 보기</a>
            <a className="pill" href="https://github.com/mlnls">GitHub</a>
            <a className="pill" href="/feed.xml">RSS</a>
          </div>
        </div>
        <div className="intro-stat">
          {total > 0 ? (
            <>
              <p className="intro-num">{total}<span>편</span></p>
              <p className="intro-sub">지금까지 쓴 글</p>
              <dl className="intro-facts">
                <div><dt>주제</dt><dd>{tags.length}개</dd></div>
                <div><dt>최근 글</dt><dd>{formatDate(latest)}</dd></div>
              </dl>
            </>
          ) : (
            <>
              <p className="intro-num is-soon">곧</p>
              <p className="intro-sub">첫 글이 올라와요</p>
            </>
          )}
        </div>
      </section>
      <div className="list-head">
        <h2>최근 글</h2>
        <TagRow tags={tags} />
      </div>
      <PostList posts={items} />
    </main>
  );
}
