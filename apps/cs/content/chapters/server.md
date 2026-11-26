---
title: 서버란 무엇인가
summary: 서버는 특별한 컴퓨터가 아니라 요청을 기다리는 프로그램이라는 데서 시작합니다. 서버 운영체제로 Linux가 쓰이는 이유, 늘 떠 있는 프로그램을 관리하는 데몬과 서비스(systemd, launchd, Windows 서비스), 멀리 있는 서버에 들어가는 SSH, 가상 머신과 컨테이너, 클라우드(IaaS, PaaS, 서버리스)를 보고, 이 사이트가 실제로 어떤 서버에서 도는지 확인합니다.
---

14장은 3부를 마치며 물었습니다. Caddy는 왜 앞에 서 있을까요? 서버 컴퓨터는 어디에 있고, 무엇이 그 컴퓨터를 서버로 만들까요? 9장 그림에서 "서버 54.116.117.190"이라는 상자 하나로 그렸던 곳을 열어 보면 이렇습니다.

![이 페이지를 내보내는 서버의 안. 데이터센터의 물리 서버 위에 가상 머신이 있고, 그 안에서 Docker가 Caddy와 이 책의 nginx 같은 컨테이너들을 돌립니다. 바깥에서 들어올 수 있는 문은 SSH와 HTTPS뿐입니다](server-scene.svg)

이 장은 이 그림을 바깥에서 안으로 풉니다. 서버라는 말의 뜻, 서버 운영체제, 늘 떠 있는 프로그램(데몬), 서버에 들어가는 문(SSH), 컴퓨터 한 대를 나누는 방법(가상 머신과 컨테이너), 그리고 그 컴퓨터를 빌려 쓰는 방식(클라우드)을 차례로 봅니다. 앞에서 배운 프로세스, 포트, 소켓, 방화벽, DNS가 모두 여기서 한자리에 모입니다.

## 서버는 기다리는 프로그램입니다

[[서버]]는 정해진 포트에서 요청을 기다리다가, 요청이 오면 처리해서 답을 돌려주는 프로그램입니다. 요청을 보내는 쪽은 [[클라이언트]]입니다. 이 둘로 역할을 나누는 구조를 [[클라이언트-서버 모델]]이라고 합니다.

여기서 중요한 건 서버가 "컴퓨터의 종류"가 아니라 "프로그램의 역할"이라는 점입니다.

- `npm run dev`를 치면 내 노트북에서 서버가 하나 뜹니다. 같은 노트북의 브라우저가 클라이언트입니다.
- 같은 프로그램이 동시에 서버이자 클라이언트일 수 있습니다. 블로그 서버는 브라우저에게는 서버지만, 글을 가져오려고 API 서버에 요청할 때는 클라이언트입니다.
- "서버 컴퓨터"는 서버 프로그램을 돌리는 것이 주된 일인 컴퓨터를 부르는 말일 뿐입니다. 하드웨어는 2장에서 본 것처럼 PC와 크게 다르지 않습니다.

![블로그 서버는 브라우저에게는 서버이고, 글을 가져오려고 API에 요청할 때는 클라이언트입니다. 역할은 연결 하나마다 정해집니다](server-roles.svg)

모든 참여자가 서버이자 클라이언트인 구조도 있습니다. 토렌트나 화상 통화의 직접 연결처럼 서로 대등하게 주고받는 [[P2P]] 구조입니다.

서버가 하는 일은 결국 12장의 소켓 순서 그대로입니다. 포트에 `bind`하고, `listen`하고, 연결이 오면 `accept`하고, 요청을 읽고, 답을 쓰고, 다음 요청을 기다립니다. 웹 서버, API 서버, 데이터베이스, 메일 서버, DNS 서버, SSH 서버, 게임 서버는 모두 이 틀 위에서 무엇을 주고받느냐만 다릅니다.

| 서버 | 보통 듣는 포트 | 대표 프로그램 |
| --- | --- | --- |
| 웹 서버 | 80, 443 | nginx, Caddy, Apache |
| 앱(API) 서버 | 3000, 4000, 8080 등 | Node, Spring, Django, Rails |
| 데이터베이스 | 5432, 3306, 27017 | PostgreSQL, MySQL, MongoDB |
| 캐시 | 6379 | Redis |
| SSH | 22 | OpenSSH (`sshd`) |
| DNS | 53 | BIND, CoreDNS |
| 메일 | 25, 587, 993 | Postfix, Dovecot |

:::quiz roles 블로그 서버가 글 목록을 가져오려고 API 서버에 요청을 보냅니다. 이 연결에서 블로그 서버의 역할은?
- [ ] 서버
- [x] 클라이언트
- [ ] 둘 다 아님 (P2P)
- [ ] 서버 컴퓨터이므로 늘 서버

이 연결에서는 클라이언트입니다. 서버와 클라이언트는 컴퓨터의 종류가 아니라 연결마다 정해지는 역할입니다. 같은 블로그 서버가 브라우저와의 연결에서는 서버입니다.
:::

## 서버 컴퓨터는 어디에 있나

서버 프로그램은 어디서든 돌 수 있지만, 많은 사람이 늘 접속하려면 컴퓨터가 늘 켜져 있고, 인터넷에 잘 붙어 있고, 전기가 나가도 버텨야 합니다.

- **집**: 남는 노트북이나 라즈베리 파이로 개인 서버를 돌립니다. 싸지만 공인 IP, NAT, 정전 문제가 있습니다(11장, 16장).
- **회사 서버실**: 사무실 한쪽의 냉방된 방에 서버를 둡니다.
- **코로케이션**: 내 서버를 데이터센터의 선반에 넣고 전기와 회선만 빌립니다.
- **데이터센터와 클라우드**: 서버 수만 대를 갖춘 회사의 컴퓨터를 시간 단위로 빌려 씁니다. 요즘 대부분이 이 방식입니다.

