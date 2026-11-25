---
title: 전원을 켜면: 부팅
summary: 전원 버튼을 누른 순간부터 로그인 화면이 뜨기까지 컴퓨터 안에서 일어나는 일을 순서대로 따라갑니다. 펌웨어(BIOS, UEFI), 부트로더, 커널, 첫 프로세스가 Windows, macOS, Linux에서 각각 무엇인지 나란히 비교합니다.
---

2장은 이런 질문으로 끝났습니다. 전원 버튼을 누른 직후, RAM은 텅 비어 있고 운영체제는 SSD 안에 잠들어 있습니다. 그때 CPU는 무엇을 실행할까요? 이 페이지를 보려면 브라우저가 떠야 하고, 브라우저가 뜨려면 운영체제가 떠 있어야 하고, 운영체제가 뜨려면 누군가 그걸 SSD에서 RAM으로 올려야 합니다. 그 "누군가"를 거슬러 올라가는 것이 이 장입니다.

전원 버튼을 누르고 로그인 화면이 뜨기까지 보통 10~30초가 걸립니다. 그 사이 컴퓨터는 "아무것도 모르는 상태"에서 "운영체제가 모든 부품을 관리하는 상태"로 넘어갑니다. 이 과정을 [[부팅]]이라고 합니다. 신발 끈(bootstrap)을 잡고 스스로를 들어 올린다는 말에서 나왔습니다. 작은 프로그램이 조금 더 큰 프로그램을 불러오고, 그 프로그램이 더 큰 프로그램을 불러오는 릴레이입니다.

이 장에서는 그 릴레이의 주자를 차례로 만납니다. 큰 흐름은 세 운영체제가 같습니다.

![부팅 릴레이. 주자마다 다음 주자를 찾아 RAM에 올리고 넘겨줍니다. 아래 줄은 각 주자가 어디에 들어 있었는지입니다. 플래시 칩의 작은 프로그램에서 시작해 SSD의 운영체제까지 갑니다](boot-relay.svg)

1. 전원이 안정되고 CPU가 정해진 주소에서 깨어납니다.
2. 메인보드의 [[펌웨어]]가 하드웨어를 점검하고 부팅할 장치를 고릅니다.
3. [[부트로더]]가 디스크에서 운영체제의 [[커널]]을 찾아 RAM에 올립니다.
4. 커널이 하드웨어를 초기화하고 첫 번째 사용자 프로세스를 띄웁니다.
5. 첫 프로세스가 나머지 서비스와 로그인 화면을 띄웁니다.

## 1단계: 전원이 들어오고 CPU가 깨어난다

전원 버튼은 사실 메인보드에 "켜 달라"는 신호를 보내는 스위치일 뿐입니다. 메인보드가 전원 공급 장치(PSU)를 켜면, PSU는 콘센트의 220V 교류를 12V, 5V, 3.3V 직류로 바꿔 내보냅니다. 전압이 안정되기까지 잠깐 기다렸다가 "전원 좋음(Power Good)" 신호를 보냅니다. 이 신호가 오기 전까지 CPU는 리셋 상태로 붙잡혀 있습니다. 전압이 흔들리는 동안 계산을 시작하면 엉망이 되기 때문입니다.

리셋이 풀린 CPU는 아무것도 모릅니다. RAM은 비어 있고(휘발성이니까), 디스크가 어디 있는지도 모릅니다. 그래도 2장의 명령어 사이클은 돌아야 하니, 프로그램 카운터에는 무언가 주소가 들어 있어야 합니다. 그래서 CPU는 공장에서 정해 둔 고정된 주소에서 첫 명령어를 가져옵니다. 이 주소를 [[리셋 벡터]]라고 합니다. x86 CPU는 `0xFFFFFFF0`이고, 메인보드는 이 주소를 RAM이 아니라 펌웨어가 든 플래시 칩에 연결해 둡니다. 그래서 CPU의 첫 명령어는 펌웨어의 첫 명령어가 됩니다.

![전원 직후 CPU가 보는 주소 공간. 맨 꼭대기 근처의 리셋 벡터는 RAM이 아니라 메인보드의 플래시 칩으로 연결되어 있어, 비어 있는 RAM 대신 펌웨어를 읽습니다](boot-reset-vector.svg)

:::quiz first-code 전원을 켠 직후 CPU가 실행하는 첫 명령어는 어디에 있을까요?
- [ ] SSD의 첫 섹터
- [ ] RAM의 0번 주소
- [x] 메인보드 플래시 칩의 펌웨어
- [ ] CPU 캐시

메인보드 플래시 칩의 펌웨어입니다. 전원 직후 RAM은 비어 있고, SSD를 읽으려면 그 장치를 다루는 코드가 먼저 돌아야 합니다. 그래서 CPU는 고정된 주소(리셋 벡터)에서 시작하고, 그 주소가 플래시 칩에 연결되어 있습니다.
:::

