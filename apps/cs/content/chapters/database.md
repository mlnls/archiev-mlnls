---
title: 데이터베이스와 SQL, 인덱스
summary: 파일 대신 데이터베이스를 쓰는 이유에서 시작해 관계형 모델(테이블, 키, 관계), SQL의 기본(조회, 조인, 집계), 정규화와 이상 현상을 봅니다. 그리고 데이터베이스가 디스크에 데이터를 어떻게 두고, B+트리 인덱스로 어떻게 빨리 찾는지, 실행 계획 읽는 법, 복합 인덱스의 규칙, ORM의 N+1 문제까지 이어집니다.
---

서버가 다루는 데이터의 대부분은 결국 데이터베이스에 있습니다. 회원, 글, 주문, 댓글. 이 장과 다음 장은 데이터베이스를 두 방향에서 봅니다. 이 장은 "데이터를 어떤 모양으로 담고 어떻게 빨리 찾는가", 다음 장은 "여럿이 동시에 쓰고 서버가 죽어도 데이터가 망가지지 않으려면"입니다. 8장의 파일 시스템, 19장의 B-트리, 6장의 동시성이 여기서 만납니다.

## 왜 파일이 아니라 데이터베이스인가

데이터를 JSON 파일에 저장해도 처음에는 잘 돕니다. 하지만 곧 문제가 생깁니다.

- **찾기**: "가입한 지 30일 넘은 서울 사용자"를 찾으려면 파일 전체를 읽어 훑어야 합니다. 데이터가 커지면 느립니다.
- **동시에 쓰기**: 요청 두 개가 동시에 파일을 읽고 고쳐 쓰면 한쪽 변경이 사라집니다(6장의 경쟁 조건).
- **망가짐**: 쓰는 도중 서버가 죽으면 반쯤 쓴 파일이 남습니다(8장의 fsync).
- **규칙**: 이메일이 비어 있거나 없는 사용자의 주문이 생기는 걸 막을 장치가 없습니다.

[[데이터베이스]]는 데이터를 구조화해서 저장하고, 이 문제들을 대신 풀어 주는 소프트웨어입니다. 정확히는 데이터 자체를 데이터베이스, 그걸 관리하는 프로그램을 [[DBMS]](데이터베이스 관리 시스템)라고 부릅니다. PostgreSQL, MySQL, SQLite, Oracle, SQL Server가 DBMS입니다.

## 관계형 모델: 표로 생각하기

가장 널리 쓰이는 데이터베이스는 [[관계형 데이터베이스]]입니다. 데이터를 [[테이블]](표)에 담습니다. 테이블은 정해진 [[열]](컬럼)과, 그 열의 값을 채운 여러 [[행]](로우)으로 됩니다. 테이블이 어떤 열을 어떤 타입으로 가지는지 정한 설계도를 [[스키마]]라고 합니다.

```text users                                  posts
┌────┬──────────┬──────────────┐       ┌────┬─────────┬───────────┬────────────┐
│ id │ name     │ email        │       │ id │ user_id │ title     │ created_at │
├────┼──────────┼──────────────┤       ├────┼─────────┼───────────┼────────────┤
│ 1  │ 민수      │ a@ex.com     │◀──┐   │ 10 │ 1       │ 첫 글      │ 2026-11-01 │
│ 2  │ 지은      │ b@ex.com     │   └───│ 11 │ 1       │ 둘째 글    │ 2026-11-03 │
└────┴──────────┴──────────────┘       │ 12 │ 2       │ 안녕       │ 2026-11-05 │
                                       └────┴─────────┴───────────┴────────────┘
```

- **[[기본 키]]**(primary key): 행 하나를 유일하게 가리키는 열. `users.id`, `posts.id`. 비어 있을 수 없고 겹칠 수 없습니다.
- **[[외래 키]]**(foreign key): 다른 테이블의 기본 키를 가리키는 열. `posts.user_id`는 `users.id`를 가리킵니다. 데이터베이스가 "없는 사용자의 글"이 생기지 않게 막아 줍니다.

테이블 사이의 관계는 세 가지 모양입니다.

