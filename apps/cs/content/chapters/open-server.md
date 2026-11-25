---
title: 서버를 열고 밖에서 접속하기
summary: 가장 작은 서버를 직접 띄우는 데서 시작해, 그 서버에 같은 Wi-Fi의 휴대폰, 그리고 인터넷의 누군가가 접속하기까지 막히는 곳을 하나씩 엽니다. 바인드 주소(127.0.0.1과 0.0.0.0), 포트 충돌, 운영체제별 방화벽, 공유기 포트 포워딩과 터널, 클라우드 서버와 보안 그룹, 도메인 연결, Let's Encrypt로 HTTPS 붙이기, 그리고 서버를 지키는 기본까지 봅니다.
---

"서버를 연다"는 말은 결국 "어떤 포트에서 연결을 받겠다"는 뜻입니다. 그런데 서버를 띄웠다고 바로 누구나 접속할 수 있는 건 아닙니다. 내 컴퓨터 안, 같은 Wi-Fi, 인터넷 순서로 한 겹씩 넓어질 때마다 막는 것이 하나씩 있습니다. 이 장은 그 겹들을 안에서 밖으로 하나씩 엽니다. 3부에서 배운 것들이 모두 여기서 실제 문제로 나타납니다.

## 가장 작은 서버

TCP 서버는 Node 몇 줄이면 됩니다.

```js echo.mjs
import net from "node:net";

const server = net.createServer((socket) => {      // 연결이 하나 올 때마다 (accept)
  console.log("연결:", socket.remoteAddress, socket.remotePort);
  socket.write("안녕하세요. 보낸 글자를 그대로 돌려드립니다.\n");
  socket.on("data", (chunk) => socket.write(chunk)); // 받은 걸 그대로 돌려보냄
});
server.listen(4000, "127.0.0.1", () => console.log("4000번에서 기다리는 중")); // socket + bind + listen
```

```sh 다른 터미널에서 (Windows는 WSL이나 telnet 클라이언트)
nc 127.0.0.1 4000
```

`listen` 한 줄이 12장의 `socket`, `bind`, `listen` 시스템 콜이고, 콜백이 `accept`로 받은 연결입니다. HTTP 서버는 이 위에서 받은 바이트를 HTTP 요청으로 해석하고 HTTP 응답 형식으로 쓰는 것뿐입니다.

```js hello.mjs
import http from "node:http";
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(`안녕하세요. ${req.method} ${req.url} 요청을 받았습니다.\n`);
}).listen(3000, "0.0.0.0");
```

두 서버의 `listen`에 적은 두 번째 인자, `127.0.0.1`과 `0.0.0.0`이 이 장의 첫 관문입니다.

## 첫째 겹: 어느 주소에서 들을까

서버 소켓은 포트와 함께 [[바인드 주소]]를 정합니다. "이 컴퓨터의 어느 네트워크 장치로 들어온 연결을 받을지"입니다.

| 바인드 주소 | 받는 연결 | 쓰임 |
| --- | --- | --- |
| `127.0.0.1` (또는 `::1`) | 이 컴퓨터 안에서 온 것만 (루프백 장치) | 개발 서버, 외부에 열면 안 되는 DB |
| `0.0.0.0` (또는 `::`) | 모든 장치로 들어온 것 | 다른 기기에서 접속해야 하는 서버 |
| `192.168.0.23` 같은 특정 주소 | 그 장치로 들어온 것만 | 장치가 여럿인 서버에서 골라 받을 때 |

[[localhost]]는 루프백 주소를 가리키는 이름입니다. 11장에서 본 것처럼 IPv4 `127.0.0.1`과 IPv6 `::1` 둘 다일 수 있습니다. [[0.0.0.0]]은 바인드할 때 "모든 주소"라는 특별한 뜻입니다. 브라우저 주소창에 치는 목적지 주소가 아닙니다.

개발 도구들은 안전하게 기본값을 `localhost`로 둡니다. 그래서 휴대폰으로 개발 서버를 보려면 일부러 열어야 합니다.