펌웨어는 CPU에게 "처음 할 일"을 알려 주는 첫 주자입니다. 이 주자는 무슨 일을 할까요?

## 2단계: 펌웨어가 하드웨어를 깨운다

[[펌웨어]]는 메인보드 플래시 칩에 든 프로그램입니다. 펌웨어의 첫 일은 RAM을 쓸 수 있게 만드는 것입니다. 놀랍게도 전원 직후에는 RAM조차 바로 쓸 수 없어서, 펌웨어는 처음 얼마간 CPU 캐시를 임시 메모리처럼 쓰면서 메모리 컨트롤러를 설정합니다.

그다음 [[POST]](Power-On Self-Test)를 합니다. CPU, RAM, 그래픽, 키보드, 저장 장치가 있는지, 제대로 응답하는지 확인합니다. 문제가 있으면 화면을 띄우기 전이라 "삑-삑삑" 같은 비프음이나 메인보드의 LED로 알립니다. 데스크톱 조립 후 RAM을 덜 꽂으면 화면 없이 삑 소리만 나는 게 이 단계입니다.

### BIOS와 UEFI

펌웨어에는 두 세대가 있습니다.

| | BIOS (레거시) | UEFI |
| --- | --- | --- |
| 나온 때 | 1981년 IBM PC | 2000년대 중반부터, 2012년 무렵 PC 표준이 됨 |
| CPU 모드 | 16비트 리얼 모드에서 시작 (1MB 메모리만 보임) | 32/64비트 모드로 바로 동작 |
| 디스크 분할 방식 | [[MBR]] (2TB까지, 주 파티션 4개) | [[GPT]] (사실상 무제한, 파티션 128개) |
| 부팅 방법 | 디스크 첫 섹터 512바이트를 읽어 실행 | [[EFI 시스템 파티션]]에서 `.efi` 파일을 찾아 실행 |
| 설정 화면 | 파란 글자 화면, 키보드로만 | 마우스가 되는 그래픽 화면도 가능 |
| 보안 | 없음 | [[Secure Boot]]로 서명된 부트로더만 실행 |

요즘 사람들이 "BIOS 들어가기"라고 부르는 화면은 대부분 실제로는 UEFI입니다. 이름만 습관으로 남았습니다. Windows 11은 UEFI와 Secure Boot가 있어야 설치됩니다.

**레거시 BIOS의 부팅**은 이렇습니다. BIOS는 설정된 순서대로 디스크를 보면서 첫 512바이트(부트 섹터)를 읽고, 그 끝 두 바이트가 `55 AA`이면 "부팅할 수 있는 디스크"로 보고 그 512바이트를 메모리 `0x7C00`에 올려 실행합니다. 512바이트에는 운영체제는커녕 부트로더도 다 못 들어가니, 이 작은 코드는 디스크의 다른 곳에서 더 큰 부트로더를 불러오는 일만 합니다.

**UEFI의 부팅**은 훨씬 정돈되어 있습니다. 디스크에는 FAT32로 포맷한 작은 파티션, [[EFI 시스템 파티션]](ESP)이 있습니다. UEFI는 이 파티션의 파일 시스템을 직접 읽을 줄 압니다. 그리고 메인보드의 [[NVRAM]]에 적힌 부팅 항목 목록을 보고, 첫 번째 항목이 가리키는 `.efi` 파일을 실행합니다.

![BIOS와 UEFI가 다음 주자를 찾는 방법. BIOS는 디스크 첫 512바이트를 끝의 55 AA만 보고 그대로 실행하고, UEFI는 NVRAM의 부팅 항목을 따라 ESP의 파일을 이름으로 찾아 실행합니다](boot-bios-uefi.svg)

```text ESP 안의 모습 (Windows와 Ubuntu를 같이 깐 PC)
/EFI/Microsoft/Boot/bootmgfw.efi   ← Windows 부트 관리자
/EFI/ubuntu/shimx64.efi            ← Secure Boot용 중간 단계
/EFI/ubuntu/grubx64.efi            ← GRUB 부트로더
/EFI/BOOT/BOOTX64.EFI              ← 부팅 항목이 없을 때 기본으로 찾는 파일 (USB 설치 디스크)
```

:::quiz bios-sector 레거시 BIOS가 어떤 디스크를 "부팅할 수 있다"고 판단하는 기준은?
- [ ] 디스크에 `bootmgfw.efi` 파일이 있는가
- [ ] NVRAM에 그 디스크의 부팅 항목이 있는가
- [ ] 디스크가 GPT로 나뉘어 있는가
- [x] 첫 512바이트의 끝 두 바이트가 `55 AA`인가

