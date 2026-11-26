---
title: DNS: 이름을 주소로 바꾸기
summary: `naver.com` 같은 이름이 IP 주소로 바뀌는 과정을 따라갑니다. 도메인 이름의 구조, 루트·TLD·권한 있는 네임서버와 재귀 리졸버, 레코드 종류(A, AAAA, CNAME, MX, TXT, NS), TTL과 여러 겹의 캐시, hosts 파일과 운영체제별 DNS 설정을 보고, 이 사이트의 주소(`cs.mlnl.cloud`)가 실제로 어떻게 풀리는지까지 확인합니다.
---

12장은 `connect`를 부르기 전에 이름이 언제 숫자가 되었는지 물으며 끝났습니다. 9장 맨 앞 그림의 왕복 1입니다. 주소창에 `cs.mlnl.cloud`를 치고 엔터를 누르면, 이 이름은 이런 길을 거쳐 54.116.117.190이 됩니다.

![이 페이지의 이름을 처음 찾을 때. 가까운 캐시부터 차례로 보고, 아무 데도 없으면 통신사의 리졸버가 루트, `.cloud`, 가비아의 네임서버에 차례로 물어 답을 얻습니다](dns-scene.svg)

우리는 주소창에 `54.116.117.190`이 아니라 이름을 칩니다. 이름을 IP 주소로 바꿔 주는 것이 [[DNS]](Domain Name System)입니다. 웹 요청 대부분이 DNS 조회로 시작하고, DNS가 멈추면 서버가 멀쩡해도 인터넷이 통째로 안 되는 것처럼 보입니다. 11장의 Facebook 사고가 바로 그랬습니다.

## 이름이 필요한 이유

- **사람은 숫자를 못 외웁니다.** 전화번호부가 필요한 것과 같습니다.
- **주소는 바뀝니다.** 서버를 다른 데이터센터로 옮기거나 클라우드 회사를 바꾸면 IP가 바뀝니다. 이름이 그대로면 사용자는 몰라도 됩니다.
- **이름 하나에 서버 여럿, 서버 하나에 이름 여럿.** 큰 서비스는 이름 하나 뒤에 서버 수천 대를 두고, 작은 서버 하나는 이름 수십 개를 받습니다. 이 사이트의 서버도 블로그, 소개, cs 등 여러 이름을 IP 하나로 받습니다.

인터넷 초기에는 모든 컴퓨터의 이름과 주소를 적은 파일(HOSTS.TXT) 하나를 한 기관이 관리하고 다들 내려받아 썼습니다. 컴퓨터가 수천 대를 넘자 감당이 안 되어, 1983년에 이름 관리를 나눠 맡는 지금의 DNS가 나왔습니다.

## 도메인 이름의 구조

[[도메인 이름]]은 점으로 나뉜 이름표를 오른쪽에서 왼쪽으로 읽는 나무 구조입니다.

![`blog.example.co.kr.`을 이름표로 나누면 위와 같고, 같은 이름을 나무로 그리면 아래와 같습니다. 진한 선이 루트에서 `blog`까지 내려가는 길입니다](dns-name-tree.svg)

- **[[TLD]]**(최상위 도메인): `com`, `org`, `io` 같은 일반 TLD와 `kr`, `jp` 같은 국가 TLD가 있습니다. `.com`은 Verisign이, `.kr`은 한국인터넷진흥원(KISA)이 관리합니다.
- **등록한 이름**: 우리가 돈을 내고 빌리는 부분입니다. 가비아, Namecheap, Cloudflare 같은 [[도메인 등록 기관]]에서 1년 단위로 빌립니다.
- **[[서브도메인]]**: 이름을 빌린 사람이 그 아래에 마음대로 만드는 이름입니다. `blog.`, `api.`, `cs.`처럼 돈을 더 내지 않고 얼마든지 만듭니다.

이 나무에서 각 가지를 누가 관리하는지 나눠 맡기는 것을 위임이라고 합니다. 루트는 "`.kr`은 저 서버들에게 물어봐라"라고 위임하고, `.kr`은 "`example.co.kr`은 저 서버들에게"라고 위임합니다. 도메인을 사면 "내 도메인의 정보는 이 [[네임서버]]들에게 물어봐라"라고 위임받는 것입니다.

:::quiz registered `cs.mlnl.cloud`에서 이 사이트의 주인이 도메인 등록 기관에 돈을 내고 빌린 이름은?
- [ ] `cloud`
- [x] `mlnl.cloud`
- [ ] `cs.mlnl.cloud`
- [ ] `cs`

`mlnl.cloud`입니다. `cloud`는 TLD이고, 그 아래 `mlnl`을 가비아에서 빌렸습니다. `cs.`는 빌린 사람이 마음대로 만드는 서브도메인이라 돈을 더 내지 않고 `blog.`, `api.`처럼 얼마든지 만듭니다.
:::

## DNS 서버의 네 역할

이름 하나를 찾는 데 여러 종류의 DNS 서버가 나섭니다.