데이터센터의 서버는 높이 4.45cm(1U)의 납작한 상자로, 큰 선반(랙)에 수십 대씩 꽂혀 있습니다. 2장에서 본 것처럼 ECC 메모리, 두 개의 전원 장치, 원격 관리 장치(BMC)를 갖추고, 모니터와 키보드 없이([[헤드리스]]) 원격으로만 관리합니다.

## 서버 운영체제: 왜 대부분 Linux인가

인터넷의 서버 대부분은 Linux로 돕니다. 클라우드의 가상 서버는 Linux가 압도적이고, 컨테이너 안은 거의 전부 Linux입니다.

| | Linux | Windows Server | macOS |
| --- | --- | --- | --- |
| 서버로 쓰는 비율 | 압도적 | .NET, Active Directory, 회사 내부 시스템 | 거의 없음 |
| 비용 | 무료 | 라이선스 비용 | Apple 하드웨어가 필요 |
| 원격 관리 | SSH와 셸로 거의 모든 것 | 원격 데스크톱, PowerShell | SSH 가능하지만 서버용 제품이 없음 (macOS Server는 2022년 종료) |
| 컨테이너 | 커널 기능으로 직접 지원 | Windows 컨테이너가 있지만 드묾 | Linux 가상 머신을 돌려야 함 |
| 서버 하드웨어 | 어디든 | 어디든 | Mac mini, Mac Pro뿐 |

Linux가 서버를 차지한 이유는 무료이고 소스가 열려 있어 마음대로 고칠 수 있고, 화면 없이 셸만으로 모든 걸 할 수 있고, 적은 메모리로도 돌고, 아래에서 볼 컨테이너가 Linux 커널 기능으로 만들어졌기 때문입니다.

서버용 [[Linux 배포판]]은 보통 [[LTS]](장기 지원) 버전을 씁니다. 몇 년 동안 보안 업데이트만 해 주고 큰 변화는 없는 버전입니다. 서버는 새 기능보다 오래 안정적으로 도는 것이 중요하니까요.

| 배포판 | 특징 |
| --- | --- |
| Ubuntu LTS | 가장 흔함. 2년마다 LTS, 5년 이상 지원. 이 사이트의 Lightsail 서버도 Ubuntu 24.04 |
| Debian | Ubuntu의 바탕. 아주 보수적이고 안정적 |
| RHEL, Rocky, AlmaLinux | 회사에서 많이 씀. RHEL은 유료 지원 |
| Amazon Linux | AWS에 맞춘 배포판 |
| Alpine | 아주 작음(수 MB). Docker 이미지의 바탕으로 많이 씀 |

## 데몬과 서비스: 늘 떠 있는 프로그램

터미널에서 `node server.js`를 실행하면 터미널을 닫는 순간 서버도 꺼집니다. 서버는 로그인한 사람이 없어도, 재부팅한 뒤에도, 죽은 뒤에도 다시 떠 있어야 합니다. 이렇게 터미널과 상관없이 백그라운드에서 늘 도는 프로그램을 유닉스 계열에서는 [[데몬]]이라고 부릅니다. 이름 끝에 d가 붙는 게 관례입니다. `sshd`, `dockerd`, `systemd`, `httpd`.

![터미널에서 띄운 프로그램은 터미널과 함께 끝나고 아무도 다시 띄우지 않습니다. 서비스로 등록하면 systemd가 띄우고, 죽으면 다시 띄우고, 표준 출력을 저널에 모읍니다](server-daemon.svg)

데몬을 띄우고 지켜보는 건 3장에서 본 첫 프로세스, 즉 init 시스템의 일입니다.

| | Linux (systemd) | macOS (launchd) | Windows |
| --- | --- | --- | --- |
| 이름 | 서비스, 유닛 | 데몬(시스템 전체), 에이전트(사용자별) | [[Windows 서비스]] |
| 정의하는 곳 | `/etc/systemd/system/이름.service` | `/Library/LaunchDaemons/이름.plist` | 서비스 관리자에 등록 |
| 시작, 멈춤 | `systemctl start`, `stop` | `launchctl bootstrap`, `bootout` | `Start-Service`, `services.msc` |
| 부팅 때 자동 시작 | `systemctl enable` | `RunAtLoad` 키 | 시작 유형: 자동 |
| 죽으면 다시 띄우기 | `Restart=always` | `KeepAlive` 키 | 복구 탭의 "서비스 다시 시작" |
| 로그 | `journalctl -u 이름` | `log show`, 지정한 파일 | 이벤트 뷰어 |

Linux 서버에 Node 앱을 서비스로 등록하는 [[systemd 유닛]] 파일은 이렇게 생겼습니다.

```ini /etc/systemd/system/myapp.service
[Unit]
Description=My Node app
After=network-online.target          # 네트워크가 올라온 뒤에 시작

[Service]
User=myapp                           # root가 아닌 전용 사용자로 (4장)
WorkingDirectory=/srv/myapp          # 현재 작업 디렉터리 (8장)
Environment=NODE_ENV=production PORT=3000
ExecStart=/usr/bin/node server.js
Restart=always                       # 죽으면 다시 띄움
RestartSec=2

[Install]
WantedBy=multi-user.target           # 부팅 때 이 단계에서 시작
```

```sh
sudo systemctl daemon-reload         # 새 유닛 파일 읽기
sudo systemctl enable --now myapp    # 부팅 때 자동 시작 + 지금 시작
systemctl status myapp               # 떠 있는지, 최근 로그
journalctl -u myapp -f               # 로그를 계속 보기
sudo systemctl restart myapp         # 배포 뒤 다시 시작 (SIGTERM → 새로 띄움)
```