첫 섹터 끝의 `55 AA`입니다. BIOS는 파일 시스템을 읽을 줄 몰라서 디스크 맨 앞 512바이트를 통째로 읽고 이 표시만 확인한 뒤 실행합니다. 파일 이름으로 찾고 NVRAM의 부팅 항목을 보는 것은 UEFI의 방식입니다.
:::

컴퓨터를 켤 때 F2, F12, Del 키를 누르면 UEFI 설정 화면이나 부팅 장치 선택 메뉴가 뜹니다. USB로 운영체제를 설치할 때 여기서 USB를 고릅니다.

### Secure Boot

악성 코드가 부트로더를 바꿔치기하면 운영체제가 뜨기도 전에 컴퓨터를 장악합니다. 운영체제의 백신은 그보다 나중에 뜨니 막을 수 없습니다. [[Secure Boot]]는 펌웨어가 부트로더를 실행하기 전에 [[디지털 서명]]을 확인해서, 믿을 수 있는 회사(주로 Microsoft)가 서명한 것만 실행합니다. 부트로더는 커널의 서명을, 커널은 드라이버의 서명을 확인하며 신뢰가 사슬처럼 이어집니다. Linux 배포판은 Microsoft가 서명한 작은 `shim`을 먼저 실행하고, shim이 배포판의 키로 GRUB과 커널을 확인합니다.

![Secure Boot의 신뢰 사슬(Ubuntu의 경우). 각 고리가 다음 고리의 서명을 확인한 뒤에만 실행합니다. 한 고리라도 바꿔치기되면 거기서 멈춥니다](boot-secure-chain.svg)

이 사슬은 14장에서 이 페이지의 HTTPS 인증서를 확인할 때 똑같은 모양으로 다시 나옵니다. 믿을 수 있는 뿌리 하나에서 시작해 서명으로 한 단계씩 신뢰를 넘깁니다.

펌웨어는 디스크에서 부트로더를 찾아 실행하는 것까지가 일입니다. 운영체제를 올리는 일은 다음 주자가 맡습니다.

## 3단계: 부트로더가 커널을 올린다

[[부트로더]]는 디스크에서 운영체제 커널 파일을 찾아 RAM에 올리고, 커널에 필요한 정보(메모리 지도, 부팅 옵션)를 넘긴 뒤 커널의 시작 주소로 건너뛰는 프로그램입니다. 여러 운영체제를 깔아 두었을 때 무엇으로 부팅할지 고르는 메뉴도 부트로더가 띄웁니다.

| | Windows | macOS (Apple Silicon) | Linux |
| --- | --- | --- | --- |
| 부트로더 | Windows 부트 관리자 (`bootmgfw.efi`) → `winload.efi` | Boot ROM → LLB → iBoot | [[GRUB]] 2 또는 systemd-boot |
| 부팅 설정 | BCD (Boot Configuration Data) 저장소 | 부팅 정책과 LocalPolicy, `bputil` | `/boot/grub/grub.cfg`, 커널 명령줄 |
| 올리는 커널 파일 | `C:\Windows\System32\ntoskrnl.exe` + HAL + 부팅 드라이버 | kernelcache (XNU 커널 + 확장을 미리 묶은 파일) | `/boot/vmlinuz-…` + [[initramfs]] |
| 여러 OS 고르기 | 부팅 메뉴 (F8, 설정의 고급 시작) | 전원 버튼을 길게 눌러 시동 옵션 | GRUB 메뉴 |

Apple Silicon 맥은 PC 같은 UEFI가 없습니다. 칩 안에 지울 수 없는 Boot ROM이 있고, 이것이 서명을 확인하며 LLB(Low-Level Bootloader)를 실행하고, LLB가 iBoot를, iBoot가 커널을 실행합니다. 각 단계가 다음 단계의 서명을 확인하는 Secure Boot 사슬이 하드웨어에 박혀 있는 셈입니다. Intel 맥은 Apple이 만든 EFI 펌웨어와 T2 보안 칩을 썼습니다.

Linux의 [[initramfs]]는 작은 임시 루트 파일 시스템입니다. 커널이 진짜 디스크를 읽으려면 그 디스크의 드라이버가 필요한데, 드라이버는 디스크에 있습니다. 닭과 달걀 문제입니다. 그래서 부트로더가 커널과 함께 필요한 드라이버만 담은 initramfs를 RAM에 올려 주고, 커널은 이걸로 진짜 디스크를 찾아 연결합니다.

:::quiz initramfs-why 새 NVMe 컨트롤러가 달린 서버에서 Linux가 "루트 파일 시스템을 찾을 수 없다"며 멈춥니다. 가장 먼저 의심할 곳은?
- [ ] UEFI의 Secure Boot 설정
- [x] initramfs에 그 컨트롤러의 드라이버가 들어 있는지
- [ ] systemd의 서비스 목록
- [ ] RAM 용량