| 역할 | 하는 일 | 예 |
| --- | --- | --- |
| [[스텁 리졸버]] | 내 컴퓨터 운영체제 안에서 "이 이름 주소가 뭐야?"를 대신 물어 줌 | Windows DNS Client, macOS mDNSResponder, Linux systemd-resolved |
| [[재귀 리졸버]] | 답을 찾을 때까지 다른 서버들에게 차례로 물어 최종 답을 돌려줌. 결과를 캐시 | 통신사 DNS, Google `8.8.8.8`, Cloudflare `1.1.1.1`, 집 공유기(중계) |
| [[루트 네임서버]] | "그 TLD는 저 서버들에게 물어봐라"라고 알려 줌 | `a.root-servers.net`부터 `m`까지 이름 13개. 애니캐스트로 세계 천여 곳 |
| TLD 네임서버 | "그 도메인은 저 서버들에게 물어봐라"라고 알려 줌 | `.com` 서버, `.kr` 서버 |
| [[권한 있는 네임서버]] | 그 도메인의 진짜 답을 가지고 있음 | 도메인 주인이 고른 곳: AWS Route 53, Cloudflare, 가비아 |

## 이름 하나를 찾는 과정

브라우저에 `www.example.com`을 쳤을 때 일어나는 일을 처음부터 따라갑니다. 앞 단계에서 답을 찾으면 뒤는 건너뜁니다.

1. **브라우저 캐시**: 브라우저가 최근에 찾은 적이 있는지 봅니다.
2. **운영체제**: 브라우저가 운영체제의 이름 조회 함수(`getaddrinfo`)를 부르거나 직접 스텁 리졸버에 묻습니다. 운영체제는 자기 캐시와 [[hosts 파일]]을 먼저 봅니다.
3. **재귀 리졸버에게 질문**: 없으면 스텁 리졸버가 DHCP로 받은 DNS 서버(보통 공유기 → 통신사 DNS)에 UDP 53번 포트로 묻습니다. "`www.example.com`의 A 레코드를 알려 줘. 끝까지 찾아서."
4. **리졸버의 캐시**: 리졸버가 최근에 누군가를 위해 찾아 둔 답이 있으면 바로 돌려줍니다. 많은 사람이 같은 리졸버를 쓰니 유명한 이름은 대부분 여기서 끝납니다.
5. **루트에게**: 캐시에 없으면 리졸버는 루트 네임서버에 묻습니다. 루트는 답을 모르지만 "`.com`은 이 서버들에게 물어봐라"라고 알려 줍니다(위임).
6. **TLD에게**: `.com` 서버에 묻습니다. "`example.com`은 이 네임서버들에게 물어봐라."
7. **권한 있는 네임서버에게**: `example.com`의 네임서버에 묻습니다. "`www.example.com`의 A 레코드는 `203.0.113.10`, TTL 3600초." (이 장의 IP는 설명용 예시 주소입니다)
8. **돌아오기**: 리졸버는 이 답을 TTL 동안 캐시하고 내 컴퓨터에 돌려줍니다. 운영체제와 브라우저도 캐시합니다.

![내 컴퓨터는 재귀 리졸버에 한 번 묻고(1), 리졸버가 루트, `.com`, 권한 있는 네임서버에 차례로 물어(2~4) 답을 돌려줍니다(5). 점선이 각 서버의 답입니다](dns-resolution.svg)

내 컴퓨터는 리졸버에게 "끝까지 찾아서 답만 줘"라고 한 번 묻고(재귀 질의), 리졸버는 루트와 TLD에 "아는 만큼만 알려 줘"라고 차례로 묻습니다(반복 질의). 처음부터 끝까지 찾으면 수십~수백 ms가 걸리지만, 캐시 덕분에 대부분의 조회는 몇 ms 안에 끝납니다.

:::quiz stub-asks 노트북의 스텁 리졸버가 이 페이지의 이름을 물을 때, 질문을 직접 보내는 곳은?
- [ ] 루트 네임서버
- [ ] `.io` 네임서버
- [x] DHCP로 받은 DNS 서버 (재귀 리졸버나 그 앞의 공유기)
- [ ] 가비아의 권한 있는 네임서버 (`mlnl.cloud` 담당)

DHCP로 받은 DNS 서버입니다. 스텁 리졸버는 "끝까지 찾아서 답만 줘"라고 한 번 묻고(재귀 질의), 루트와 TLD를 차례로 찾아다니는 건 재귀 리졸버의 일입니다.
:::

## DNS 레코드

권한 있는 네임서버는 도메인마다 [[DNS 레코드]] 목록을 가지고 있습니다. 레코드는 "이름, 종류, TTL, 값"으로 되어 있습니다.

| 종류 | 뜻 | 예 |
| --- | --- | --- |
| [[A 레코드]] | 이름 → IPv4 주소 | `example.com. 3600 A 203.0.113.10` |
| [[AAAA 레코드]] | 이름 → IPv6 주소 | `example.com. 3600 AAAA 2001:db8::10` |
| [[CNAME 레코드]] | 이름 → 다른 이름 (별명) | `www.example.com. CNAME example.com.` |
| [[MX 레코드]] | 이 도메인의 메일을 받는 서버 | `example.com. MX 10 mail.example.com.` |
| [[TXT 레코드]] | 아무 글자. 도메인 소유 확인, 메일 위조 방지(SPF) 등 | `example.com. TXT "v=spf1 include:_spf.google.com ~all"` |
| [[NS 레코드]] | 이 도메인(또는 서브도메인)을 맡은 네임서버 | `example.com. NS ns1.example-dns.net.` |
| SOA | 이 영역의 관리 정보 (담당자, 일련번호, 기본 값) | |
| CAA | 이 도메인의 인증서를 발급할 수 있는 인증 기관 | `example.com. CAA 0 issue "letsencrypt.org"` |
| PTR | IP 주소 → 이름 (역방향 조회) | 메일 서버 확인, traceroute의 이름 표시 |