`console.log`로 찍은 내용은 표준 출력(8장)으로 나가고, systemd가 그걸 모아 저널에 저장합니다. 그래서 서버 앱은 로그 파일을 직접 관리하지 않고 표준 출력에 쓰기만 하는 게 요즘 관례입니다. Docker도 똑같이 컨테이너의 표준 출력을 모아 `docker logs`로 보여 줍니다. 로그가 디스크를 가득 채우지 않게 오래된 로그를 잘라 지우는 일(로그 로테이션)도 이들이 해 줍니다.

Node 생태계에는 pm2 같은 프로세스 관리자도 있지만, 운영체제의 init 시스템이나 Docker가 같은 일을 하니 요즘은 그쪽을 많이 씁니다.

:::quiz logout SSH로 서버에 들어가 `node server.js &`로 서버를 띄우고 로그아웃했더니 서버가 꺼졌습니다. 가장 알맞은 해결은?
- [ ] 노트북에서 SSH 창을 계속 열어 둔다
- [ ] 크론으로 1분마다 `node server.js`를 실행한다
- [ ] 포트를 1024보다 큰 번호로 바꾼다
- [x] systemd 서비스로 등록하고 `Restart=always`를 둔다

서비스로 등록합니다. 셸에서 띄운 프로그램은 그 셸의 자식이라 로그아웃할 때 함께 끝날 수 있고, 죽어도 아무도 다시 띄우지 않습니다. systemd는 부팅 때 띄우고, 죽으면 다시 띄우고, 로그를 저널에 모읍니다.
:::

## SSH: 멀리 있는 서버에 들어가기

데이터센터의 서버 앞에 앉을 일은 없습니다. 대신 [[SSH]](Secure Shell)로 내 터미널에서 서버의 셸을 씁니다. SSH는 22번 포트를 쓰는 암호화된 원격 접속 프로토콜입니다. 14장의 TLS처럼 키 교환으로 통로를 암호화하고, 서버와 사용자를 각각 확인합니다.

**서버 확인**: 처음 접속하면 이런 질문이 나옵니다.

```text
The authenticity of host '54.116.117.190' can't be established.
ED25519 key fingerprint is SHA256:Xk3…
Are you sure you want to continue connecting (yes/no)?
```

서버의 공개키 지문을 보여 주며 "이 서버가 맞느냐"고 묻는 것입니다. `yes`라고 하면 그 지문을 [[known_hosts]] 파일(`~/.ssh/known_hosts`)에 적어 두고, 다음부터는 조용히 비교만 합니다. 나중에 지문이 달라지면 `REMOTE HOST IDENTIFICATION HAS CHANGED!` 경고와 함께 접속을 막습니다. 서버를 다시 만들었거나, 누군가 중간에서 서버인 척하고 있다는 뜻입니다.

**사용자 확인**: 비밀번호보다 [[공개키 인증]]을 씁니다.

1. 내 컴퓨터에서 키 짝을 만듭니다: `ssh-keygen -t ed25519`. 개인키 `~/.ssh/id_ed25519`는 나만 갖고(권한 600, 8장), 공개키 `id_ed25519.pub`은 서버에 줍니다.
2. 서버의 [[authorized_keys]] 파일(`~/.ssh/authorized_keys`)에 내 공개키를 한 줄 추가합니다.
3. 접속할 때 서버가 무작위 값을 주면 내 컴퓨터가 개인키로 서명하고, 서버가 공개키로 확인합니다(14장의 디지털 서명). 개인키는 네트워크로 나가지 않습니다.

![SSH 접속은 두 번 확인합니다. 먼저 내 컴퓨터가 서버의 공개키 지문을 known_hosts와 비교하고, 암호화된 통로가 생긴 뒤 서버가 내 서명을 authorized_keys의 공개키로 확인합니다](server-ssh-auth.svg)

비밀번호는 추측당할 수 있고 서버 쪽에 저장되지만, 개인키는 추측이 사실상 불가능합니다. 그래서 서버는 비밀번호 로그인을 아예 끄는 게 기본입니다. 클라우드에서 서버를 만들 때 받는 `.pem` 파일이 이 개인키입니다.

`authorized_keys`의 한 줄에는 그 키로 할 수 있는 일을 제한하는 옵션도 붙일 수 있습니다. 이 사이트의 배포가 그렇게 합니다. GitHub Actions가 쓰는 배포 전용 키는 `authorized_keys`에 `command="/srv/archiev/deploy.sh"`로 묶여 있어서, 그 키로 접속하면 셸을 얻지 못하고 배포 스크립트만 실행됩니다. 키가 새어도 피해가 배포 하나로 한정됩니다.

SSH로 할 수 있는 일들입니다.

| 하는 일 | 명령 |
| --- | --- |
| 접속 | `ssh -i key.pem ubuntu@54.116.117.190` |
| 명령 하나만 실행 | `ssh 서버 'docker ps'` |
| 파일 보내기, 받기 | `scp 파일 서버:/tmp/`, `rsync -av dist/ 서버:/srv/site/` |
| 서버 안쪽 포트를 내 컴퓨터로 가져오기 | `ssh -L 5432:localhost:5432 서버` → 내 `localhost:5432`가 서버의 DB로 연결 |
| 접속 정보 저장 | `~/.ssh/config`에 `Host myserver`, `HostName`, `User`, `IdentityFile` |

`-L` 옵션은 [[SSH 포트 포워딩]]입니다. 데이터베이스처럼 인터넷에 절대 열면 안 되는 포트도, SSH 통로를 거쳐 내 컴퓨터에서만 안전하게 쓸 수 있습니다.