| 도구 | 기본 | 모든 장치에서 받기 |
| --- | --- | --- |
| Vite | `localhost` | `vite --host` 또는 `server.host: true` |
| Next.js | 모든 장치 (`::`) | 기본이 열려 있음. `-H 127.0.0.1`로 좁힘 |
| `python -m http.server` | 모든 장치 | `--bind 127.0.0.1`로 좁힘 |

컨테이너에서 이 차이가 자주 사고를 냅니다. 컨테이너 안의 앱이 `127.0.0.1`에서 듣고 있으면, 그 루프백은 컨테이너 자신의 네트워크 네임스페이스(15장) 안의 루프백입니다. `docker run -p 3000:3000`으로 포트를 이어 줘도 바깥에서 들어온 연결은 컨테이너의 가상 네트워크 장치로 들어오니 앱에 닿지 못합니다. 브라우저는 "연결이 재설정되었습니다"를 보여 줍니다. **컨테이너 안의 서버는 `0.0.0.0`에서 들어야 합니다.**

반대로 Docker의 `-p`는 기본으로 호스트의 모든 주소에 포트를 엽니다. 개발용 DB 컨테이너를 `-p 5432:5432`로 띄우면 같은 카페 Wi-Fi의 누구나 접속을 시도할 수 있습니다. 내 컴퓨터에서만 쓸 거면 `-p 127.0.0.1:5432:5432`로 좁힙니다. Linux에서는 Docker가 방화벽 규칙을 직접 고쳐서, ufw로 막아 둔 포트도 `-p`로 연 컨테이너는 열려 버린다는 함정도 있습니다. 이 사이트의 `docker-compose.yml`이 앱 컨테이너에 포트를 하나도 열지 않고 같은 Docker 네트워크의 Caddy만 들어오게 한 이유입니다.

## 포트를 고를 때 만나는 것들

**[[EADDRINUSE]]**: 이미 누가 그 포트를 쓰고 있습니다. 대개 전에 띄운 개발 서버가 안 꺼지고 남아 있는 것입니다. 누가 쓰는지 찾아 끝냅니다.

| | 포트 3000을 쓰는 프로세스 찾기 | 끝내기 |
| --- | --- | --- |
| macOS | `lsof -i :3000` | `kill PID` |
| Linux | `ss -tlnp 'sport = :3000'` 또는 `lsof -i :3000` | `kill PID` |
| Windows | `Get-NetTCPConnection -LocalPort 3000` 또는 `netstat -ano \| findstr :3000` | `Stop-Process -Id PID` 또는 `taskkill /PID PID /F` |

서버를 껐다 바로 다시 켤 때 TIME_WAIT(12장) 때문에 같은 포트에 `bind`가 실패하는 일을 막으려고, 대부분의 서버 프로그램은 `SO_REUSEADDR` 옵션을 켭니다. Node는 기본으로 켜 줍니다.

**[[특권 포트]]**: 1024 미만의 포트는 운영체제에 따라 관리자만 열 수 있습니다.

| | Windows | macOS | Linux |
| --- | --- | --- | --- |
| 1024 미만 포트 | 제한 없음 | 2018년(Mojave)부터 제한 없음 | root만 (또는 `CAP_NET_BIND_SERVICE` 권한) |

그래서 Linux 서버에서 Node 앱을 80번에 직접 띄우려면 root가 필요한데, 앱을 root로 돌리는 건 위험합니다(4장). 앱은 3000번 같은 포트에서 일반 사용자로 돌리고, 앞에 리버스 프록시(이 사이트의 Caddy)를 두어 80과 443을 받게 하는 게 일반적입니다.

## 둘째 겹: 같은 Wi-Fi의 휴대폰에서 접속하기

서버를 `0.0.0.0`에서 띄웠다면, 같은 공유기에 붙은 휴대폰 브라우저에서 `http://내컴퓨터LAN IP:3000`으로 열어 봅니다. 내 LAN IP는 10장과 11장에서 찾은 `192.168.x.x` 주소입니다. 안 열린다면 운영체제의 방화벽이 막고 있을 가능성이 큽니다.