initramfs에 드라이버가 있는지입니다. 커널이 진짜 디스크를 열려면 그 컨트롤러의 드라이버가 있어야 하는데, 디스크를 열기 전이니 드라이버는 RAM에 미리 올라온 initramfs에서만 가져올 수 있습니다. systemd는 루트 파일 시스템을 연 다음에야 뜹니다.
:::

이제 커널이 RAM에 올라왔습니다. 부트로더는 커널의 시작 주소로 건너뛰고, 다시는 돌아오지 않습니다.

## 4단계: 커널이 하드웨어를 넘겨받는다

[[커널]]은 운영체제의 핵심으로, 하드웨어를 직접 만지는 유일한 프로그램입니다. 4장에서 자세히 보고, 여기서는 부팅 중 커널이 하는 일만 봅니다.

1. **자기 자신 풀기**: 커널 파일은 압축되어 있어서 먼저 RAM에 풀어 놓습니다.
2. **CPU 설정**: 64비트 모드, 커널 모드와 사용자 모드 구분, 인터럽트 표를 준비합니다.
3. **메모리 관리 시작**: 펌웨어가 알려 준 메모리 지도를 받아 [[페이지 테이블]]을 만들고 [[가상 메모리]]를 켭니다(7장).
4. **장치 찾기와 드라이버 불러오기**: PCIe 버스를 훑어 붙어 있는 장치를 찾고, 맞는 [[디바이스 드라이버]]를 올립니다. 디스크, 네트워크 카드, USB, 그래픽이 이때 살아납니다.
5. **다른 코어 깨우기**: 처음에는 코어 하나만 돌고 있습니다. 커널이 나머지 코어를 깨워 함께 일하게 합니다.
6. **루트 파일 시스템 연결**: 운영체제가 든 디스크 파티션을 연결(마운트)합니다.
7. **첫 사용자 프로세스 실행**: 여기서부터는 커널이 직접 일하지 않고, 사용자 공간의 첫 프로그램에 일을 넘깁니다.

이 일곱 가지 중 2장의 부품이 하나씩 살아나는 것이 4번입니다. 지금 이 페이지를 받아 온 네트워크 카드도, 체크 기록을 쓸 SSD도 커널이 드라이버를 붙여 줘야 비로소 쓸 수 있습니다.

Linux에서 `dmesg`를 치면 이 과정에서 커널이 남긴 기록을 볼 수 있습니다. 어떤 CPU를 찾았고, 메모리가 얼마고, 어떤 장치에 어떤 드라이버를 붙였는지가 시간 순서로 나옵니다.

## 5단계: 첫 프로세스가 나머지를 띄운다

커널이 실행하는 첫 사용자 프로그램은 모든 프로세스의 조상이 됩니다. 이 프로그램이 네트워크, 로그, 디스크 검사, 로그인 화면 같은 나머지 서비스를 순서대로 띄웁니다. 운영체제마다 이름이 다릅니다.

| | Windows | macOS | Linux (대부분의 배포판) |
| --- | --- | --- | --- |
| 첫 사용자 프로세스 | `smss.exe` (세션 관리자) | [[launchd]] (PID 1) | [[systemd]] (PID 1) |
| 그다음 | `csrss.exe`, `wininit.exe` → `services.exe`(서비스 관리), `lsass.exe`(로그인 보안) | launchd가 `/System/Library/LaunchDaemons`의 데몬들을 띄움 | systemd가 유닛 파일을 보고 서비스를 병렬로 띄움 |
| 백그라운드 서비스의 이름 | 서비스(Windows Service) | 데몬, 에이전트 (plist 파일로 정의) | 데몬, 서비스 (`.service` 유닛 파일로 정의) |
| 로그인 화면 | `winlogon.exe` + `LogonUI.exe` | `loginwindow` | 디스플레이 관리자 (GDM, SDDM 등) |
| 로그인 후 데스크톱 | `userinit.exe` → `explorer.exe` (작업 표시줄, 바탕화면) | `WindowServer`가 화면을 맡고 Finder, Dock이 뜸 | GNOME, KDE 같은 데스크톱 환경 |

![macOS의 프로세스 나무 일부. 모든 프로세스는 PID 1인 launchd에서 갈라져 나옵니다. 지금 이 페이지를 띄운 브라우저도 이 나무의 한 가지입니다](boot-process-tree.svg)

[[PID]]는 프로세스마다 붙는 번호입니다(6장). macOS와 Linux에서 PID 1은 언제나 첫 프로세스이고, 이게 죽으면 커널은 더 할 일이 없어 시스템이 멈춥니다. Windows에서는 PID 4가 커널 자신을 나타내는 `System` 프로세스입니다.