![`ssh -L`을 켜면 내 컴퓨터의 5432번으로 들어온 연결이 SSH 통로를 지나 서버 안에서 `localhost:5432`로 이어집니다. 서버 방화벽은 22번만 열어 두면 됩니다](server-port-forward.svg)

| | Windows | macOS | Linux |
| --- | --- | --- | --- |
| SSH 클라이언트 | Windows 10부터 OpenSSH 기본 포함 (`ssh`). 예전에는 PuTTY | 기본 포함 | 기본 포함 |
| 키 위치 | `C:\Users\me\.ssh\` | `~/.ssh/` | `~/.ssh/` |
| 키 권한 문제 | 파일 속성 → 보안에서 나만 읽게 | `chmod 600` | `chmod 600` |

:::quiz host-changed 서버를 지우고 같은 IP로 새로 만든 뒤 접속했더니 `REMOTE HOST IDENTIFICATION HAS CHANGED!`가 뜹니다. 이유는?
- [x] 새 서버의 공개키가 `known_hosts`에 적힌 지문과 달라서
- [ ] 내 개인키의 기간이 끝나서
- [ ] 서버의 `authorized_keys`가 지워져서
- [ ] 22번 포트가 방화벽에 막혀서

새 서버는 새 호스트 키를 만들었으니 지문이 다릅니다. SSH는 이걸 중간자 공격과 구별할 수 없어서 막습니다. 직접 다시 만든 게 확실하면 `ssh-keygen -R 54.116.117.190`으로 옛 지문을 지우고 다시 접속합니다.
:::

:::quiz what-leaves 공개키 인증으로 SSH 접속할 때 내 컴퓨터에서 네트워크로 나가는 것은?
- [ ] 개인키 파일
- [ ] 서버 비밀번호
- [x] 서버가 준 무작위 값에 개인키로 만든 서명
- [ ] 내 `known_hosts` 파일

서명만 나갑니다. 서버는 `authorized_keys`의 공개키로 그 서명을 확인합니다. 개인키는 내 컴퓨터를 떠나지 않으니, 통로를 엿봐도 키를 얻을 수 없습니다.
:::

:::quiz tunnel `ssh -L 8080:localhost:3000 서버`를 켜 두고 내 브라우저에서 `localhost:8080`을 열면, 실제로 답하는 것은?
- [ ] 내 컴퓨터에서 3000번을 듣는 프로그램
- [x] 서버에서 3000번을 듣는 프로그램
- [ ] 서버에서 8080번을 듣는 프로그램
- [ ] 내 컴퓨터에서 8080번을 듣는 다른 프로그램

서버의 3000번입니다. `-L 내포트:목적지:목적지포트`에서 목적지의 `localhost`는 서버 쪽에서 본 localhost입니다. 내 8080번으로 들어온 연결이 SSH 통로를 지나 서버 안에서 `localhost:3000`으로 이어집니다.
:::

## 가상화: 컴퓨터 한 대를 여러 대처럼

데이터센터의 서버 한 대는 CPU 코어가 수십~수백 개, 메모리가 수백 GB입니다. 이걸 한 사람이 다 쓰는 일은 드뭅니다. 그래서 한 대를 여러 대의 독립된 컴퓨터처럼 나눠 씁니다. 이걸 가상화라고 하고, 나뉜 컴퓨터 하나를 [[가상 머신]](VM)이라고 합니다.

가상 머신을 만들고 관리하는 소프트웨어가 [[하이퍼바이저]]입니다. 하이퍼바이저는 각 VM에게 가짜 CPU, 가짜 메모리, 가짜 디스크, 가짜 네트워크 카드를 보여 주고, 실제 하드웨어를 나눠 줍니다. 각 VM 안에서는 자기만의 운영체제와 커널이 부팅부터 따로 돕니다(3장의 클라우드 서버 부팅).

| 종류 | 어디서 도나 | 예 |
| --- | --- | --- |
| 1형 (베어메탈) | 하드웨어 바로 위 | KVM (Linux 커널 안), Xen, Hyper-V, VMware ESXi. 클라우드가 씀 |
| 2형 (호스트형) | 일반 운영체제 위의 프로그램 | VirtualBox, VMware Workstation, Parallels, UTM |

요즘 CPU에는 가상화를 돕는 기능(Intel VT-x, AMD-V, ARM의 가상화 확장)이 있어서 VM 안의 프로그램도 거의 제 속도로 돕니다. 7장의 페이지 테이블도 하드웨어가 두 단계(VM 안의 가상 주소 → VM의 "물리" 주소 → 진짜 물리 주소)로 번역해 줍니다.

## 컨테이너: 커널은 나눠 쓰고 나머지만 따로

VM은 운영체제를 통째로 하나 더 돌리니 무겁습니다. 부팅에 수십 초가 걸리고 메모리도 GB 단위로 씁니다. 그런데 대부분은 "내 앱과 그 앱이 쓰는 라이브러리만 다른 것과 섞이지 않게 따로 두고 싶은" 것뿐입니다. 이걸 가볍게 해 주는 게 [[컨테이너]]입니다.

컨테이너는 가상 머신이 아니라, Linux 커널의 기능으로 격리한 **평범한 프로세스**입니다.

- **[[네임스페이스]]**: 프로세스가 보는 세상을 나눕니다. PID 네임스페이스 안에서는 내 앱이 PID 1이고 다른 프로세스가 안 보입니다(6장). 네트워크 네임스페이스 안에서는 자기만의 IP와 포트가 있습니다(10장의 가상 네트워크). 마운트 네임스페이스 안에서는 자기만의 파일 시스템 루트가 있습니다.
- **[[cgroups]]**: 프로세스 묶음이 쓸 수 있는 CPU, 메모리, 디스크 입출력을 제한합니다. 이 사이트의 `docker-compose.yml`에 있는 `mem_limit: 48m`이 cgroups 설정이고, 넘으면 7장의 OOM 킬러가 동작합니다.
- **층을 쌓은 파일 시스템**: 컨테이너의 파일들은 읽기 전용 층들을 겹쳐 쌓고 그 위에 쓰기 층 하나를 얹어 만듭니다. 같은 바탕 층(예: `node:24-slim`)을 쓰는 컨테이너들은 그 층을 디스크에 한 벌만 둡니다.

| | 가상 머신 | 컨테이너 |
| --- | --- | --- |
| 격리하는 것 | 하드웨어를 흉내 내고 운영체제를 통째로 | 커널은 함께 쓰고 프로세스가 보는 세상만 |
| 안의 커널 | VM마다 따로 | 호스트의 커널 하나 |
| 시작 시간 | 수십 초 | 1초 미만 |
| 크기 | GB | MB |
| 격리 강도 | 강함 | VM보다 약함 (커널을 공유하니까) |

![가상 머신은 커널까지 통째로 따로 두고, 컨테이너는 호스트의 커널 하나를 함께 쓰며 앱과 라이브러리만 따로 둡니다](server-vm-container.svg)

컨테이너를 만드는 설계도가 [[컨테이너 이미지]]이고, 이미지를 만드는 레시피가 `Dockerfile`입니다. 이미지는 [[레지스트리]](Docker Hub, GitHub Container Registry)에 올려 두고 어느 서버에서든 받아 실행합니다. 이 사이트의 `apps/cs/Dockerfile`은 "Node로 HTML을 만들고, 결과만 nginx 이미지에 복사하라"는 레시피이고, GitHub Actions가 이걸로 이미지를 만들어 `ghcr.io`에 올립니다. [[Docker]]는 이 모든 것(이미지 만들기, 받기, 컨테이너 실행)을 쉽게 해 주는 도구입니다.

컨테이너가 Linux 커널 기능이라는 사실에서 중요한 운영체제 차이가 나옵니다.

| | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Linux 컨테이너를 돌리는 방법 | Docker Desktop이 WSL2의 Linux VM 안에서 돌림 | Docker Desktop, OrbStack, Colima가 숨은 Linux VM 안에서 돌림 | 커널에서 바로. VM 없음 |
| 파일 공유 속도 | VM 경계를 넘어 느릴 수 있음 | 느릴 수 있음 (그래서 파일 감시가 잘 안 되기도, 8장) | 빠름 |
| 컨테이너의 CPU 종류 | 대개 x86-64 | Apple Silicon이면 ARM64 (2장) | 서버와 같음 |

Mac에서 `docker run`을 하면 사실 보이지 않는 Linux 가상 머신이 하나 떠 있고, 컨테이너는 그 안에서 돕니다. Docker Desktop이 메모리를 많이 먹는 이유입니다.

:::quiz uname Apple Silicon Mac에서 `docker run --rm alpine uname -s`를 실행하면 무엇이 찍힐까요?
= Linux

**Linux**입니다. `uname -s`는 커널의 이름을 알려 주는데, 컨테이너는 그 컨테이너를 돌리는 커널을 씁니다. Mac의 Docker는 보이지 않는 Linux 가상 머신 안에서 컨테이너를 돌리니 macOS의 `Darwin`이 아니라 `Linux`가 나옵니다.
:::

:::quiz mem-limit `mem_limit: 48m`인 컨테이너 안의 nginx가 메모리를 60MB까지 쓰려고 하면?
- [ ] 다른 컨테이너의 남는 메모리를 빌려 쓴다
- [ ] 서버 전체가 느려지다 멈춘다
- [x] cgroups 한도를 넘어 OOM 킬러가 그 프로세스를 끝내고, Docker가 컨테이너를 다시 띄운다
- [ ] 48MB를 넘는 부분은 디스크에 저장된다

cgroups가 그 컨테이너만 막습니다. 한도를 넘으면 커널의 OOM 킬러가 그 안의 프로세스를 끝내고(7장, 종료 코드 137), `restart: unless-stopped`이면 Docker가 다시 띄웁니다. 다른 컨테이너는 영향을 받지 않습니다.
:::

## 클라우드: 남의 데이터센터를 빌려 쓰기

[[클라우드]]는 데이터센터의 컴퓨터, 저장소, 네트워크를 인터넷으로 빌려 쓰고 쓴 만큼 돈을 내는 것입니다. 무엇까지 맡기느냐에 따라 나뉩니다.

| | 내가 관리하는 것 | 클라우드가 관리하는 것 | 예 |
| --- | --- | --- | --- |
| [[IaaS]] | 운영체제, 런타임, 앱, 보안 설정 | 하드웨어, 가상화, 네트워크 | AWS EC2, Lightsail, Google Compute Engine |
| [[PaaS]] | 앱 코드와 설정 | 운영체제, 런타임, 배포, 확장 | Vercel, Render, Fly.io, Heroku |
| [[서버리스]] (FaaS) | 함수 코드 | 서버가 있다는 사실 자체 | AWS Lambda, Cloudflare Workers, Vercel Functions |
| 관리형 서비스 | 데이터와 사용법 | 그 서비스 전부 | RDS(데이터베이스), S3(파일 저장) |

아래로 갈수록 편하지만 마음대로 할 수 있는 게 줄고, 많이 쓰면 비싸집니다. 서버리스는 요청이 올 때만 함수를 띄우고, 요청이 없으면 돈도 안 냅니다. 대신 한동안 안 쓰다가 첫 요청이 오면 띄우는 데 시간이 걸리고(콜드 스타트), 오래 걸리는 작업이나 계속 연결을 유지하는 일(WebSocket)에는 맞지 않습니다.

클라우드는 세계 여러 곳에 데이터센터 묶음을 둡니다. 지역 단위를 [[리전]](예: 서울 `ap-northeast-2`)이라고 하고, 한 리전 안에 전기와 네트워크가 독립된 데이터센터 무리인 가용 영역이 여러 개 있습니다. 한 가용 영역이 정전돼도 다른 곳의 서버가 버티도록 나눠 둡니다.

:::quiz websocket WebSocket 연결을 수천 개 계속 붙들고 있어야 하는 채팅 서버를 올리기에 가장 맞지 않는 것은?
- [x] 요청이 올 때만 잠깐 뜨는 서버리스 함수
- [ ] 클라우드의 가상 머신(IaaS)
- [ ] 가상 머신 위의 컨테이너
- [ ] 계속 떠 있는 앱을 돌려 주는 PaaS

서버리스 함수입니다. 요청 하나를 처리하고 끝나는 짧은 실행에 맞춰져 있어서, 연결을 오래 유지하는 일과 맞지 않습니다. 나머지는 프로세스가 계속 떠 있으니 연결을 붙들 수 있습니다.
:::

## 다시 장면으로: 54.116.117.190 안에서

맨 앞 그림은 이제 이렇게 읽힙니다. 이 서버는 AWS 데이터센터의 물리 서버 위에서 하이퍼바이저가 나눠 준 가상 머신 하나입니다(IaaS). 그 안의 Ubuntu가 부팅하면 systemd가 sshd와 dockerd를 띄우고, dockerd는 `restart: unless-stopped`가 붙은 컨테이너들을 다시 띄웁니다. 컨테이너들은 커널 하나를 함께 쓰지만 네임스페이스로 서로 보이지 않고, cgroups의 `mem_limit`으로 메모리를 나눠 씁니다. 바깥에 열린 문은 SSH의 22번과 Caddy의 80, 443번뿐이고, 이 책을 내보내는 nginx는 Docker 네트워크 안에만 있습니다.

이 서버는 처음부터 공인 IP가 있는 남의 데이터센터 컴퓨터라서, 방화벽에서 포트만 열면 누구나 들어올 수 있었습니다. 그런데 내 노트북에서 `npm run dev`로 띄운 서버는 왜 옆자리 휴대폰에서도 열리지 않을까요? 서버를 "연다"는 것은 정확히 무엇을 여는 걸까요? 16장의 이야기입니다.

## 프론트엔드와 이어지는 곳

- Next.js를 `output: "export"`로 정적 HTML로 뽑으면 nginx 같은 정적 파일 서버나 CDN만 있으면 되고, 서버 렌더링을 쓰면 요청마다 HTML을 만드는 Node 서버가 계속 떠 있어야 합니다. 어느 쪽이냐에 따라 필요한 서버가 완전히 다릅니다.
- Vercel과 Netlify는 PaaS와 서버리스를 합친 것입니다. 정적 파일은 CDN에서, 서버 코드는 서버리스 함수로 돕니다.
- "내 컴퓨터에서는 되는데 서버에서 안 된다"의 많은 경우는 운영체제, Node 버전, 환경 변수, 파일 경로 대소문자, CPU 종류 차이입니다. Docker 이미지로 만들면 이 차이가 대부분 사라집니다.

## 용어 정리

:::terms
- 서버 (server) — 정해진 포트에서 요청을 기다리다가 처리해서 답을 돌려주는 프로그램. 그런 프로그램을 주로 돌리는 컴퓨터를 부르기도 합니다.
- 클라이언트 (client) — 서버에 요청을 보내고 답을 받는 쪽 프로그램입니다.
- 클라이언트-서버 모델 (client-server model) — 요청하는 클라이언트와 응답하는 서버로 역할을 나눈 구조입니다.
- P2P (peer-to-peer) — 참여자들이 서버 없이 서로 대등하게 직접 데이터를 주고받는 구조입니다.
- 헤드리스 (headless) — 모니터, 키보드, 그래픽 화면 없이 원격으로만 쓰는 방식입니다.
- LTS (Long-Term Support) — 새 기능 없이 몇 년 동안 보안과 버그 수정만 해 주는 버전. 서버는 보통 LTS를 씁니다.
- 데몬 (daemon) — 터미널과 상관없이 백그라운드에서 늘 도는 프로그램. `sshd`, `dockerd`처럼 이름 끝에 d를 붙이곤 합니다.
- systemd 유닛 (systemd unit) — systemd가 관리할 서비스의 실행 방법, 재시작 규칙, 시작 순서를 적은 설정 파일입니다.
- Windows 서비스 (Windows service) — Windows에서 로그인과 상관없이 백그라운드에서 도는 프로그램. 서비스 관리자가 시작과 재시작을 맡습니다.
- SSH (Secure Shell) — 암호화된 통로로 원격 컴퓨터의 셸에 접속하고 파일을 옮기는 프로토콜. 기본 포트는 22입니다.
- 공개키 인증 (public key authentication) — 서버에 공개키를 등록해 두고, 접속할 때 개인키로 서명해 본인임을 증명하는 방식입니다.
- authorized_keys — 서버에서 이 사용자로 로그인할 수 있는 공개키 목록 파일. 키마다 실행할 수 있는 명령을 제한할 수도 있습니다.
- known_hosts — 내 컴퓨터가 접속했던 서버들의 공개키 지문을 적어 두는 파일. 지문이 바뀌면 SSH가 경고합니다.
- SSH 포트 포워딩 (SSH port forwarding) — SSH 연결을 통로 삼아 원격 서버의 포트를 내 컴퓨터 포트로(또는 그 반대로) 잇는 기능입니다.
- 가상 머신 (virtual machine) — 하이퍼바이저가 흉내 낸 하드웨어 위에서 자기만의 운영체제와 커널을 돌리는 가상의 컴퓨터입니다.
- 하이퍼바이저 (hypervisor) — 실제 하드웨어를 나눠 여러 가상 머신을 만들고 돌리는 소프트웨어. KVM, Hyper-V, VirtualBox 등.
- 컨테이너 (container) — 커널을 함께 쓰되 네임스페이스와 cgroups로 격리하고 자원을 제한한 프로세스. 앱과 라이브러리를 함께 묶어 어디서나 같게 돌립니다.
- 네임스페이스 (namespace) — 프로세스가 보는 PID, 네트워크, 파일 시스템 등을 나눠 격리하는 Linux 커널 기능입니다.
- cgroups (control groups) — 프로세스 묶음이 쓸 CPU, 메모리, 입출력을 제한하고 재는 Linux 커널 기능입니다.
- 컨테이너 이미지 (container image) — 컨테이너를 만드는 읽기 전용 설계도. 파일 시스템 층들과 실행 설정으로 되어 있습니다.
- 레지스트리 (registry) — 컨테이너 이미지를 올리고 내려받는 저장소. Docker Hub, GitHub Container Registry 등.
- Docker — 컨테이너 이미지를 만들고, 레지스트리와 주고받고, 컨테이너를 실행하는 도구입니다.
- 클라우드 (cloud) — 데이터센터의 컴퓨팅, 저장소, 네트워크를 인터넷으로 빌려 쓰고 쓴 만큼 내는 것입니다.
- IaaS (Infrastructure as a Service) — 가상 머신과 네트워크를 빌려주는 클라우드. 운영체제부터 위는 내가 관리합니다.
- PaaS (Platform as a Service) — 코드만 올리면 운영체제, 런타임, 배포, 확장을 맡아 주는 클라우드입니다.
- 서버리스 (serverless) — 서버를 관리하지 않고 요청이 올 때만 함수를 실행하고 그만큼만 돈을 내는 방식입니다.
- 리전 (region) — 클라우드가 데이터센터를 모아 둔 지역 단위. 서울, 도쿄처럼 나뉘고 안에 여러 가용 영역이 있습니다.
:::

## 직접 해보기

:::practice service 내 서버를 서비스로 등록하기
작은 Node 서버를 운영체제의 서비스 관리자에 등록해, 터미널을 닫아도 돌고 죽으면 다시 뜨는지 확인합니다. 프로세스를 `kill`로 죽인 뒤 몇 초 뒤에 새 PID로 다시 떠 있으면 성공입니다.

```sh Linux (systemd)
sudo tee /etc/systemd/system/hello.service <<'EOF'
[Service]
ExecStart=/usr/bin/node -e "require('http').createServer((q,s)=>s.end('hi '+process.pid+'\n')).listen(3000)"
Restart=always
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now hello
curl localhost:3000 && sudo kill $(systemctl show -p MainPID --value hello) && sleep 3 && curl localhost:3000
journalctl -u hello --no-pager | tail
sudo systemctl disable --now hello
```

```sh macOS (launchd)
cat > ~/Library/LaunchAgents/dev.hello.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>Label</key><string>dev.hello</string>
  <key>ProgramArguments</key><array><string>/usr/local/bin/node</string><string>-e</string>
    <string>require('http').createServer((q,s)=>s.end('hi '+process.pid+'\n')).listen(3000)</string></array>
  <key>KeepAlive</key><true/>
