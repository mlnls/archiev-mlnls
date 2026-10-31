import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <h1 className="page-title">페이지를 찾을 수 없습니다</h1>
      <p className="page-lead">주소가 바뀌었거나 지워진 글입니다. <Link href="/">글 목록</Link>에서 찾아보세요.</p>
    </main>
  );
}