이 "첫 프로세스가 서비스를 띄우는" 구조가 서버에서도 그대로 쓰입니다. 이 페이지를 보내 준 서버도 재부팅되면 systemd가 Docker를 띄우고, Docker가 웹 서버 컨테이너를 다시 띄웁니다. 15장에서 직접 등록해 봅니다.

:::quiz pid1-dies Linux에서 PID 1(systemd)이 죽으면 어떻게 될까요?
- [ ] 커널이 다음 번호의 프로세스를 PID 1로 올린다
- [ ] 로그인 화면만 다시 뜬다
- [x] 커널이 더 진행할 수 없어 시스템이 멈춘다 (커널 패닉)
- [ ] systemd가 스스로 다시 시작된다

커널 패닉으로 멈춥니다. PID 1은 모든 프로세스의 조상이고 고아가 된 프로세스를 거둬 주는 역할도 하니, 커널은 PID 1 없이 사용자 공간을 이어 갈 수 없다고 보고 멈춥니다. 그래서 PID 1은 절대 죽지 않도록 작고 튼튼하게 만듭니다.
:::

## 로그인 이후: 사용자 세션

로그인하면 운영체제는 그 사용자의 권한으로 데스크톱 프로그램들을 띄웁니다. 시작 프로그램(Windows의 시작 앱, macOS의 로그인 항목, Linux의 자동 시작)이 이때 뜹니다. 부팅이 느리다고 느끼는 이유의 상당수는 커널이 아니라 이 단계에서 한꺼번에 뜨는 프로그램들입니다.

그리고 드디어 브라우저 아이콘을 누릅니다. 여기서부터 이 페이지가 화면에 뜨기까지는 운영체제가 하는 일입니다. 브라우저 파일을 SSD에서 찾아 RAM에 올리고, 프로세스로 만들어 CPU 시간을 나눠 주고, 네트워크 카드와 화면을 대신 다뤄 줍니다. 4장은 이 "관리자"가 무엇이고, 브라우저 같은 프로그램과 어떻게 대화하는지 봅니다.

## 곁가지: 끄기, 잠자기, 최대 절전

부팅의 반대도 알아 두면 좋습니다.

| 상태 | 하는 일 | 다시 켤 때 |
| --- | --- | --- |
| 종료 | 프로그램을 끝내고 디스크에 다 쓴 뒤 전원을 끔 | 처음부터 부팅 |
| 잠자기 (절전, sleep) | RAM에만 전기를 주고 나머지를 끔 | RAM이 그대로라 1~2초 만에 돌아옴 |
| 최대 절전 (hibernate) | RAM 내용을 디스크에 통째로 쓰고 전원을 끔 | 디스크에서 RAM으로 다시 읽어 옴 |

운영체제마다 이 위에 자기만의 장치를 올립니다.

- **Windows의 빠른 시작**: "시스템 종료"를 누르면 실제로는 사용자만 로그아웃하고, 커널 상태는 최대 절전처럼 `hiberfil.sys`에 저장합니다. 다음 부팅이 빠른 대신, 드라이버 문제가 "재부팅"으로는 풀리는데 "종료 후 켜기"로는 안 풀리는 이상한 일이 생깁니다. 진짜 처음부터 부팅하려면 "다시 시작"을 누릅니다.
- **macOS**: 덮개를 닫으면 잠자기에 들고, 배터리가 떨어지면 RAM 내용을 디스크에 써 둡니다(safe sleep). Apple Silicon 맥은 휴대폰처럼 잠자는 동안에도 메일을 받는 등 아주 적은 전력으로 일부 일을 계속합니다.
- **Linux**: `systemctl suspend`(잠자기), `systemctl hibernate`(최대 절전). 노트북에서는 하드웨어에 따라 잘 되기도, 안 되기도 합니다.

## 한눈에 보는 세 운영체제의 부팅

| 단계 | Windows (x86 PC) | macOS (Apple Silicon) | Linux (x86 PC, Ubuntu) |
| --- | --- | --- | --- |
| 펌웨어 | UEFI | Boot ROM (칩 안) | UEFI |
| 신뢰의 시작 | Secure Boot (Microsoft 키) | Boot ROM의 Apple 키 | Secure Boot → shim (Microsoft 서명) → 배포판 키 |
| 부트로더 | `bootmgfw.efi` → `winload.efi` | LLB → iBoot | GRUB 2 |
| 커널 | NT 커널 (`ntoskrnl.exe`) | XNU (kernelcache) | Linux (`vmlinuz`) + initramfs |
| 첫 프로세스 | `smss.exe` | `launchd` | `systemd` |
| 로그인 | `winlogon.exe` | `loginwindow` | GDM |
| 복구 환경 | Windows RE (고급 시작 옵션) | 복구 모드 (전원 버튼 길게) | GRUB 복구 메뉴, 라이브 USB |