| 관계 | 예 | 만드는 법 |
| --- | --- | --- |
| 일대일 | 사용자 ↔ 프로필 | 한쪽에 외래 키 + 유일 제약 |
| 일대다 | 사용자 → 글 여러 개 | "다" 쪽(`posts`)에 외래 키 |
| 다대다 | 글 ↔ 태그 | 가운데 연결 테이블 `post_tags(post_id, tag_id)` |

## SQL: 데이터에 묻는 언어

관계형 데이터베이스에는 [[SQL]]로 말을 겁니다. SQL은 "어떻게 찾아라"가 아니라 "무엇을 원한다"를 적는 언어입니다. 어떻게 찾을지는 데이터베이스가 정합니다(아래의 실행 계획).

```sql
-- 만들기
CREATE TABLE posts (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 넣기, 고치기, 지우기
INSERT INTO posts (user_id, title, created_at) VALUES (1, '셋째 글', '2026-11-24');
UPDATE posts SET title = '고친 제목' WHERE id = 10;
DELETE FROM posts WHERE id = 12;

-- 조회: 민수가 11월에 쓴 글을 최신순으로 5개
SELECT id, title FROM posts
WHERE user_id = 1 AND created_at >= '2026-11-01'
ORDER BY created_at DESC
LIMIT 5;
```

### 조인

여러 테이블을 이어서 보는 것이 [[조인]]입니다.

```sql
-- 글과 작성자 이름을 함께
SELECT p.title, u.name
FROM posts p
JOIN users u ON u.id = p.user_id;

-- 글이 하나도 없는 사용자도 포함해서 사용자별 글 수
SELECT u.name, COUNT(p.id) AS post_count
FROM users u
LEFT JOIN posts p ON p.user_id = u.id
GROUP BY u.id
ORDER BY post_count DESC;
```

| 조인 | 결과 |
| --- | --- |
| `INNER JOIN` (`JOIN`) | 양쪽에 짝이 있는 행만 |
| `LEFT JOIN` | 왼쪽 테이블의 모든 행 + 짝이 있으면 오른쪽 값, 없으면 NULL |
| `RIGHT JOIN` | 반대 |
| `FULL OUTER JOIN` | 양쪽 모두, 짝 없는 쪽은 NULL |

`GROUP BY`는 행들을 묶어 묶음마다 `COUNT`, `SUM`, `AVG`, `MAX` 같은 [[집계]]를 계산합니다. 묶은 뒤의 조건은 `WHERE`가 아니라 `HAVING`에 씁니다.

## 정규화: 같은 사실은 한 곳에만

글 테이블에 작성자 이름과 이메일까지 함께 넣으면 조인 없이 한 번에 읽을 수 있어 편해 보입니다.

```text posts (정규화하지 않은 모양)
│ id │ title  │ author_name │ author_email │
│ 10 │ 첫 글   │ 민수         │ a@ex.com     │
│ 11 │ 둘째 글 │ 민수         │ a@ex.com     │  ← 같은 사실이 여러 줄에
```

그런데 같은 사실이 여러 곳에 있으면 문제가 생깁니다. 이걸 [[이상 현상]]이라고 합니다.

- **수정 이상**: 민수가 이메일을 바꾸면 민수의 모든 글 행을 고쳐야 하고, 하나라도 빠뜨리면 데이터가 서로 어긋납니다.
- **삽입 이상**: 글을 쓰기 전에는 사용자를 저장할 곳이 없습니다.
- **삭제 이상**: 민수의 마지막 글을 지우면 민수라는 사용자 정보도 사라집니다.

[[정규화]]는 테이블을 나눠 "같은 사실은 한 곳에만" 두는 설계 규칙입니다. 단계마다 이름이 있습니다.

| 단계 | 규칙 | 어기는 예 |
| --- | --- | --- |
| 1정규형 | 칸마다 값이 하나 | `tags` 칸에 `"cs,web,os"` |
| 2정규형 | 기본 키 전체에 의존 (일부에만 의존하는 열이 없음) | `(post_id, tag_id)` 키 테이블에 `post_title`이 있음 |
| 3정규형 | 키가 아닌 열끼리 의존하지 않음 | `posts`에 `user_id`와 그에 딸린 `user_email`이 함께 있음 |