[[방화벽]]은 정해 둔 규칙에 따라 패킷을 통과시키거나 막는 장치입니다. 규칙은 방향(들어오는 [[인바운드]], 나가는 아웃바운드), 프로토콜, 포트, 상대 주소로 정합니다. 요즘 방화벽은 상태를 기억해서, 안에서 먼저 나간 연결의 답은 따로 규칙이 없어도 들여보냅니다. 그래서 보통은 "나가는 건 다 허용, 들어오는 건 허용한 것만"으로 둡니다. 11장의 NAT가 하던 일과 닮았습니다.

내 컴퓨터 자체에도 방화벽이 있고, 운영체제마다 모양이 다릅니다.

| | Windows | macOS | Linux |
| --- | --- | --- | --- |
| 기본 방화벽 | Windows Defender 방화벽 (기본으로 켜짐) | 애플리케이션 방화벽 (기본으로 꺼짐) + 그 아래 pf | nftables/iptables. 데스크톱은 대개 규칙 없음, Ubuntu는 ufw로 관리 |
| 규칙 단위 | 프로그램, 포트, 네트워크 프로필별 | 앱별 "들어오는 연결 허용/차단" | 포트, 주소, 프로토콜별 |
| 처음 서버를 띄우면 | "Node.js JavaScript Runtime의 액세스를 허용하시겠습니까?" 창. 개인/공용 네트워크를 고름 | 켜져 있으면 "들어오는 네트워크 연결을 허용하시겠습니까?" 창 | 아무것도 안 물어봄 |
| 명령으로 열기 | `New-NetFirewallRule -DisplayName dev3000 -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow` | 시스템 설정 → 네트워크 → 방화벽 → 옵션 | `sudo ufw allow 3000/tcp` |

Windows는 네트워크마다 "개인"과 "공용" 프로필을 따로 둡니다. 집 Wi-Fi를 공용으로 잡아 두면 Node 허용 창에서 개인만 체크한 경우 휴대폰에서 접속이 막힙니다. 카페나 회사의 게스트 Wi-Fi는 공유기에서 기기끼리의 통신 자체를 막아 두기도 합니다(AP 격리). 그럴 땐 방화벽을 열어도 안 됩니다.

## 셋째 겹: 인터넷에서 집 컴퓨터로

같은 Wi-Fi는 됐습니다. 이제 다른 곳의 친구가 내 집 컴퓨터의 서버에 접속하게 하려면 11장의 NAT를 넘어야 합니다.

**[[포트 포워딩]]**: 공유기 관리 화면에서 "공인 IP의 8080번으로 오는 TCP는 `192.168.0.23`의 3000번으로 보내라"는 규칙을 넣습니다. NAT 표에 고정된 줄을 손으로 하나 넣는 것입니다. 그러면 친구가 `http://우리집공인IP:8080`으로 접속할 수 있습니다. 걸리는 것들이 있습니다.

- **CGNAT**: 공유기의 바깥 IP가 공인 IP가 아니면(11장) 통신사의 NAT를 넘을 수 없어 포트 포워딩이 소용없습니다.
- **유동 IP**: 집의 공인 IP는 바뀔 수 있습니다. 바뀔 때마다 DNS를 자동으로 고쳐 주는 [[DDNS]]를 씁니다. 많은 공유기에 DDNS 기능이 있습니다.
- **통신사의 포트 차단**: 일부 통신사는 가정 회선의 80, 25번 같은 포트를 막습니다.
- **보안**: 집 컴퓨터가 인터넷 전체에 노출됩니다. 아래 "서버를 지키는 기본"을 집 컴퓨터에도 적용해야 합니다.

**[[터널링]]**: NAT와 CGNAT를 넘는 다른 방법입니다. 내 컴퓨터에서 터널 서비스(ngrok, Cloudflare Tunnel, Tailscale Funnel)로 **나가는** 연결을 하나 맺어 두면, 터널 서비스가 인터넷에서 받은 요청을 그 연결을 거꾸로 타고 내 컴퓨터로 보내 줍니다. 안에서 먼저 나간 연결이니 NAT도 방화벽도 막지 않습니다. 공유기 설정을 만질 필요가 없고 HTTPS 주소까지 바로 생깁니다.