## 곁가지: 서버의 부팅은 무엇이 다른가

서버도 같은 순서로 켜지지만 몇 가지가 다릅니다.

- 화면이 없으니 로그인 화면도 띄우지 않습니다. Linux 서버는 그래픽 대신 텍스트 모드(`multi-user.target`)까지만 올립니다.
- 사람이 앞에 없으니 부팅 중 멈추면 안 됩니다. 디스크 오류가 나도 자동으로 넘어가도록 설정하고, BMC로 원격에서 부팅 화면을 봅니다.
- 클라우드 서버는 실제 펌웨어 대신 [[하이퍼바이저]]가 흉내 낸 가상 펌웨어로 부팅합니다. 처음 켤 때 `cloud-init`이라는 프로그램이 SSH 키를 넣고 사용자를 만드는 등 초기 설정을 합니다. AWS나 Lightsail에서 서버를 만들고 1~2분 뒤에 SSH로 접속할 수 있는 건 이 과정이 끝나기를 기다리는 것입니다.

## 프론트엔드와 이어지는 곳

- `npm run dev`로 띄운 개발 서버는 내가 터미널을 닫으면 꺼지지만, 서버에서 systemd나 Docker로 띄운 서버는 재부팅해도 다시 뜹니다. 차이는 "누가 그 프로세스를 띄우고 지켜보느냐"이고, 이 장의 첫 프로세스가 그 주인공입니다.
- macOS의 `launchd`는 개발 도구도 관리합니다. `brew services start postgresql`이 하는 일은 launchd에 plist 파일을 등록하는 것입니다.
- Docker 컨테이너 안에서는 내 앱이 PID 1이 됩니다. PID 1은 종료 신호를 다르게 처리해서, Node 앱이 `docker stop`에 10초 동안 안 꺼지는 문제가 생기곤 합니다. 6장의 시그널에서 다시 봅니다.

## 용어 정리

:::terms
- 부팅 (booting) — 전원을 켠 뒤 펌웨어, 부트로더, 커널, 첫 프로세스가 차례로 실행되어 운영체제가 쓸 수 있는 상태가 되기까지의 과정입니다.
- 리셋 벡터 (reset vector) — 리셋이 풀린 CPU가 첫 명령어를 가져오는 고정된 주소. 이 주소에 펌웨어가 연결되어 있습니다.
- POST (Power-On Self-Test) — 전원을 켠 직후 펌웨어가 CPU, 메모리, 장치가 정상인지 확인하는 검사입니다.
- BIOS (Basic Input/Output System) — 1981년 IBM PC부터 쓰인 옛 펌웨어. 디스크 첫 512바이트를 읽어 부팅합니다.
- UEFI (Unified Extensible Firmware Interface) — BIOS를 대신하는 요즘 펌웨어 표준. EFI 시스템 파티션의 `.efi` 파일을 실행해 부팅하고 Secure Boot를 지원합니다.
- MBR (Master Boot Record) — 디스크 첫 섹터에 파티션 표와 부트 코드를 두는 옛 방식. 2TB, 주 파티션 4개까지입니다.
- GPT (GUID Partition Table) — MBR을 대신하는 디스크 파티션 방식. UEFI와 함께 씁니다.
- EFI 시스템 파티션 (ESP) — UEFI가 읽는 FAT32 파티션. 운영체제별 부트로더 `.efi` 파일이 들어 있습니다.
- NVRAM — 전원이 꺼져도 남는 메인보드의 작은 저장소. UEFI 부팅 항목 순서 같은 설정을 담습니다.
- Secure Boot — 펌웨어가 부트로더의 서명을 확인하고, 각 단계가 다음 단계의 서명을 확인해 믿을 수 있는 코드만 실행하게 하는 기능입니다.
- 부트로더 (bootloader) — 디스크에서 커널을 찾아 메모리에 올리고 실행하는 프로그램. GRUB, Windows 부트 관리자, iBoot 등이 있습니다.
- GRUB — 대부분의 Linux 배포판이 쓰는 부트로더. 여러 운영체제와 커널 버전을 고르는 메뉴를 띄웁니다.
- initramfs — Linux 부팅 때 커널과 함께 RAM에 올리는 임시 루트 파일 시스템. 진짜 디스크를 여는 데 필요한 드라이버가 들어 있습니다.
- launchd — macOS의 첫 프로세스(PID 1). 데몬과 에이전트를 띄우고 관리합니다.
- systemd — 대부분의 Linux 배포판의 첫 프로세스(PID 1). 유닛 파일을 보고 서비스를 띄우고, 죽으면 다시 띄우고, 로그를 모읍니다.
- smss.exe — Windows의 세션 관리자. 커널이 띄우는 첫 사용자 모드 프로세스로, 나머지 시스템 프로세스를 띄웁니다.
- 최대 절전 (hibernate) — RAM 내용을 디스크에 저장하고 전원을 완전히 끄는 상태. 켤 때 디스크에서 RAM으로 되돌립니다.
- 빠른 시작 (Fast Startup) — Windows가 종료할 때 커널 상태를 최대 절전처럼 저장해 다음 부팅을 빠르게 하는 기능입니다.
- cloud-init — 클라우드 서버가 처음 부팅할 때 SSH 키, 사용자, 패키지 같은 초기 설정을 해 주는 프로그램입니다.
:::