</dict></plist>
EOF
# node 경로는 which node 결과로 바꿉니다
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.hello.plist
curl localhost:3000 && pkill -f "listen(3000)" && sleep 3 && curl localhost:3000
launchctl bootout gui/$(id -u)/dev.hello
```
:::

:::practice ssh-key SSH 키 만들고 원리 확인하기
SSH 키 짝을 만들고, 공개키와 개인키 파일의 내용과 권한을 비교합니다. 서버가 없다면 GitHub 계정 설정의 SSH keys에 공개키를 등록하고 `ssh -T git@github.com`으로 공개키 인증을 해 봅니다. 처음 접속할 때 나오는 지문 확인 메시지와 `known_hosts`에 생긴 줄도 확인합니다.

```sh 터미널 (Windows PowerShell도 같음)
ssh-keygen -t ed25519 -f ~/.ssh/practice_key -C "practice"
cat ~/.ssh/practice_key.pub        # 이건 퍼뜨려도 되는 공개키
ls -l ~/.ssh/practice_key*         # 개인키는 나만 읽을 수 있어야 함
ssh -T git@github.com              # GitHub에 공개키를 등록한 뒤
tail -2 ~/.ssh/known_hosts
```
:::

:::practice container 컨테이너가 프로세스라는 것 확인하기
Docker로 컨테이너를 하나 띄우고, 안에서 보는 세상(PID 1, 자기만의 호스트 이름과 IP)과 바깥에서 보는 모습(평범한 프로세스)을 비교합니다. Linux에서는 호스트의 `ps`에 그 프로세스가 그대로 보이고, Mac과 Windows에서는 보이지 않는 이유(숨은 Linux VM 안에 있으니까)를 생각해 봅니다.

```sh 터미널 (Docker)
docker run -d --name box --memory 64m node:24-alpine node -e "setInterval(()=>{}, 1000)"
docker exec box ps                 # 안에서는 node가 PID 1
docker exec box hostname
docker exec box cat /sys/fs/cgroup/memory.max   # 67108864 = 64MB (cgroups)
docker inspect box --format '{{.State.Pid}} {{.NetworkSettings.IPAddress}}'
ps -p "$(docker inspect box --format '{{.State.Pid}}')"   # Linux에서만 보입니다
docker rm -f box
```
:::

:::practice cloud 클라우드 서버 한 대 만들어 보기
AWS Lightsail이나 다른 클라우드의 가장 작은 Linux 서버(무료 체험이나 한 달 몇 달러)를 만들고, 받은 키로 SSH 접속합니다. 접속해서 `uname -a`, `cat /etc/os-release`, `nproc`, `free -h`, `df -h`, `ip addr`, `ss -tlnp`를 쳐 보고, 이 서버가 몇 코어, 몇 GB이고 어떤 포트가 열려 있는지 적습니다. 다 끝나면 비용이 나가지 않게 꼭 지웁니다. 다음 장에서 이 서버에 웹 서버를 띄웁니다.
:::

## 장 전체 문제

:::quiz reboot 이 서버가 재부팅되었습니다. 이 페이지가 다시 열리기까지 프로그램이 뜨는 순서로 맞는 것은?
- [ ] dockerd → systemd → Caddy와 nginx 컨테이너
- [ ] Caddy 컨테이너 → dockerd → systemd
- [x] systemd → dockerd → Caddy와 nginx 컨테이너
- [ ] systemd → Caddy 컨테이너 → dockerd

systemd(PID 1)가 먼저 뜨고, 서비스로 등록된 dockerd를 띄웁니다. dockerd는 `restart: unless-stopped`가 붙은 컨테이너들을 다시 띄웁니다. 3장의 부팅이 서버에서는 이렇게 이어집니다.
:::

:::quiz open-ports 이 서버에서 인터넷 쪽에 열린 포트 번호를 작은 수부터 쉼표로 이어 적으면?
= 22, 80, 443

**22, 80, 443**입니다. 22번은 sshd, 80번과 443번은 Caddy입니다. 80번은 `https://`로 돌려보내고 인증서 발급 확인에 쓰입니다(16장). nginx, Node 같은 나머지 컨테이너는 Docker 네트워크 안에서만 보여서 바깥에서 직접 들어올 수 없습니다.
:::