CNAME은 "그 이름의 답은 저 이름의 답과 같다"는 뜻이라, CNAME을 만나면 리졸버는 저 이름을 다시 찾습니다. Vercel이나 Netlify에 내 도메인을 붙일 때 "`www`에 CNAME으로 `cname.vercel-dns.com`을 넣으세요"라고 하는 게 이것입니다. 그러면 Vercel이 서버 IP를 바꿔도 내 설정은 그대로입니다.

![CNAME을 받은 리졸버는 그 이름을 처음부터 다시 찾습니다. 질문이 두 번 오가는 대신 IP를 Vercel 쪽에서 관리합니다](dns-cname.svg)

 다만 도메인의 맨 위 이름(`example.com` 자체)에는 규칙상 CNAME을 둘 수 없어서, DNS 회사들이 ALIAS나 CNAME 평탄화라는 자체 기능으로 이를 흉내 냅니다.

:::quiz which-record Vercel에 `www.example.com`을 붙이면서, Vercel이 서버 IP를 바꿔도 내 DNS 설정은 그대로 두고 싶습니다. 어떤 레코드를 넣을까요?
- [x] CNAME
- [ ] A
- [ ] NS
- [ ] TXT

CNAME입니다. "이 이름의 답은 저 이름의 답과 같다"고 적어 두면 리졸버가 Vercel의 이름을 다시 찾으니, IP는 Vercel이 관리합니다. A 레코드에 IP를 직접 넣으면 IP가 바뀔 때마다 내가 고쳐야 합니다.
:::

## TTL과 여러 겹의 캐시

레코드마다 붙은 [[DNS TTL]]은 "이 답을 몇 초 동안 캐시해도 된다"는 뜻입니다. DNS 캐시는 여러 겹입니다.

1. 브라우저 (Chrome은 `chrome://net-internals/#dns`에서 비울 수 있음)
2. 운영체제의 스텁 리졸버
3. 공유기
4. 통신사나 공용 DNS의 재귀 리졸버

![질문은 가까운 캐시부터 차례로 거치고, 답은 돌아오면서 각 캐시에 TTL 동안 남습니다](dns-cache-layers.svg)

"DNS 변경이 전파되는 데 최대 48시간 걸립니다"라는 안내가 있는데, 사실 DNS에 전파라는 과정은 없습니다. 권한 있는 네임서버의 값은 즉시 바뀝니다. 다만 세계 곳곳의 리졸버들이 옛 답을 TTL이 끝날 때까지 캐시하고 있을 뿐입니다. 그래서 서버를 옮길 계획이 있으면, 며칠 전에 TTL을 60초 정도로 줄여 두고, 옮긴 뒤 다시 늘리는 것이 요령입니다.

![레코드를 바꾼 순간(진한 세로선) 권한 있는 네임서버는 바로 새 IP를 답하지만, 리졸버마다 옛 답을 받은 시각이 달라 TTL이 끝나는 시각도 제각각입니다](dns-ttl.svg)

없는 이름이라는 답(`NXDOMAIN`)도 캐시됩니다. 새 서브도메인을 만들기 전에 한 번 조회해 봤다면, 레코드를 추가한 뒤에도 한동안 "없음"이 돌아올 수 있습니다.

:::quiz ttl-wait A 레코드의 TTL이 3600초입니다. 레코드를 바꾸기 직전에 어떤 리졸버가 옛 답을 받아 캐시했다면, 그 리졸버를 쓰는 사람은 최대 몇 분 동안 옛 IP로 갈까요?
= 60 | 60분 | 1시간

**60분**입니다. 리졸버는 받은 답을 TTL인 3600초 동안 다시 묻지 않고 씁니다. 그래서 서버를 옮기기 며칠 전에 TTL을 60초쯤으로 줄여 둡니다. 운영체제와 브라우저 캐시가 조금 더 붙들 수도 있습니다.
:::

## hosts 파일

운영체제는 DNS에 묻기 전에 [[hosts 파일]]을 봅니다. "이 이름은 이 IP"라고 손으로 적어 두는 파일이고, DNS보다 먼저 이깁니다. 1983년 이전의 HOSTS.TXT가 여기 남아 있는 것입니다.

| | 위치 |
| --- | --- |
| Windows | `C:\Windows\System32\drivers\etc\hosts` |
| macOS, Linux | `/etc/hosts` |

```text /etc/hosts
127.0.0.1   localhost
::1         localhost
127.0.0.1   myapp.test     # 로컬 개발용 이름
0.0.0.0     ads.example    # 광고 서버 차단
```

로컬 개발에서 `myapp.test` 같은 이름으로 접속하거나, 서버를 옮기기 전에 내 컴퓨터에서만 새 서버로 미리 접속해 볼 때 씁니다. 수정하려면 관리자 권한이 필요하고, 고친 뒤에는 DNS 캐시를 비워야 바로 반영됩니다. 참고로 요즘 브라우저와 운영체제는 `*.localhost`를 hosts 파일 없이도 자동으로 루프백으로 풀어 줍니다. `app.localhost:3000`이 바로 열리는 이유입니다.