실무에서는 대개 3정규형까지 나누고 시작합니다. 그러다 읽기가 너무 많고 조인이 비싸지면, 일부러 같은 값을 복사해 두는 [[비정규화]]를 합니다. 글 목록에 댓글 수를 매번 세지 않으려고 `posts.comment_count` 열을 두는 식입니다. 대신 댓글을 쓸 때마다 이 값도 함께 고쳐야 하는 책임이 생깁니다. 읽기 속도와 쓰기의 단순함을 맞바꾸는 거래입니다.

## 데이터베이스는 디스크에 어떻게 두나

데이터베이스도 결국 8장의 파일 위에서 돕니다. 데이터 파일을 [[페이지]]와 같은 생각으로 일정 크기의 페이지(PostgreSQL 8KB, MySQL InnoDB 16KB, SQLite 기본 4KB)로 나누고, 한 페이지에 행 여러 개를 담습니다. 디스크와는 페이지 단위로 주고받습니다.

디스크는 느리니(2장), 데이터베이스는 자주 쓰는 페이지를 메모리에 올려 둡니다. 이 캐시를 [[버퍼 풀]]이라고 합니다. 운영체제의 페이지 캐시(8장)와 같은 생각을 데이터베이스가 직접 하는 것입니다. 데이터베이스 서버에 메모리를 넉넉히 주는 이유가 이것입니다. 자주 쓰는 데이터가 버퍼 풀에 다 들어가면 디스크를 거의 읽지 않습니다.

## 인덱스: 빨리 찾는 법

`WHERE email = 'a@ex.com'`으로 찾을 때 아무 준비가 없으면, 데이터베이스는 테이블의 모든 페이지를 처음부터 읽으며 한 행씩 비교합니다. 이걸 [[풀 테이블 스캔]]이라고 하고 O(n)입니다. 행이 1000만 개면 느립니다.

[[인덱스]]는 책 뒤의 찾아보기와 같습니다. 특정 열의 값과 그 행의 위치를 정렬해서 따로 저장해 둔 구조이고, 거의 모든 데이터베이스가 19장의 B+트리로 만듭니다.

```text email 열의 B+트리 인덱스
                 [ m@… ]
               /         \
     [ c@… | g@… ]     [ r@… | w@… ]
     /     |     \       ...
 [a@→행5 b@→행9] [c@→행2 …] …   ← 리프: 정렬된 값과 행 위치. 옆으로 이어져 있음
```

- `WHERE email = 'a@ex.com'`: 루트에서 리프까지 내려가면 끝. 높이가 3~4라서 페이지 몇 개만 읽습니다. O(log n).
- `WHERE created_at BETWEEN '2026-11-01' AND '2026-11-30'`: 시작점까지 내려간 뒤 리프를 옆으로 따라 읽습니다.
- `ORDER BY created_at`: 인덱스가 이미 정렬되어 있으니 따로 정렬하지 않습니다.

인덱스는 공짜가 아닙니다. 디스크를 더 쓰고, 행을 넣고 고치고 지울 때마다 인덱스도 함께 고쳐야 하니 쓰기가 느려집니다. 그래서 "자주 찾는 조건"에만 만듭니다. 기본 키에는 자동으로 인덱스가 생기고, 외래 키 열에는 직접 만들어 주는 게 좋습니다(조인할 때 그 열로 찾으니까요).

```sql
CREATE INDEX idx_posts_user_created ON posts (user_id, created_at);
```

## 복합 인덱스와 인덱스가 안 쓰이는 경우

여러 열을 묶은 [[복합 인덱스]]는 열 순서가 중요합니다. `(user_id, created_at)` 인덱스는 전화번호부가 "성, 그다음 이름" 순으로 정렬된 것과 같습니다. 성으로는 찾을 수 있지만 이름만으로는 찾을 수 없습니다.

| 조건 | `(user_id, created_at)` 인덱스를 쓰나 |
| --- | --- |
| `WHERE user_id = 1` | 예 (앞 열) |
| `WHERE user_id = 1 AND created_at > '2026-11'` | 예 (둘 다) |
| `WHERE user_id = 1 ORDER BY created_at DESC` | 예. 정렬까지 인덱스로 |
| `WHERE created_at > '2026-11'` | 아니요. 앞 열이 없음 |

인덱스가 있어도 안 쓰이는 흔한 경우입니다.