```sh 터미널
npx --yes localtunnel --port 3000        # 또는 ngrok http 3000, cloudflared tunnel --url http://localhost:3000
# https://something.loca.lt 같은 공개 주소가 생깁니다
```

결제 서비스나 Slack의 웹훅을 개발할 때 "내 로컬 서버에 공개 주소가 필요한" 경우에 많이 씁니다. 다만 그 주소를 아는 누구나 내 컴퓨터의 서버에 접속할 수 있다는 걸 잊지 않습니다.

## 클라우드 서버에서 열기

진짜 서비스는 보통 15장의 클라우드 서버에서 엽니다. 순서는 이렇습니다.

1. **서버 만들기**: Lightsail이나 EC2에서 Ubuntu LTS 인스턴스를 만들고, SSH 키를 받습니다.
2. **고정 IP 붙이기**: 클라우드 서버의 공인 IP는 서버를 껐다 켜면 바뀔 수 있습니다. Lightsail의 고정 IP나 EC2의 Elastic IP처럼 바뀌지 않는 [[고정 IP]]를 붙입니다. DNS가 이 주소를 가리킬 것입니다.
3. **클라우드 방화벽 열기**: 클라우드에는 서버 바깥에 또 하나의 방화벽이 있습니다. AWS에서는 [[보안 그룹]], Lightsail에서는 네트워킹 탭의 방화벽입니다. 기본으로는 22번(SSH)만 열려 있습니다. 웹 서버라면 80, 443을 열고, 22번은 가능하면 내 IP에서만 들어오게 좁힙니다.
4. **SSH로 들어가 앱 띄우기**: Node나 Docker를 설치하고, 앱을 systemd 서비스나 컨테이너로 띄웁니다(15장).
5. **서버 안의 방화벽**: Ubuntu의 ufw를 쓴다면 같은 포트를 엽니다. 클라우드 방화벽과 서버 방화벽 두 겹 중 하나라도 막혀 있으면 안 됩니다.
6. **밖에서 확인**: 내 컴퓨터에서 `curl http://서버IP`로 접속해 봅니다.

막혔을 때는 12장의 오류로 어디서 막혔는지 짐작합니다. `ECONNREFUSED`(연결 거부)면 서버까지는 갔는데 그 포트에 앱이 없거나 `127.0.0.1`에서만 듣고 있는 것이고, `ETIMEDOUT`(시간 초과)이면 클라우드 방화벽이나 서버 방화벽이 패킷을 버리고 있는 것입니다.

## 도메인 연결하기

IP 주소 대신 이름으로 접속하게 하려면 13장의 DNS 레코드를 하나 만듭니다.

1. 도메인 등록 기관에서 도메인을 삽니다(또는 sslip.io 같은 서비스로 대신합니다).
2. 그 도메인의 DNS 관리 화면에서 A 레코드를 만듭니다. `example.com → 서버의 고정 IP`, 필요하면 `www`나 서브도메인도.
3. TTL만큼 기다린 뒤 `dig example.com +short`로 서버 IP가 나오는지 확인합니다.

이 사이트는 도메인 대신 sslip.io를 써서 이 단계를 건너뛰었습니다. 이름에 서버 IP가 들어 있으니 DNS 설정이 따로 필요 없습니다.

## HTTPS 붙이기: Let's Encrypt와 ACME

이제 `http://`로는 접속됩니다. 14장에서 본 것처럼 요즘 웹은 HTTPS가 기본이고, 브라우저는 HTTP 사이트에 "주의 요함"을 붙이며, 많은 API가 HTTPS에서만 동작합니다. HTTPS를 하려면 인증 기관이 서명한 인증서가 필요합니다.