:::quiz hosts-wins `/etc/hosts`에 `127.0.0.1 naver.com`을 적고 캐시를 비운 뒤 브라우저로 `naver.com`을 열면?
- [ ] DNS가 hosts 파일보다 먼저라 네이버가 그대로 열린다
- [ ] `dig naver.com`도 127.0.0.1을 돌려준다
- [ ] 공유기가 잘못된 주소라며 막는다
- [x] 내 컴퓨터(127.0.0.1)에 접속을 시도한다

hosts 파일이 DNS보다 먼저 이깁니다. 브라우저는 운영체제를 거쳐 127.0.0.1을 받고 내 컴퓨터에 연결합니다. 반면 `dig`은 hosts 파일을 보지 않고 DNS 서버에 바로 물어 네이버의 진짜 IP를 받습니다.
:::

## 운영체제마다 다른 DNS 설정

| | Windows | macOS | Linux |
| --- | --- | --- | --- |
| 스텁 리졸버 | DNS Client 서비스 | mDNSResponder | systemd-resolved (`127.0.0.53`에서 대기), 배포판에 따라 다름 |
| DNS 서버 보기 | `ipconfig /all`, `Get-DnsClientServerAddress` | `scutil --dns` | `resolvectl status`, `/etc/resolv.conf` |
| 캐시 보기 | `ipconfig /displaydns` | (직접 보기 어려움) | `resolvectl statistics` |
| 캐시 비우기 | `ipconfig /flushdns` | `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder` | `resolvectl flush-caches` |
| 조회 도구 | `Resolve-DnsName`, `nslookup` | `dig`, `nslookup`, `dscacheutil -q host -a name 이름` | `dig`, `nslookup`, `resolvectl query` |
| 같은 네트워크의 `.local` 이름 | 지원 | 기본 지원 (Bonjour) | Avahi 설치 시 |

`.local`로 끝나는 이름(`내맥북.local`)은 DNS 서버 없이 같은 네트워크의 기기들끼리 멀티캐스트로 묻고 답하는 [[mDNS]]로 풀립니다. 프린터와 AirPlay 기기를 찾는 방법입니다.

`dig`과 `nslookup`은 DNS 서버에 직접 묻고, 브라우저와 대부분의 프로그램은 운영체제의 `getaddrinfo`를 거칩니다. 그래서 `dig`은 되는데 브라우저는 안 되거나(hosts 파일, OS 캐시, VPN의 DNS 설정 차이), 그 반대인 경우가 있습니다. Node의 `dns.lookup`은 운영체제를 거치고, `dns.resolve`는 DNS 서버에 직접 묻습니다.

![같은 이름이라도 운영체제를 거치는 프로그램과 DNS 서버에 바로 묻는 도구는 다른 길로 답을 얻습니다](dns-lookup-paths.svg)

## DNS는 어떻게 오가나

DNS 질문과 답은 대개 UDP 53번 포트로 패킷 하나씩 오갑니다. 연결을 맺을 필요가 없으니 빠릅니다. 답이 너무 크면 TCP 53번으로 다시 묻습니다.

문제는 이 내용이 암호화되지 않는다는 것입니다. 같은 네트워크의 누군가나 통신사가 내가 어떤 사이트를 찾는지 다 볼 수 있고, 답을 바꿔치기할 수도 있습니다. 실제로 여러 나라에서 사이트 차단에 DNS 응답을 바꾸는 방식을 써 왔습니다. 그래서 두 가지 보완이 나왔습니다.

- **[[DoH]]**(DNS over HTTPS)와 DoT(DNS over TLS): DNS 질문을 HTTPS나 TLS로 암호화해 보냅니다. Firefox와 Chrome은 설정에서 켤 수 있고, Windows 11, macOS, Android도 지원합니다.
- **[[DNSSEC]]**: 권한 있는 네임서버가 답에 [[디지털 서명]]을 붙여, 리졸버가 답이 위조되지 않았는지 확인하게 합니다. 내용을 숨기지는 않습니다.

:::quiz dns-plain DoH를 끈 채 카페 Wi-Fi에서 이 페이지를 열었습니다. 카페 공유기를 관리하는 사람이 볼 수 있는 것은?
- [ ] 이 페이지의 HTML 본문
- [ ] 브라우저가 보낸 쿠키 값
- [x] 내가 `cs.mlnl.cloud`라는 이름을 찾았다는 것
- [ ] "다 읽었어요" 진행 기록

DNS 질문은 암호화되지 않은 UDP 패킷이라 이름이 그대로 보입니다. HTTP 본문과 쿠키는 HTTPS로 암호화되고(14장), 진행 기록은 네트워크로 나가지 않습니다. DoH나 DoT를 켜면 이름도 숨길 수 있습니다.
:::

## 곁가지: DNS로 하는 일들

DNS는 이름을 주소로 바꾸는 것 이상으로 쓰입니다.