- 열에 함수를 씌움: `WHERE lower(email) = …`, `WHERE date(created_at) = …`. 인덱스는 원래 값으로 정렬되어 있으니까요. 함수 결과로 인덱스(식 인덱스)를 만들거나 조건을 범위로 바꿉니다.
- 앞이 열린 패턴: `WHERE title LIKE '%검색어%'`. 정렬된 순서로는 가운데 글자를 찾을 수 없습니다. 전문 검색 기능을 씁니다.
- 선택도가 낮은 열: `WHERE is_deleted = false`처럼 대부분의 행이 맞는 조건이면, 인덱스를 거쳐 행을 하나씩 찾아가느니 통째로 읽는 편이 빠르다고 데이터베이스가 판단합니다. 값이 얼마나 다양한지를 [[선택도]](또는 카디널리티)라고 합니다.

필요한 열이 모두 인덱스 안에 있으면 테이블 본체를 읽지 않고 인덱스만으로 답합니다. 이런 인덱스를 [[커버링 인덱스]]라고 합니다.

## 실행 계획 읽기

같은 SQL을 어떻게 실행할지(어느 인덱스를 쓸지, 조인 순서는 어떻게 할지)는 데이터베이스의 옵티마이저가 통계를 보고 정합니다. 그 결정을 보여 주는 것이 [[실행 계획]]이고, `EXPLAIN`으로 봅니다. 느린 쿼리를 고치는 첫걸음입니다.

```sql
EXPLAIN QUERY PLAN                          -- SQLite
SELECT id, title FROM posts WHERE user_id = 1 ORDER BY created_at DESC LIMIT 5;
-- 인덱스 없을 때:  SCAN posts / USE TEMP B-TREE FOR ORDER BY   ← 전부 읽고 따로 정렬
-- 인덱스 만든 뒤:  SEARCH posts USING INDEX idx_posts_user_created (user_id=?)
```

PostgreSQL은 `EXPLAIN ANALYZE`로 실제로 실행해 단계별 시간과 행 수까지 보여 줍니다. `Seq Scan`(풀 테이블 스캔)이 큰 테이블에 보이면 인덱스를 의심합니다.

## ORM과 N+1 문제

앱 코드에서는 SQL을 직접 쓰는 대신 [[ORM]](Prisma, Drizzle, TypeORM)이나 쿼리 빌더로 테이블을 객체처럼 다루곤 합니다. 편하지만, 보이지 않는 곳에서 쿼리가 몇 번 나가는지 놓치기 쉽습니다. 가장 유명한 함정이 [[N+1 문제]]입니다.

```js
const posts = await db.post.findMany({ take: 20 });          // 쿼리 1번
for (const p of posts) {
  p.author = await db.user.findUnique({ where: { id: p.userId } }); // 글마다 1번씩, 20번
}
// 총 21번. 글이 100개면 101번. 쿼리마다 DB 왕복이 듭니다 (12장의 RTT)
```

해결은 한 번에 가져오는 것입니다. 조인을 쓰거나(`include: { author: true }`), 필요한 ID를 모아 `WHERE id IN (...)`으로 한 번에 가져와 18장의 `Map`으로 붙입니다. GraphQL 서버의 DataLoader가 이 "모아서 한 번에" 패턴을 자동으로 해 주는 도구입니다.

## 스키마 바꾸기: 마이그레이션

서비스가 커지면 열을 더하고, 이름을 바꾸고, 테이블을 나눠야 합니다. 이미 데이터가 있는 데이터베이스의 스키마를 순서대로 바꾸는 스크립트를 [[마이그레이션]]이라고 하고, 코드와 함께 버전 관리합니다. 운영 중인 큰 테이블을 바꿀 때는 조심해야 합니다. 열 추가는 대개 빠르지만, 큰 테이블에 인덱스를 만들거나 타입을 바꾸면 테이블이 오래 잠길 수 있습니다(22장). 그래서 "새 열 추가 → 코드가 두 열 모두 쓰게 → 데이터 옮기기 → 옛 열 제거"처럼 여러 번의 배포로 나눕니다.

## 어떤 데이터베이스를 쓸까