[[Let's Encrypt]]는 인증서를 무료로, 자동으로 내주는 인증 기관입니다. 사람이 신청서를 쓰는 대신 서버 프로그램이 [[ACME]]라는 프로토콜로 Let's Encrypt와 대화하며 발급받습니다.

1. 서버의 ACME 클라이언트가 "`example.com`의 인증서를 주세요"라고 요청합니다.
2. Let's Encrypt가 "그 도메인의 주인이라는 걸 증명하라"며 도전 과제와 토큰을 줍니다.
3. 증명합니다. 방법이 여럿입니다.
   - **HTTP-01**: `http://example.com/.well-known/acme-challenge/토큰` 주소에 정해진 값을 올려 둡니다. Let's Encrypt가 인터넷에서 그 주소로 접속해 확인합니다. 그래서 80번 포트가 인터넷에서 열려 있어야 합니다.
   - **DNS-01**: `_acme-challenge.example.com`에 정해진 TXT 레코드를 넣습니다. 포트를 열 필요가 없고, `*.example.com` 같은 와일드카드 인증서는 이 방법으로만 받습니다.
   - **TLS-ALPN-01**: 443번 포트의 TLS 핸드셰이크에서 특별한 인증서로 답합니다.
4. 확인되면 Let's Encrypt가 서명한 인증서를 내줍니다. 유효 기간은 90일이고(점점 짧아지는 중), ACME 클라이언트가 만료 전에 알아서 다시 받습니다.

이 일을 하는 프로그램으로 certbot이 유명하지만, 요즘 웹 서버 중에는 이걸 스스로 하는 것도 있습니다. 이 사이트의 앞단인 [[Caddy]]는 설정 파일에 도메인 이름만 적으면 그 이름의 인증서를 자동으로 받고, 갱신하고, HTTP 요청을 HTTPS로 돌려보냅니다. `deploy/Caddyfile.mlnl`의 `cs.__SITE_DOMAIN__ { … }` 블록 하나가 그 도메인의 HTTPS 전부입니다.

앱 서버 대신 앞단의 프록시가 HTTPS를 맡아 TLS를 풀고, 안쪽 앱에는 평범한 HTTP로 넘기는 것을 [[TLS 종료]]라고 합니다. 앱마다 인증서를 관리할 필요가 없어집니다.

로컬 개발에서 HTTPS가 필요하면 `mkcert`로 내 컴퓨터만 믿는 작은 인증 기관을 만들어 `localhost` 인증서를 발급합니다. 공개 인증 기관은 `localhost`나 사설 IP의 인증서를 내주지 않습니다.

## 서버를 지키는 기본

공인 IP에 포트를 열면, 몇 분 안에 전 세계의 자동화된 봇이 찾아옵니다. 봇들은 IPv4 주소 전체를 쉬지 않고 훑으며 열린 22번에 흔한 아이디와 비밀번호를 넣어 보고([[무차별 대입 공격]]), 알려진 취약점이 있는 프로그램을 찾습니다. 서버를 열고 `/var/log/auth.log`(Ubuntu)를 보면 낯선 로그인 시도가 줄줄이 찍혀 있을 것입니다. 그래서 공개 서버라면 이것들은 기본입니다.

| 할 일 | 이유 |
| --- | --- |
| SSH는 키로만, 비밀번호 로그인 끄기 (`PasswordAuthentication no`) | 무차별 대입이 의미 없어짐 |
| root로 SSH 로그인 끄기, 일반 사용자 + sudo | 실수와 피해 범위를 줄임 |
| 클라우드 방화벽에서 필요한 포트만, 22번은 내 IP만 | 공격받을 문을 줄임 |
| 보안 업데이트 자동 설치 (`unattended-upgrades`) | 알려진 취약점을 막음 |
| 앱은 root가 아닌 사용자나 컨테이너로 | 앱이 뚫려도 서버 전체를 내주지 않음 |
| DB, Redis, 관리 화면은 인터넷에 열지 않기 | 이들은 바깥 노출을 전제로 만들지 않음. SSH 포트 포워딩으로 접속 |
| 비밀 값은 코드가 아니라 환경 변수나 비밀 저장소에 | Git에 올라간 키는 반드시 털린다고 봄 |
| 반복되는 로그인 실패 IP 차단 (fail2ban) | 무차별 대입을 늦춤 |
| 백업, 그리고 복구 연습 | 무엇이 잘못돼도 되돌릴 수 있게 |

보안은 23장에서 더 자세히 봅니다.

## 체크리스트: 내 서버가 밖에서 안 열릴 때

안에서부터 밖으로 하나씩 확인합니다.

| 순서 | 확인 | 방법 |
| --- | --- | --- |
| 1 | 서버 프로그램이 떠 있나 | `curl localhost:포트` (서버 안에서) |
| 2 | 모든 주소에서 듣고 있나 | `ss -tlnp`, `lsof -i`에서 `127.0.0.1`이 아니라 `*`, `0.0.0.0`, `::`인지 |
| 3 | 서버 안의 방화벽 | `sudo ufw status`, Windows 방화벽 규칙 |
| 4 | 클라우드 방화벽 또는 공유기 포트 포워딩 | 콘솔의 보안 그룹, 공유기 관리 화면 |
| 5 | 공인 IP가 맞나 (CGNAT, 유동 IP) | `curl ifconfig.me`와 비교 |
| 6 | DNS가 그 IP를 가리키나 | `dig 도메인 +short` |
| 7 | HTTPS 인증서 | `curl -v https://도메인`의 인증서 줄 |

## 프론트엔드와 이어지는 곳

- 휴대폰으로 개발 중인 화면을 보려면 `vite --host`로 모든 주소에서 듣게 하고, 방화벽 허용 창에서 개인 네트워크를 허용하고, 휴대폰에서 LAN IP로 엽니다. 이때는 HTTPS가 아니라서 카메라 같은 보안 컨텍스트 API는 안 됩니다(14장).
- Docker로 띄운 프론트엔드 개발 서버가 바깥에서 안 열리면, 컨테이너 안에서 `0.0.0.0`으로 듣는지부터 봅니다.
- 웹훅을 받는 기능을 개발할 때는 터널 도구로 임시 공개 주소를 만듭니다.
- PR마다 만들어지는 미리 보기 배포(Vercel Preview)는 이 장의 일을 플랫폼이 대신해 주는 것입니다.

## 용어 정리

:::terms
- 바인드 주소 (bind address) — 서버 소켓이 연결을 받을 이 컴퓨터의 주소. 어느 네트워크 장치로 들어온 연결을 받을지 정합니다.
- localhost — 자기 자신을 가리키는 이름. 보통 `127.0.0.1`과 `::1`로 풀립니다.
- 0.0.0.0 — 서버가 바인드할 때 "이 컴퓨터의 모든 주소에서 받겠다"는 뜻으로 쓰는 특별한 주소입니다.
- EADDRINUSE — 이미 다른 소켓이 쓰고 있는 주소와 포트에 바인드하려 할 때 나는 오류입니다.
- 특권 포트 (privileged port) — 1024 미만의 포트. Linux에서는 root나 특별한 권한이 있어야 열 수 있습니다.
- 방화벽 (firewall) — 방향, 프로토콜, 포트, 주소 규칙에 따라 패킷을 통과시키거나 막는 장치나 소프트웨어입니다.
- 인바운드 (inbound) — 바깥에서 이 컴퓨터로 들어오는 트래픽. 반대는 아웃바운드입니다.
- 보안 그룹 (security group) — AWS 같은 클라우드에서 서버 바깥에 두는 가상 방화벽 규칙 묶음입니다.
- 포트 포워딩 (port forwarding) — 공유기가 공인 IP의 특정 포트로 들어온 연결을 안쪽 기기의 특정 포트로 보내도록 정한 고정 규칙입니다.
- DDNS (Dynamic DNS) — 집의 공인 IP가 바뀔 때마다 DNS 레코드를 자동으로 고쳐 주는 서비스입니다.
- 터널링 (tunneling) — 안에서 바깥 서비스로 먼저 맺은 연결을 통해 바깥의 요청을 안으로 전달받는 방법. NAT와 방화벽 뒤의 서버를 공개할 때 씁니다.
- 고정 IP (static IP) — 바뀌지 않는 공인 IP. 클라우드에서는 Elastic IP, Lightsail 고정 IP처럼 따로 붙입니다.
- Let's Encrypt — 도메인 소유를 자동으로 확인하고 무료 TLS 인증서를 내주는 인증 기관입니다.
- ACME (Automatic Certificate Management Environment) — 서버가 인증 기관과 대화하며 도메인 소유를 증명하고 인증서를 자동으로 받고 갱신하는 프로토콜입니다.
- Caddy — 설정한 도메인의 HTTPS 인증서를 자동으로 받고 갱신하는 웹 서버이자 리버스 프록시. 이 사이트의 앞단입니다.
- TLS 종료 (TLS termination) — 앞단의 프록시나 로드 밸런서가 HTTPS를 풀고 안쪽 서버에는 평범한 HTTP로 넘기는 것입니다.
- 무차별 대입 공격 (brute-force attack) — 비밀번호나 키를 될 때까지 하나씩 넣어 보는 공격. 공개 서버의 SSH에 늘 들어옵니다.
:::

## 직접 해보기

:::practice bind 127.0.0.1과 0.0.0.0 차이 체험하기
같은 서버를 두 바인드 주소로 띄우고, 내 컴퓨터와 같은 Wi-Fi의 휴대폰에서 각각 접속해 봅니다. 휴대폰에서는 `0.0.0.0`일 때만 열려야 합니다. 안 열리면 방화벽 허용 창이 떴는지, 네트워크 프로필이 무엇인지 확인합니다.

```sh 터미널
node -e "require('http').createServer((q,s)=>s.end('local only\n')).listen(3000,'127.0.0.1')" &
node -e "require('http').createServer((q,s)=>s.end('everyone\n')).listen(3001,'0.0.0.0')" &
lsof -iTCP -sTCP:LISTEN -n -P | grep -E ":300[01]"   # Windows는 Get-NetTCPConnection -LocalPort 3000,3001
# 휴대폰에서 http://내LANIP:3000 과 http://내LANIP:3001 을 열어 봅니다
kill %1 %2
```
:::

:::practice eaddrinuse 포트 충돌을 만들고 풀기
같은 포트로 서버를 두 번 띄워 `EADDRINUSE`를 보고, 그 포트를 쓰는 프로세스를 찾아 끝냅니다.

```sh macOS · Linux
node -e "require('http').createServer().listen(3000)" &
node -e "require('http').createServer().listen(3000)"   # Error: listen EADDRINUSE
lsof -i :3000
kill $(lsof -t -i :3000)
```

```powershell Windows (PowerShell)
Start-Process node -ArgumentList '-e', "require('http').createServer().listen(3000)"
node -e "require('http').createServer().listen(3000)"
$p = (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess; Get-Process -Id $p; Stop-Process -Id $p
```
:::

:::practice docker-bind 컨테이너 안의 127.0.0.1 함정
컨테이너 안에서 `127.0.0.1`로 듣는 서버와 `0.0.0.0`으로 듣는 서버를 각각 띄우고 포트를 이어 봅니다. 앞의 것은 바깥에서 접속이 안 됩니다.

```sh 터미널 (Docker)
docker run -d --name a -p 3100:3000 node:24-alpine node -e "require('http').createServer((q,s)=>s.end('a\n')).listen(3000,'127.0.0.1')"
docker run -d --name b -p 3200:3000 node:24-alpine node -e "require('http').createServer((q,s)=>s.end('b\n')).listen(3000,'0.0.0.0')"
curl localhost:3100    # 연결이 끊김
curl localhost:3200    # b
docker rm -f a b
```
:::

:::practice tunnel 터널로 내 서버를 잠깐 공개하기
로컬 서버를 띄우고 터널 도구로 공개 주소를 만든 뒤, 휴대폰의 데이터 통신(Wi-Fi를 끄고)으로 접속해 봅니다. 서버 로그에 찍히는 접속 주소가 무엇인지(터널 쪽 주소인지) 확인하고, 다 쓰면 반드시 끕니다.
:::

:::practice cloud-https 클라우드 서버에 HTTPS 사이트 열기
15장에서 만든 클라우드 서버(또는 새로 만든 서버)에 Caddy를 설치하고, sslip.io 이름으로 HTTPS 사이트를 엽니다. 클라우드 방화벽에서 80, 443을 열어야 인증서 발급이 됩니다. 브라우저 자물쇠를 눌러 발급자가 Let's Encrypt인지 확인하고, `/var/log/auth.log`에서 낯선 SSH 로그인 시도가 몇 개나 찍혔는지도 세어 봅니다.

```sh 서버 (Ubuntu)
sudo apt install -y caddy
IP=$(curl -s ifconfig.me); NAME="hello.${IP//./-}.sslip.io"
echo "$NAME {
  respond \"안녕하세요, $NAME\"
}" | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
echo "https://$NAME"
sudo grep -c "Invalid user" /var/log/auth.log
```
:::

## 스스로 점검

:::qa 휴대폰으로 `http://192.168.0.23:5173`에 접속이 안 됩니다. Vite 개발 서버는 떠 있습니다. 어떤 순서로 확인하나요?
먼저 Vite가 `localhost`에서만 듣는지 봅니다(`--host`가 필요). 다음으로 운영체제 방화벽이 막는지(Windows의 네트워크 프로필, macOS 방화벽), 마지막으로 둘이 같은 네트워크에 있는지와 게스트 Wi-Fi의 기기 간 통신 차단을 확인합니다.
:::

:::qa Docker로 띄운 앱에 `-p 3000:3000`을 줬는데 브라우저에서 연결이 끊깁니다. 컨테이너 안에서는 `curl localhost:3000`이 됩니다. 원인은?
앱이 컨테이너 안의 `127.0.0.1`에서만 듣고 있어서, 포트 매핑으로 컨테이너의 가상 네트워크 장치로 들어온 연결을 받지 못하는 것입니다. 앱이 `0.0.0.0`에서 듣도록 바꿉니다.
:::

:::qa 터널 서비스(ngrok 등)가 공유기 설정 없이도 NAT 뒤의 내 서버를 공개할 수 있는 이유는?
내 컴퓨터가 터널 서비스로 먼저 나가는 연결을 맺어 두기 때문입니다. 안에서 시작된 연결이라 NAT 표에 줄이 생기고 방화벽도 답을 들여보내니, 터널 서비스가 받은 요청을 그 연결을 거꾸로 타고 내 서버로 전달할 수 있습니다.
:::

:::qa Let's Encrypt의 HTTP-01 방식으로 인증서를 받으려면 왜 80번 포트가 인터넷에 열려 있어야 하나요? 와일드카드 인증서는 어떻게 받나요?
Let's Encrypt가 인터넷에서 `http://도메인/.well-known/acme-challenge/토큰`으로 직접 접속해, 그 도메인을 가리키는 서버를 내가 제어한다는 걸 확인하기 때문입니다. 와일드카드 인증서는 DNS-01 방식으로 그 도메인의 DNS에 TXT 레코드를 넣어 증명합니다.
:::

:::qa 클라우드 서버에 웹 서버를 띄우고 `curl http://서버IP`를 했더니 시간 초과가 납니다. 서버 안에서는 됩니다. 어디를 의심하나요?
응답이 아예 없는 시간 초과는 패킷이 버려진다는 뜻이니 클라우드 방화벽(보안 그룹)과 서버 안의 방화벽(ufw)이 80번을 막는지 봅니다. 연결 거부였다면 서버가 `127.0.0.1`에서만 듣는 경우를 먼저 의심합니다.
:::

## 더 읽을거리

- [Let's Encrypt: Challenge Types](https://letsencrypt.org/docs/challenge-types/) — HTTP-01, DNS-01, TLS-ALPN-01의 차이와 언제 무엇을 쓰는지.
- [Caddy: Automatic HTTPS](https://caddyserver.com/docs/automatic-https) — Caddy가 인증서를 언제, 어떻게 받고 갱신하는지 설명합니다.
- [DigitalOcean: UFW Essentials](https://www.digitalocean.com/community/tutorials/ufw-essentials-common-firewall-rules-and-commands) — Ubuntu 방화벽 규칙을 자주 쓰는 순서대로 정리한 글입니다.
- [Microsoft: Windows Defender 방화벽 개요](https://learn.microsoft.com/ko-kr/windows/security/operating-system-security/network-security/windows-firewall/) — 네트워크 프로필과 규칙의 동작 방식.
- [mkcert](https://github.com/FiloSottile/mkcert) — 로컬 개발용 HTTPS 인증서를 명령 하나로 만들어 주는 도구입니다.