- **부하 나누기**: 이름 하나에 A 레코드 여러 개를 두면 리졸버가 순서를 돌려 가며 답해 사용자들이 서버들에 흩어집니다. 이걸 [[라운드 로빈 DNS]]라고 합니다. 단순하지만 죽은 서버도 계속 알려 주는 약점이 있습니다.
- **가까운 서버로 보내기**: 묻는 리졸버의 위치를 보고 서울 사용자에게는 서울 서버 IP를, 미국 사용자에게는 미국 서버 IP를 답합니다(GeoDNS). CDN이 쓰는 방법 중 하나입니다.
- **장애 우회**: 서버의 상태를 검사하다가 죽으면 다른 서버의 IP를 답합니다(Route 53의 장애 조치).
- **메일 길 안내**: 메일 서버는 받는 사람 도메인의 MX 레코드를 보고 메일을 보낼 곳을 찾습니다.
- **소유 확인**: Google Search Console이나 Let's Encrypt가 "이 TXT 값을 DNS에 넣어 보라"고 해서 도메인 주인인지 확인합니다.
- **서비스 찾기**: Docker 네트워크 안에는 작은 DNS 서버(`127.0.0.11`)가 있어서 컨테이너 이름을 그 컨테이너의 IP로 풀어 줍니다. 이 사이트의 Caddy가 `mlnl-cs`라는 이름만으로 nginx 컨테이너를 찾는 방법이 이것입니다. Kubernetes도 서비스 이름을 DNS로 찾습니다.

## 이 사이트의 주소가 풀리는 과정

이 사이트의 주소는 `cs.mlnl.cloud`입니다. `mlnl.cloud`는 가비아에서 빌렸고, 가비아의 네임서버가 이 도메인의 권한 있는 네임서버입니다.

1. 리졸버가 루트에 묻고, `.cloud` 서버로 안내받습니다.
2. `.cloud` 서버가 "`mlnl.cloud`는 `ns.gabia.co.kr` 같은 가비아의 서버들에게 물어봐라"라고 NS 레코드로 안내합니다.
3. 가비아의 네임서버가 답합니다. 이 도메인에는 `*.mlnl.cloud → 54.116.117.190`이라는 레코드가 하나 있어서, `cs.`든 `blog.`든 처음 보는 이름이든 같은 IP를 답합니다.

이렇게 어떤 서브도메인이 와도 같은 규칙으로 답하는 방식을 [[와일드카드 DNS]]라고 합니다. 이름이 모두 같은 서버로 가니, 그중 어느 사이트로 보낼지는 서버의 Caddy가 `Host`를 보고 정합니다(14장). 새 서브사이트를 열 때 DNS는 건드리지 않고 Caddy 설정만 고치면 됩니다.

## 곁가지: 도메인 없이 이름 얻기

이 사이트도 2026년 11월 중순까지는 도메인 없이 `cs.mlnl.54-116-117-190.sslip.io`를 썼습니다. [[sslip.io]]는 이름 안에 적힌 IP를 그대로 답해 주는 공개 DNS 서비스입니다. sslip.io의 네임서버는 레코드 목록을 들고 있지 않고, 질문받은 이름에서 `54-116-117-190` 부분을 읽어 `54.116.117.190`이라는 A 레코드를 그 자리에서 만들어 답합니다.

![sslip.io의 네임서버는 이름 가운데 IP를 적은 부분을 읽어 답을 만듭니다](dns-sslip.svg)

도메인을 사지 않아도 공개 DNS에서 풀리는 이름이 생기니, 16장에서 볼 Let's Encrypt 인증서도 받을 수 있습니다. 나중에 진짜 도메인을 사면 위처럼 A 레코드에 같은 IP를 넣고 서버 설정의 도메인만 바꾸면 됩니다.

:::quiz sslip-any `hello.10-0-0-5.sslip.io`를 조회하면 돌아오는 A 레코드의 IP는?
= 10.0.0.5

**10.0.0.5**입니다. sslip.io의 네임서버는 이름 속 숫자 부분을 읽어 그대로 답합니다. 앞의 `hello`는 무엇이든 상관없습니다. 사설 IP라도 답은 돌아오지만, 그 주소로 연결이 되는지는 내가 그 네트워크 안에 있는지에 달렸습니다.
:::

## 다시 장면으로: 이름이 숫자가 되고 나서

맨 앞 그림은 이제 이렇게 읽힙니다. 엔터를 누르자 브라우저는 자기 캐시를, 운영체제는 hosts 파일과 캐시를 본 뒤 DHCP로 받은 DNS 서버에 UDP 패킷 하나로 물었습니다. 통신사의 재귀 리졸버는 루트와 `.cloud`의 안내를 따라 가비아의 네임서버에 닿았고, 그 서버는 와일드카드 레코드로 54.116.117.190을 답했습니다. 답은 돌아오며 리졸버, 운영체제, 브라우저의 캐시에 남았습니다. 이제 브라우저는 12장의 `connect`를 부릅니다. 9장 그림의 왕복 1이 끝나고 왕복 2가 시작됩니다.

이렇게 해서 브라우저와 서버 사이에 믿을 수 있는 통로가 하나 생겼습니다. 남은 것은 그 통로로 무엇을 주고받느냐입니다. 브라우저는 "이 페이지를 달라"는 말을 어떤 형식으로 적을까요? 그리고 그 말이 카페 Wi-Fi와 공유기, 통신사를 지나는 동안 아무도 읽거나 고치지 못하게 하려면 어떻게 해야 할까요? 9장 그림의 왕복 3과 4, 14장의 HTTP와 HTTPS입니다.