| | SQLite | PostgreSQL | MySQL |
| --- | --- | --- | --- |
| 형태 | 앱 안의 라이브러리. 파일 하나 | 서버 프로세스 | 서버 프로세스 |
| 잘 맞는 곳 | 휴대폰 앱, 브라우저, 작은 서버, 테스트 | 대부분의 웹 서비스. 기능이 풍부 | 대부분의 웹 서비스. 오래 널리 쓰임 |
| 동시 쓰기 | 한 번에 한 쓰기 | 많음 | 많음 |
| 예 | 모든 iPhone, Chrome의 방문 기록, 이 사이트의 API(libSQL) | Supabase, 많은 스타트업 | 많은 한국 서비스, WordPress |

SQLite는 서버 없이 파일 하나로 도는데도 정확하고 빠르며, 세상에서 가장 많이 설치된 데이터베이스입니다. 작은 서비스는 SQLite로 시작해도 충분한 경우가 많습니다. 관계형이 아닌 데이터베이스(NoSQL)는 22장에서 봅니다.

## 프론트엔드와 이어지는 곳

- 목록 API가 느리면 쿼리에 맞는 인덱스가 있는지, N+1이 아닌지부터 봅니다. 무한 스크롤에 `OFFSET 10000`을 쓰면 앞의 1만 행을 읽고 버리니, 마지막으로 본 값을 기준으로 이어서 가져오는 커서 방식(`WHERE created_at < 마지막값 LIMIT 20`)이 빠릅니다.
- 화면에 보여 줄 형태와 저장할 형태는 다릅니다. 저장은 정규화하고, 화면에 필요한 모양은 API가 조인해서 만들어 줍니다.
- 브라우저 안에도 데이터베이스가 있습니다. IndexedDB는 키-값 저장소에 인덱스가 붙은 것이고, SQLite를 WebAssembly(5장)로 브라우저에서 돌리기도 합니다.

## 용어 정리

:::terms
- 데이터베이스 (database) — 구조화된 데이터를 저장하고, 여럿이 안전하게 찾고 바꿀 수 있게 관리하는 데이터 모음 또는 그 소프트웨어입니다.
- DBMS (Database Management System) — 데이터베이스를 저장하고 질의, 동시성, 복구를 맡는 소프트웨어. PostgreSQL, MySQL, SQLite 등.
- 관계형 데이터베이스 (relational database) — 데이터를 행과 열로 된 테이블에 담고 키로 테이블 사이의 관계를 표현하는 데이터베이스입니다.
- 테이블 (table) — 같은 열 구성을 가진 행들의 모음. 관계형 모델의 기본 단위입니다.
- 행 (row) — 테이블의 한 줄. 레코드 하나입니다.
- 열 (column) — 테이블의 한 칸 이름과 타입. 모든 행이 같은 열을 가집니다.
- 스키마 (schema) — 테이블과 열, 타입, 제약 조건을 정한 데이터베이스의 설계도입니다.
- 기본 키 (primary key) — 테이블의 행 하나를 유일하게 가리키는 열이나 열 묶음입니다.
- 외래 키 (foreign key) — 다른 테이블의 기본 키를 가리키는 열. 데이터베이스가 없는 대상을 가리키지 못하게 막습니다.
- SQL (Structured Query Language) — 관계형 데이터베이스의 데이터를 만들고, 조회하고, 바꾸는 선언형 언어입니다.
- 조인 (join) — 공통된 값을 기준으로 여러 테이블의 행을 이어 하나의 결과로 만드는 것입니다.
- 집계 (aggregation) — `GROUP BY`로 행을 묶어 묶음마다 개수, 합, 평균 같은 값을 계산하는 것입니다.
- 이상 현상 (anomaly) — 같은 사실이 여러 곳에 중복되어 수정, 삽입, 삭제 때 데이터가 어긋나거나 사라지는 문제입니다.
- 정규화 (normalization) — 테이블을 나눠 같은 사실을 한 곳에만 두어 이상 현상을 없애는 설계 과정입니다.
- 비정규화 (denormalization) — 읽기를 빠르게 하려고 일부 데이터를 일부러 중복해 두는 것입니다.
- 버퍼 풀 (buffer pool) — 데이터베이스가 자주 쓰는 디스크 페이지를 메모리에 올려 두는 캐시입니다.
- 풀 테이블 스캔 (full table scan) — 인덱스 없이 테이블의 모든 행을 읽으며 조건을 확인하는 것입니다.
- 인덱스 (index) — 특정 열의 값과 행 위치를 정렬해 따로 저장한 구조. 대개 B+트리이고 찾기를 O(log n)으로 만듭니다.
- 복합 인덱스 (composite index) — 여러 열을 정해진 순서로 묶은 인덱스. 앞쪽 열부터 차례로 쓰일 때만 효과가 있습니다.
- 커버링 인덱스 (covering index) — 쿼리에 필요한 열이 모두 들어 있어 테이블 본체를 읽지 않고 답할 수 있는 인덱스입니다.
- 선택도 (selectivity) — 조건이 전체 행 중 얼마나 적은 행을 골라내는지. 높을수록 인덱스가 효과적입니다.
- 실행 계획 (execution plan) — 데이터베이스가 쿼리를 어떤 인덱스와 순서로 실행할지 정한 계획. `EXPLAIN`으로 봅니다.
- ORM (Object-Relational Mapping) — 테이블의 행을 코드의 객체처럼 다루게 해 주는 라이브러리. Prisma, Drizzle 등.
- N+1 문제 (N+1 query problem) — 목록 1번 조회 뒤 각 항목마다 관련 데이터를 따로 조회해 쿼리가 N+1번 나가는 문제입니다.
- 마이그레이션 (migration) — 데이터가 있는 데이터베이스의 스키마를 순서대로 바꾸는 버전 관리된 스크립트입니다.
:::