## 스스로 점검

:::qa "서버는 특별한 컴퓨터가 아니라 프로그램의 역할"이라는 말을 `npm run dev`로 설명해 보세요.
`npm run dev`는 내 노트북에서 포트를 열고 요청을 기다리는 프로그램을 띄우니 그 순간 노트북의 그 프로세스가 서버이고, 같은 노트북의 브라우저가 클라이언트입니다. 서버 컴퓨터는 이런 프로그램을 주로, 늘 켜 두고 돌리는 컴퓨터일 뿐입니다.
:::

:::qa 터미널에서 `node server.js`로 띄운 서버와 systemd 서비스로 띄운 서버는 무엇이 다른가요?
터미널에서 띄우면 그 셸의 자식 프로세스라 터미널을 닫거나 로그아웃하면 끝나고, 죽어도 아무도 다시 띄우지 않습니다. systemd 서비스는 init 시스템이 직접 띄우고 지켜봐서 부팅 때 자동으로 뜨고, 죽으면 다시 뜨고, 로그도 저널에 모입니다.
:::

:::qa SSH 공개키 인증에서 개인키가 네트워크로 나가지 않는데도 서버가 나를 확인할 수 있는 이유는?
서버가 보낸 값을 내 컴퓨터가 개인키로 서명해 돌려보내고, 서버는 `authorized_keys`에 있는 내 공개키로 그 서명을 확인합니다. 디지털 서명은 개인키가 있어야 만들 수 있고 공개키로 누구나 확인할 수 있으니, 서명만 오가면 됩니다.
:::