## 직접 해보기

:::practice firmware 내 컴퓨터가 UEFI로 부팅했는지 확인하기
펌웨어 종류와 Secure Boot 상태를 확인합니다.

```powershell Windows
msinfo32
# 시스템 요약 → "BIOS 모드"가 UEFI인지, "보안 부팅 상태"가 켜짐인지 봅니다
# 관리자 PowerShell에서:
Confirm-SecureBootUEFI
bcdedit /enum firmware     # UEFI 부팅 항목 목록
```

```sh Linux
[ -d /sys/firmware/efi ] && echo UEFI || echo BIOS
mokutil --sb-state          # Secure Boot 상태
efibootmgr -v               # NVRAM의 부팅 항목
```

```sh macOS
system_profiler SPSoftwareDataType | grep -E "Boot|Secure|Time since"
# Apple Silicon은 UEFI가 아니므로 Boot Mode와 부팅 볼륨을 봅니다
```
:::

:::practice pid1 첫 프로세스 만나기
PID 1(Windows는 시스템 프로세스)이 무엇인지 확인하고, 그 아래로 어떤 프로세스들이 뻗어 나왔는지 나무 모양으로 봅니다.

```sh macOS
ps -p 1 -o pid,ppid,user,comm     # launchd
ps -ax -o pid,ppid,comm | head -20 # 대부분의 PPID가 1입니다
```

```sh Linux
ps -p 1 -o pid,comm               # systemd
pstree -p | head -30
```

```powershell Windows (PowerShell)
Get-Process -Id 4                 # System
Get-CimInstance Win32_Process | Where-Object Name -in "smss.exe","wininit.exe","winlogon.exe","services.exe" | Select-Object ProcessId, ParentProcessId, Name
```
:::

:::practice boot-time 부팅 시간을 단계별로 재기
이번 부팅이 언제였고, 각 단계에 얼마나 걸렸는지 봅니다. Linux는 단계별 시간을 바로 보여 줍니다.

```sh Linux
systemd-analyze               # Startup finished in 3.1s (firmware) + 2.0s (loader) + 1.4s (kernel) + ...
systemd-analyze blame | head  # 오래 걸린 서비스
journalctl -b | head -50      # 이번 부팅의 기록
dmesg | head -40              # 커널이 남긴 기록
```

```sh macOS
sysctl kern.boottime
log show --last boot --predicate 'process == "kernel"' | head -40
```

```powershell Windows (PowerShell)
(Get-CimInstance Win32_OperatingSystem).LastBootUpTime
# 작업 관리자 → 시작 앱 탭에서 "시작에 미치는 영향"을 봅니다
```
:::

:::practice services 등록된 서비스 목록 보기
내 컴퓨터가 부팅할 때 띄우는 백그라운드 서비스를 훑어보고, 이름만 보고 무슨 일을 하는지 짐작되는 것 다섯 개를 골라 검색해 봅니다.

```sh macOS
launchctl list | head -30
ls /Library/LaunchDaemons ~/Library/LaunchAgents
```

```sh Linux
systemctl list-units --type=service --state=running
```

```powershell Windows (PowerShell)
Get-Service | Where-Object Status -eq Running | Select-Object -First 30
```
:::

## 장 전체 문제

:::quiz relay-order 전원 버튼을 누른 뒤 실행되는 순서로 맞는 것은?
- [ ] 부트로더 → 펌웨어 → 커널 → 첫 프로세스
- [ ] 펌웨어 → 커널 → 부트로더 → 첫 프로세스
- [x] 펌웨어 → 부트로더 → 커널 → 첫 프로세스
- [ ] 커널 → 펌웨어 → 부트로더 → 첫 프로세스

펌웨어 → 부트로더 → 커널 → 첫 프로세스입니다. 각 주자는 다음 주자를 찾아 RAM에 올리는 데 필요한 만큼만 알고 있습니다. 펌웨어는 디스크에서 부트로더를, 부트로더는 커널을, 커널은 첫 프로세스를 띄웁니다.
:::