## 직접 해보기

:::practice sqlite SQLite로 테이블 만들고 조인하기
SQLite를 설치하고(macOS는 기본 포함, Windows는 `winget install SQLite.SQLite`, Linux는 `apt install sqlite3`) 이 장의 `users`, `posts` 테이블을 만든 뒤, 사용자별 글 수(글이 없는 사용자 포함)를 구하는 쿼리를 써 봅니다. Node 22.13 이상이라면 `node:sqlite` 모듈로도 같은 걸 할 수 있습니다.

```sh 터미널
sqlite3 practice.db
```

```sql
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE);
CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT, created_at TEXT);
INSERT INTO users (name, email) VALUES ('민수', 'a@ex.com'), ('지은', 'b@ex.com'), ('준', 'c@ex.com');
INSERT INTO posts (user_id, title, created_at) VALUES (1, '첫 글', '2026-11-01'), (1, '둘째 글', '2026-11-03'), (2, '안녕', '2026-11-05');
SELECT u.name, COUNT(p.id) FROM users u LEFT JOIN posts p ON p.user_id = u.id GROUP BY u.id;
```
:::

:::practice index 인덱스 전후 속도와 실행 계획 비교하기
글 100만 개를 넣고, 인덱스 없이 한 사용자의 최신 글 5개를 찾는 시간과 실행 계획을 본 뒤, 복합 인덱스를 만들고 다시 봅니다. 이어서 `WHERE created_at > …`만 쓰면 그 인덱스가 쓰이는지도 확인합니다.

```sql
.timer on
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1000000)
INSERT INTO posts (user_id, title, created_at)
SELECT abs(random()) % 1000 + 1, '글 ' || i, date('2020-01-01', '+' || (i % 2000) || ' days') FROM n;

EXPLAIN QUERY PLAN SELECT * FROM posts WHERE user_id = 7 ORDER BY created_at DESC LIMIT 5;
SELECT * FROM posts WHERE user_id = 7 ORDER BY created_at DESC LIMIT 5;

CREATE INDEX idx_posts_user_created ON posts (user_id, created_at);
EXPLAIN QUERY PLAN SELECT * FROM posts WHERE user_id = 7 ORDER BY created_at DESC LIMIT 5;
SELECT * FROM posts WHERE user_id = 7 ORDER BY created_at DESC LIMIT 5;
EXPLAIN QUERY PLAN SELECT * FROM posts WHERE created_at > '2025-01-01';
```
:::

:::practice normalize 정규화해 보기
아래처럼 한 테이블에 모든 걸 넣은 주문 데이터를 보고, 수정·삽입·삭제 이상이 각각 어디서 생기는지 적은 뒤 3정규형으로 나눈 테이블 설계(테이블, 열, 기본 키, 외래 키)를 그립니다.