:::qa 가상 머신과 컨테이너의 가장 큰 차이는? Mac에서 Linux 컨테이너를 돌리려면 무엇이 필요한가요?
가상 머신은 하드웨어를 흉내 내고 자기만의 커널로 운영체제를 통째로 돌리고, 컨테이너는 호스트의 커널을 함께 쓰면서 네임스페이스와 cgroups로 격리한 프로세스입니다. 컨테이너는 Linux 커널 기능이라 Mac에서는 Docker Desktop 같은 도구가 숨은 Linux 가상 머신을 띄우고 그 안에서 컨테이너를 돌립니다.
:::

:::qa IaaS, PaaS, 서버리스는 각각 무엇을 직접 관리해야 하나요? 이 사이트는 어느 쪽인가요?
IaaS는 가상 머신을 빌려 운영체제부터 앱까지 직접 관리하고, PaaS는 코드와 설정만 올리면 운영체제와 배포를 맡아 주고, 서버리스는 함수 코드만 두면 요청이 올 때 알아서 실행됩니다. 이 사이트는 Lightsail 가상 머신에 직접 Docker와 Caddy를 설치해 쓰니 IaaS입니다.
:::

## 더 읽을거리

- [DigitalOcean 튜토리얼: Initial Server Setup with Ubuntu](https://www.digitalocean.com/community/tutorials/initial-server-setup-with-ubuntu) — 새 Linux 서버를 받았을 때 처음 할 일(사용자, SSH 키, 방화벽)을 따라 하는 안내입니다. DigitalOcean 튜토리얼들은 서버 공부에 전반적으로 좋습니다.
- [Arch Wiki: systemd](https://wiki.archlinux.org/title/Systemd) — 유닛 파일과 systemctl 사용법을 가장 자세히 정리한 문서입니다.
- [Docker 공식 문서: Get started](https://docs.docker.com/get-started/) — 이미지, 컨테이너, Dockerfile, Compose를 손으로 따라 하며 익힙니다.
- [Julia Evans: How Containers Work](https://wizardzines.com/zines/containers/) — 네임스페이스와 cgroups로 컨테이너가 만들어지는 원리를 그림으로 설명합니다.
- [devops-exercises](https://github.com/bregman-arie/devops-exercises) — Linux, 네트워크, Docker, 클라우드에 관한 질문과 답 모음. 이 장 이후로 스스로 점검할 때 씁니다.