## DNS가 문제일 때

| 증상 | 뜻 | 확인 |
| --- | --- | --- |
| `ERR_NAME_NOT_RESOLVED`, `DNS_PROBE_FINISHED_NXDOMAIN` | 그런 이름이 없거나 찾지 못함 | 철자, `dig 이름`, 도메인 만료 여부 |
| `getaddrinfo ENOTFOUND` (Node) | 위와 같음 | `nslookup 이름` |
| 첫 요청만 유독 느림 | DNS 조회가 오래 걸림 | DevTools Timing의 DNS Lookup |
| 서버를 옮겼는데 일부 사람만 옛 서버로 감 | 리졸버들의 캐시가 아직 남아 있음 | 레코드의 TTL, `dig @8.8.8.8`과 `dig @1.1.1.1` 비교 |
| 내 컴퓨터에서만 안 됨 | hosts 파일, OS 캐시, VPN의 DNS 설정 | hosts 파일 확인, 캐시 비우기 |

"It's always DNS"라는 농담이 있을 만큼, 원인을 모를 장애의 상당수가 DNS입니다.

:::quiz enotfound Node에서 `getaddrinfo ENOTFOUND api.exmaple.com`이 났습니다. 가장 먼저 확인할 것은?
- [ ] 서버의 443번 포트가 열려 있는지
- [x] 이름의 철자가 맞는지
- [ ] TCP 혼잡 윈도가 너무 작은지
- [ ] 서버 인증서가 만료되었는지

이름 철자입니다(`exmaple`). ENOTFOUND는 이름을 IP로 바꾸지 못했다는 뜻이라 연결은 시작도 하지 않았습니다. 포트, TCP, 인증서는 IP를 얻은 다음의 문제입니다.
:::

## 프론트엔드와 이어지는 곳

- 페이지가 쓰는 외부 도메인(폰트, 분석, 이미지 CDN)마다 DNS 조회와 연결이 따로 듭니다. `<link rel="dns-prefetch">`는 DNS 조회만, `<link rel="preconnect">`는 DNS, TCP, TLS까지 미리 해 둡니다.
- Vercel, Netlify, GitHub Pages에 내 도메인을 붙이는 설정은 A 레코드나 CNAME 레코드를 넣는 일입니다.
- 쿠키의 `Domain=.example.com`은 DNS 이름 나무를 따라 서브도메인들에 쿠키를 나눠 줍니다. 이 사이트의 API도 `.도메인`으로 쿠키를 둡니다.
- 로컬에서 여러 서비스를 띄울 때 `api.localhost`, `app.localhost` 같은 이름을 쓰면 hosts 파일을 고치지 않아도 됩니다.

## 용어 정리

:::terms
- DNS (Domain Name System) — 도메인 이름을 IP 주소 같은 정보로 바꿔 주는, 전 세계에 나뉘어 관리되는 이름 체계입니다.
- 도메인 이름 (domain name) — 점으로 나뉜 이름표를 오른쪽(루트)에서 왼쪽으로 읽는 나무 구조의 이름. `blog.example.com` 같은.
- TLD (Top-Level Domain) — 도메인 이름의 맨 오른쪽 부분. `com`, `org` 같은 일반 TLD와 `kr` 같은 국가 TLD가 있습니다.
- 서브도메인 (subdomain) — 등록한 도메인 아래에 주인이 자유롭게 만드는 이름. `blog.example.com`의 `blog`.
- 도메인 등록 기관 (domain registrar) — 도메인 이름을 사용자에게 빌려주고 등록을 대행하는 회사. 가비아, Namecheap 등.
- 네임서버 (name server) — DNS 질문에 답하는 서버입니다.
- 스텁 리졸버 (stub resolver) — 운영체제 안에서 프로그램 대신 재귀 리졸버에 이름을 묻고 결과를 캐시하는 작은 리졸버입니다.
- 재귀 리졸버 (recursive resolver) — 루트부터 권한 있는 네임서버까지 차례로 물어 최종 답을 찾아 주고 캐시하는 서버. 통신사 DNS, `8.8.8.8`, `1.1.1.1`.
- 루트 네임서버 (root name server) — DNS 나무의 꼭대기. TLD를 맡은 네임서버를 알려 줍니다. 이름 13개가 애니캐스트로 세계 곳곳에 있습니다.
- 권한 있는 네임서버 (authoritative name server) — 어떤 도메인의 레코드 원본을 가지고 그 도메인에 대한 공식 답을 주는 서버입니다.
- DNS 레코드 (DNS record) — 이름, 종류, TTL, 값으로 된 DNS의 정보 한 줄입니다.
- A 레코드 (A record) — 이름을 IPv4 주소로 연결하는 레코드입니다.
- AAAA 레코드 (AAAA record) — 이름을 IPv6 주소로 연결하는 레코드입니다.
- CNAME 레코드 (CNAME record) — 이름을 다른 이름의 별명으로 만드는 레코드. 리졸버는 그 다른 이름을 이어서 찾습니다.
- MX 레코드 (MX record) — 도메인의 메일을 받는 서버를 가리키는 레코드입니다.
- TXT 레코드 (TXT record) — 임의의 글자를 담는 레코드. 도메인 소유 확인, SPF 같은 메일 보안 설정에 씁니다.
- NS 레코드 (NS record) — 도메인이나 서브도메인을 맡은 네임서버를 가리키는 레코드입니다.
- DNS TTL — DNS 답을 캐시해도 되는 시간(초). 이 시간 동안은 레코드를 바꿔도 옛 답이 남을 수 있습니다.
- hosts 파일 (hosts file) — 이름과 IP를 손으로 적어 두는 파일. 운영체제가 DNS보다 먼저 봅니다.
- mDNS (multicast DNS) — DNS 서버 없이 같은 네트워크의 기기들끼리 `.local` 이름을 멀티캐스트로 묻고 답하는 방식입니다.
- DoH (DNS over HTTPS) — DNS 질문과 답을 HTTPS로 암호화해 주고받는 방식입니다.
- DNSSEC — DNS 답에 디지털 서명을 붙여 위조되지 않았음을 확인하게 하는 확장입니다.
- 라운드 로빈 DNS (round-robin DNS) — 이름 하나에 여러 IP를 두고 돌려 가며 답해 요청을 서버들에 나누는 방법입니다.
- 와일드카드 DNS (wildcard DNS) — 어떤 서브도메인이 와도 정해진 규칙대로 답하는 DNS 설정입니다.
- sslip.io — 이름 안에 적힌 IP 주소를 그대로 A 레코드로 답해 주는 무료 와일드카드 DNS 서비스입니다.
:::