```text orders
│ order_id │ customer_name │ customer_phone │ product_name │ product_price │ qty │
│ 1        │ 민수           │ 010-1111       │ 키보드        │ 50000         │ 1   │
│ 2        │ 민수           │ 010-1111       │ 마우스        │ 20000         │ 2   │
│ 3        │ 지은           │ 010-2222       │ 키보드        │ 50000         │ 1   │
```
:::

:::practice n-plus-one N+1을 세어 보기
SQLite나 쓰는 ORM의 쿼리 로그를 켜고(Prisma는 `log: ["query"]`), 글 20개와 작성자를 가져오는 코드를 반복문 방식과 조인(include) 방식으로 각각 짜서 실제로 나가는 쿼리 수를 셉니다. DB가 다른 서버에 있어 왕복이 1ms라면 두 방식의 차이가 몇 ms인지 계산해 봅니다.
:::

## 스스로 점검

:::qa 사용자 이름과 이메일을 글 테이블에도 복사해 두면 생기는 문제를 이상 현상으로 설명해 보세요.
이메일이 바뀌면 그 사용자의 모든 글 행을 고쳐야 하고 하나라도 빠지면 값이 어긋납니다(수정 이상). 글이 없는 사용자는 저장할 곳이 없고(삽입 이상), 마지막 글을 지우면 사용자 정보도 사라집니다(삭제 이상).
:::

:::qa 인덱스가 찾기를 빠르게 하는 원리와, 인덱스를 모든 열에 만들지 않는 이유는?
인덱스는 열의 값을 B+트리로 정렬해 두어, 루트에서 리프까지 페이지 몇 개만 읽고 O(log n)에 찾게 합니다. 대신 디스크를 더 쓰고, 행을 넣고 고치고 지울 때마다 모든 인덱스를 함께 고쳐야 해서 쓰기가 느려지니, 자주 쓰는 조건에만 만듭니다.
:::

:::qa `(user_id, created_at)` 복합 인덱스가 있을 때 `WHERE created_at > '2026-11-01'`만 쓰면 왜 인덱스를 못 쓰나요?
복합 인덱스는 먼저 `user_id`로, 같은 `user_id` 안에서 `created_at`으로 정렬되어 있어서, `created_at`만으로는 정렬된 범위를 바로 찾을 수 없습니다. 전화번호부에서 이름만으로 사람을 찾을 수 없는 것과 같습니다.
:::

:::qa `WHERE date(created_at) = '2026-11-24'`가 느리다면 어떻게 고치나요?
열에 함수를 씌우면 인덱스의 정렬 순서를 쓸 수 없습니다. `WHERE created_at >= '2026-11-24' AND created_at < '2026-11-25'`처럼 원래 열의 범위 조건으로 바꾸거나, 함수 결과로 식 인덱스를 만듭니다.
:::

:::qa N+1 문제가 무엇이고, 왜 DB가 다른 서버에 있으면 더 심각해지나요?
목록을 한 번 조회한 뒤 각 항목의 관련 데이터를 하나씩 따로 조회해 쿼리가 N+1번 나가는 문제입니다. 쿼리마다 DB까지 네트워크 왕복이 드니, 왕복이 1ms만 돼도 100개면 100ms가 더해집니다. 조인이나 `IN`으로 한 번에 가져옵니다.
:::

## 더 읽을거리

- [Use The Index, Luke](https://use-the-index-luke.com/) — 개발자를 위한 SQL 인덱스 책. 무료이고, 이 장의 인덱스 내용을 데이터베이스별로 깊게 다룹니다.
- [SQLite: Query Planning](https://www.sqlite.org/queryplanner.html) — SQLite가 인덱스로 쿼리를 어떻게 실행하는지 그림과 함께 설명합니다.
- [PostgreSQL 공식 튜토리얼](https://www.postgresql.org/docs/current/tutorial.html) — SQL 기본부터 조인, 집계, 트랜잭션까지.
- [CMU 15-445 Database Systems](https://15445.courses.cs.cmu.edu/) — 데이터베이스를 만드는 사람의 눈으로 보는 무료 강의. 페이지, 버퍼 풀, B+트리, 실행 계획을 직접 구현합니다.
- [SQLBolt](https://sqlbolt.com/) — 브라우저에서 바로 SQL을 쳐 보며 익히는 연습 사이트입니다.