:::quiz fast-startup Windows에서 드라이버 문제가 "시스템 종료 후 켜기"로는 안 풀리고 "다시 시작"으로는 풀렸습니다. 이유는?
- [ ] "다시 시작"이 펌웨어 설정을 초기화해서
- [x] "빠른 시작" 때문에 종료 시 커널 상태가 저장되었다가 그대로 복원되어서
- [ ] "다시 시작"만 Secure Boot를 다시 확인해서
- [ ] 종료하면 RAM 내용이 남아 있어서

빠른 시작 때문입니다. Windows의 "시스템 종료"는 커널 상태를 `hiberfil.sys`에 저장해 두고 다음에 그대로 불러오니, 문제가 생긴 드라이버 상태도 함께 돌아옵니다. "다시 시작"은 커널을 처음부터 다시 부팅합니다.
:::

## 스스로 점검

:::qa 전원 버튼을 누른 뒤 CPU가 처음 실행하는 코드는 어디에 있고, 왜 디스크가 아닌가요?
메인보드 플래시 칩의 펌웨어입니다. 전원 직후의 CPU는 RAM도 비어 있고 디스크를 읽는 방법도 모르니, 공장에서 정한 리셋 벡터 주소에서 시작해야 하고 그 주소가 펌웨어 칩에 연결되어 있습니다.
:::

:::qa BIOS와 UEFI가 부트로더를 찾는 방법의 차이는?
BIOS는 디스크 첫 섹터 512바이트를 읽어 끝이 `55 AA`면 그대로 실행합니다. UEFI는 FAT32인 EFI 시스템 파티션의 파일 시스템을 직접 읽고, NVRAM의 부팅 항목이 가리키는 `.efi` 파일을 실행합니다.
:::

:::qa Linux 부팅에서 initramfs가 필요한 이유는?
커널이 루트 파일 시스템을 열려면 그 디스크(또는 암호화, RAID)의 드라이버가 필요한데, 그 드라이버가 바로 그 디스크 안에 있습니다. 부트로더가 필요한 드라이버만 담은 작은 파일 시스템을 RAM에 함께 올려 이 순환을 끊습니다.
:::

:::qa macOS와 Linux에서 PID 1은 무엇이고, 무슨 일을 하나요? Windows에서는 무엇이 비슷한 역할을 하나요?
macOS는 launchd, Linux는 대부분 systemd입니다. 커널이 띄우는 첫 사용자 프로세스로 나머지 데몬과 서비스를 띄우고, 죽으면 다시 띄우고, 고아 프로세스를 거둡니다. Windows에서는 smss.exe가 시작해 wininit.exe, services.exe가 서비스를 관리합니다.
:::

:::qa Windows에서 "종료 후 다시 켜기"와 "다시 시작"이 다르게 동작하는 이유는?
빠른 시작이 켜져 있으면 종료할 때 커널 상태를 최대 절전처럼 저장해 두고 다음에 그대로 불러옵니다. "다시 시작"은 빠른 시작을 쓰지 않고 커널부터 새로 부팅하므로, 드라이버 문제 같은 것은 다시 시작으로만 풀립니다.
:::

:::qa Secure Boot가 막는 공격은 무엇이고, 백신 프로그램으로는 왜 못 막나요?
부트로더나 커널을 바꿔치기해 운영체제보다 먼저 실행되는 악성 코드(부트킷)를 막습니다. 백신은 운영체제가 뜬 뒤에 실행되므로 그보다 먼저 실행된 코드를 믿을 수 없습니다. Secure Boot는 펌웨어 단계에서 서명을 확인합니다.
:::

## 더 읽을거리

- [linux-insides: Kernel booting process](https://0xax.gitbooks.io/linux-insides/content/Booting/) — 전원 버튼부터 Linux 커널의 첫 코드까지를 소스 코드와 함께 따라가는 책입니다.
- [os-tutorial](https://github.com/cfenollosa/os-tutorial) — 부트 섹터 512바이트부터 직접 만들어 보는 튜토리얼. "BIOS가 `0x7C00`에 올린다"를 손으로 확인합니다.
- [Arch Wiki: Arch boot process](https://wiki.archlinux.org/title/Arch_boot_process) — UEFI, 부트로더, initramfs, systemd를 정확하고 짧게 정리한 문서입니다.
- [Microsoft: Windows 부팅 프로세스 개요](https://learn.microsoft.com/ko-kr/windows-hardware/drivers/bringup/boot-and-uefi) — Windows의 UEFI 부팅 구조 공식 문서입니다.
- [Apple 플랫폼 보안: 부팅 프로세스](https://support.apple.com/ko-kr/guide/security/secac71d5623/web) — Apple Silicon 맥의 Boot ROM, LLB, iBoot 사슬을 설명합니다.