## 직접 해보기

:::practice dig 이름 하나를 끝까지 따라가기
`dig +trace`로 루트부터 권한 있는 네임서버까지 차례로 물어 가는 과정을 직접 봅니다. 각 단계의 답이 "다음은 저기 물어봐라"(NS)인지 "답은 이거다"(A)인지 구분합니다. Windows는 `Resolve-DnsName`에 trace 기능이 없으니 WSL이나 온라인 도구를 씁니다.

```sh macOS · Linux
dig +trace www.example.com
dig naver.com A +short
dig naver.com AAAA +short
dig www.naver.com CNAME +short
dig gmail.com MX +short
dig google.com TXT +short
```

```powershell Windows (PowerShell)
Resolve-DnsName naver.com -Type A
Resolve-DnsName gmail.com -Type MX
Resolve-DnsName www.naver.com -Type CNAME
```
:::

:::practice ttl 캐시와 TTL 확인하기
같은 이름을 공용 리졸버에 두 번 물어, 두 번째 답의 TTL이 줄어 있는지 봅니다(캐시에서 나온 답). 그리고 내 컴퓨터의 DNS 캐시를 비운 뒤 브라우저의 첫 요청 DNS Lookup 시간이 어떻게 바뀌는지 DevTools로 봅니다.

```sh macOS · Linux
dig @1.1.1.1 example.com | grep -A1 "ANSWER SECTION"
sleep 5
dig @1.1.1.1 example.com | grep -A1 "ANSWER SECTION"   # TTL 숫자가 줄어 있으면 캐시
```

```powershell Windows
ipconfig /displaydns | Select-String -Context 0,5 example
ipconfig /flushdns
```
:::

:::practice hosts hosts 파일로 내 컴퓨터만의 이름 만들기
hosts 파일에 `127.0.0.1 myapp.test`를 추가하고, 로컬 개발 서버를 `http://myapp.test:3000`으로 열어 봅니다. 끝나면 그 줄을 지웁니다. `dig myapp.test`로는 안 풀리고 `ping myapp.test`로는 풀리는 이유도 생각해 봅니다(dig은 hosts 파일을 보지 않고 DNS 서버에 직접 묻습니다).

```sh macOS · Linux
echo "127.0.0.1 myapp.test" | sudo tee -a /etc/hosts
ping -c 1 myapp.test
dig myapp.test +short        # 아무것도 안 나옴
```

```powershell Windows (관리자 PowerShell)
Add-Content C:\Windows\System32\drivers\etc\hosts "127.0.0.1 myapp.test"
ping -n 1 myapp.test
```
:::

:::practice sslip 이 사이트의 이름이 풀리는 과정 보기
`+trace`로 루트부터 차례로 물어 가며 누가 답을 주는지 봅니다. 와일드카드 레코드와 sslip.io도 확인합니다.

```sh macOS · Linux
dig +trace cs.mlnl.cloud | tail -12      # 루트 → .cloud → 가비아 순서로 답이 옴
dig +short NS mlnl.cloud                 # 이 도메인을 맡은 가비아의 네임서버
dig +short anything.mlnl.cloud           # 와일드카드라 같은 IP가 나옴
dig +short anything.10-0-0-1.sslip.io    # 이름 속 숫자가 그대로 답으로
```

```powershell Windows
Resolve-DnsName cs.mlnl.cloud
Resolve-DnsName -Type NS mlnl.cloud
Resolve-DnsName anything.10-0-0-1.sslip.io
```
:::

## 장 전체 문제

:::quiz second-visit 이 페이지를 1분 뒤에 다시 열면, 9장 맨 앞 그림의 왕복 1은 어떻게 될까요?
- [x] 브라우저나 운영체제의 캐시에서 끝나 네트워크로 나가지 않는다
- [ ] 루트 네임서버부터 다시 찾는다
- [ ] 통신사 리졸버까지는 꼭 묻는다
- [ ] 가비아의 네임서버가 노트북에 직접 답한다

캐시에서 끝납니다. 처음 찾은 답이 TTL 동안 브라우저와 운영체제에 남아 있으니 다시 묻지 않습니다. 그래서 두 번째 방문은 DNS 왕복 없이 바로 연결로 넘어갑니다.
:::

:::quiz ns-down 가비아의 네임서버가 모두 멈췄습니다. 이 사이트의 서버(54.116.117.190)는 멀쩡한데, 처음 오는 방문자가 이 페이지를 열지 못하는 이유는?
- [ ] 서버가 가비아에 매번 허락을 받아야 응답해서
- [ ] 인증서가 가비아 네임서버에 저장되어 있어서
- [ ] 라우터들이 가비아로 가는 길을 잊어서
- [x] 이름을 IP로 바꾸지 못해 `connect`를 부를 수조차 없어서

이름을 풀지 못하면 연결이 시작되지 않습니다. 서버와 길은 멀쩡해도 브라우저는 어디로 SYN을 보낼지 모릅니다. 이미 답을 캐시해 둔 사람은 TTL이 끝날 때까지 들어올 수 있습니다. 11장의 Facebook 사고에서도 DNS 서버로 가는 길이 사라지자 같은 일이 일어났습니다.
:::

## 스스로 점검

:::qa 내 컴퓨터가 처음 보는 `www.example.com`의 IP를 알아내기까지 거치는 서버들을 순서대로 말해 보세요. 각자 무엇을 답하나요?
운영체제의 스텁 리졸버가 캐시와 hosts 파일을 본 뒤 재귀 리졸버에 묻습니다. 재귀 리졸버는 캐시에 없으면 루트에 물어 `.com` 네임서버를 안내받고, `.com` 서버에 물어 `example.com`의 네임서버를 안내받고, 그 권한 있는 네임서버에 물어 A 레코드를 받습니다. 답은 TTL 동안 리졸버, OS, 브라우저에 캐시됩니다.
:::

:::qa A 레코드와 CNAME 레코드의 차이는? Vercel이 `www`에 CNAME을 넣으라고 하는 이유는?
A는 이름을 IP 주소로 바로 연결하고, CNAME은 이름을 다른 이름의 별명으로 만들어 그 이름의 답을 따르게 합니다. CNAME으로 Vercel의 이름을 가리키면 Vercel이 서버 IP를 바꾸거나 위치별로 다른 IP를 줘도 내 DNS 설정을 고칠 필요가 없습니다.
:::

:::qa DNS 레코드를 바꿨는데 어떤 사람은 새 서버로, 어떤 사람은 옛 서버로 갑니다. 왜이고, 미리 어떻게 대비하나요?
각 리졸버와 기기가 옛 답을 TTL이 끝날 때까지 캐시하고 있기 때문입니다. 옮기기 며칠 전에 TTL을 짧게 줄여 두면 옛 답이 금방 사라지고, 옮긴 뒤 다시 늘립니다.
:::

:::qa `dig`으로는 새 IP가 나오는데 브라우저는 계속 옛 서버로 갑니다. 의심할 곳은?
`dig`은 DNS 서버에 직접 묻지만 브라우저는 브라우저 캐시, 운영체제 캐시, hosts 파일을 거칩니다. hosts 파일에 옛 주소가 적혀 있는지 보고, OS와 브라우저(`chrome://net-internals/#dns`)의 DNS 캐시를 비웁니다. VPN이 다른 DNS 서버를 쓰게 하는지도 확인합니다.
:::

:::qa 이 사이트의 Caddy 컨테이너가 `mlnl-cs`라는 이름만으로 nginx 컨테이너를 찾을 수 있는 이유는?
같은 Docker 사용자 정의 네트워크에 붙은 컨테이너들에게 Docker가 내장 DNS 서버(`127.0.0.11`)를 제공하고, 이 서버가 컨테이너 이름(서비스 이름)을 그 컨테이너의 내부 IP로 풀어 주기 때문입니다.
:::

## 더 읽을거리

- [How DNS Works (만화)](https://howdns.works/) — DNS 조회 과정을 짧은 만화로 따라갑니다. 이 장을 읽기 전이나 후에 보면 좋습니다.
- [Julia Evans: How DNS works](https://wizardzines.com/zines/dns/) — DNS를 실제로 디버깅하는 관점에서 정리한 짧은 책입니다. 같은 저자의 무료 도구 [Mess With DNS](https://messwithdns.net/)에서 레코드를 직접 만들어 볼 수 있습니다.
- [Cloudflare Learning: What is DNS?](https://www.cloudflare.com/learning/dns/what-is-dns/) — 리졸버와 네임서버의 종류, 레코드 타입을 정리한 글입니다.
- [sslip.io](https://sslip.io/) — 이 사이트가 도메인을 사기 전에 쓰던 와일드카드 DNS 서비스의 설명 페이지입니다.
- [MDN: dns-prefetch 사용하기](https://developer.mozilla.org/ko/docs/Web/Performance/Guides/dns-prefetch) — DNS 조회를 미리 해 두는 방법과 preconnect와의 차이.
