@@ scaling
## 공고 날마다 멈췄다

제주이어드림은 청년 지원 공고가 올라오는 날 사람이 몰린다.
그날이면 프론트 서버와 백엔드 서버가 같이 멈췄다.

프론트는 S3 + CloudFront 정적 호스팅이었다.
여기에는 사양을 바꿀 옵션이 없다. 몰리는 날을 대비할 방법이 없었다.

## 서버를 늘리는 두 가지 방법

몰리는 날을 버티는 방법은 크게 두 가지다.

- **스케일 업**: 서버 한 대를 더 큰 사양으로 바꾼다
- **스케일 아웃**: 같은 서버를 여러 대로 늘린다

스케일 업은 간단하지만, 몰리지 않는 날에도 큰 서버 값을 낸다.
제주이어드림은 평소에는 조용하고 공고 날만 붐볐다.
그래서 평소엔 작게, 몰릴 때만 대수를 늘리는 스케일 아웃을 골랐다.

## 필요할 때만 늘어나는 서버

Next.js를 SSR로 돌리고, EC2 + ALB + Auto Scaling 위로 옮겼다.

ALB는 들어온 요청을 여러 서버에 나눠 준다.
Auto Scaling 그룹은 정해 둔 조건에 따라 서버 대수를 늘리고 줄인다.

![이전에는 CloudFront와 S3 정적 호스팅이었고, 이후에는 ALB 뒤의 Auto Scaling 그룹이 평소 1대에서 몰릴 때 최대 5대까지 늘어나는 구조](arch.svg "정적 호스팅에서 Auto Scaling으로")

## 언제, 얼마나 늘릴까

늘어나는 기준은 요청 수다. 서버 1대가 1분 동안 받은 요청 수를 본다.

이 값이 3,000을 넘으면 알람이 울리고, Step Scaling이 서버를 늘린다.
Step Scaling은 기준을 **얼마나** 넘었는지에 따라 늘리는 폭을 다르게 정할 수 있다.

![1분 요청 수가 알람 기준 3,000을 넘은 정도에 따라 1대, 2대, 3대를 더하는 구간](step.svg "넘은 만큼 더 늘린다")

```yaml deploy.yml
HighRequestCountScalingPolicy:
  Type: AWS::AutoScaling::ScalingPolicy
  Properties:
    PolicyType: StepScaling
    AdjustmentType: ChangeInCapacity
    EstimatedInstanceWarmup: 90
    StepAdjustments:
      - MetricIntervalLowerBound: 0       # 3,000 ~ 6,000
        MetricIntervalUpperBound: 3000
        ScalingAdjustment: 1
      - MetricIntervalLowerBound: 3000    # 6,000 ~ 9,000
        MetricIntervalUpperBound: 6000
        ScalingAdjustment: 2
      - MetricIntervalLowerBound: 6000    # 9,000 ~
        ScalingAdjustment: 3
```

구간 값은 알람 기준(3,000)에서 얼마나 넘었는지로 적는다. 그래서 `0`이 3,000, `3000`이 6,000이다.

새 서버가 뜨고 요청을 받을 수 있을 때까지는 시간이 걸린다.
`EstimatedInstanceWarmup: 90`은 "새 서버는 90초 동안은 아직 준비 중"이라고 알려 준다. 그 사이에 또 늘리지 않게.

## 결과

평소에는 1대로 돌고(최대 5대), 몰릴 때만 늘어난다.

해 보니 클라이언트가 원한 건 서버를 늘리는 기술보다, 비용과 안정성을 같이 설계하는 일이었다.

@@ golden-image
## 콘솔에서 만든 인프라

AWS 콘솔에서 손으로 만든 인프라는 기록이 남지 않는다.
같은 걸 다시 만들 수도, 문제가 생겼을 때 이전 상태로 되돌릴 수도 없다.

## 인프라도 코드로

CloudFormation은 인프라를 yaml로 적어 두면 AWS가 그대로 만들어 주는 도구다.
같은 yaml이면 몇 번을 만들어도 같은 인프라가 나온다.

그리고 yaml 한 묶음을 "스택"으로 다룬다.
스택을 바꾸다 하나라도 실패하면, AWS가 스택 전체를 바꾸기 전 상태로 되돌린다.

## 스택 두 개

배포를 두 단계로 나눴다.

1. **이미지 스택**: Git 브랜치를 빌드해서 AMI(Golden Image)로 굳힌다
2. **환경 스택**: AMI ID만 바꿔 Launch Template과 Auto Scaling 그룹을 만든다

![Git 브랜치를 빌드해 AMI로 굳히는 이미지 스택과, 그 AMI ID로 Launch Template, Auto Scaling 그룹, ALB, VPC, 보안 그룹을 만드는 환경 스택](stacks.svg "이미지 스택과 환경 스택")

AMI는 서버를 통째로 찍어 둔 사진이다.
Golden Image는 앱까지 다 깔린 상태로 찍어 둔 AMI를 말한다.

Auto Scaling이 서버를 늘릴 때마다 처음부터 설치하면, 새 서버가 요청을 받기까지 오래 걸린다.
다 깔린 AMI로 띄우면 바로 일할 수 있다.
그리고 모든 서버가 같은 사진에서 나오니까, 서버마다 상태가 다를 일이 없다.

VPC, 보안 그룹, Auto Scaling 그룹, ALB는 CloudFormation 템플릿 하나에 담았다.
콘솔에서 누르던 작업이 전부 yaml로 남는다.

## 결과

새 버전은 AMI ID 하나만 바꿔서 나간다.
하나라도 잘못되면 스택 전체가 되돌아간다.

@@ cutover
## 옮기다 문제가 생기면

운영 중인 서비스를 새 서버로 옮기는 작업이었다.
중간에 문제가 생기면 바로 돌아갈 길이 있어야 했다.

## ALB는 규칙을 위에서부터 본다

ALB의 리스너에는 "이런 요청은 저 서버로" 같은 규칙이 여러 개 있다.
규칙마다 우선순위 숫자가 있고, ALB는 숫자가 작은 것부터 검사한다.
처음 맞는 규칙으로 보내고, 그 아래는 보지 않는다.

그러니까 규칙을 어디에 두느냐가 곧 "어떤 요청을 먼저 가져가느냐"다.

## 기존 규칙 뒤에 두기

새 리스너 규칙을 바로 앞에 두지 않고, 우선순위 509 · 510으로 기존 규칙 뒤에 두었다.

![ALB 리스너 규칙이 숫자가 작은 기존 규칙부터 검사되고, 새 규칙 509와 510은 그 뒤에 있어 기존 규칙에 걸리는 요청은 새 규칙까지 오지 않는 구조](rules.svg "새 규칙은 기존 규칙 뒤에")

이렇게 두면 기존 규칙에 걸리는 요청은 지금처럼 기존 경로로 간다.
새 규칙을 추가해도 운영 중인 흐름이 바뀌지 않는다.

그 상태로 새 경로를 확인한 다음, 직접 전환했다.

## 결과

확인이 끝날 때까지 기존 경로가 그대로 살아 있었다.
전환한 뒤에도 언제든 바로 되돌릴 수 있다.

@@ isr
## 접속할 때마다 같은 API

메인 화면은 접속할 때마다 같은 조회 API를 불렀다.
사람 수만큼 같은 질문을 백엔드에 던지고 있었던 셈이다.

사람이 몰리는 날에는 그 호출이 접속 수만큼 그대로 백엔드로 갔다.

## 같은 질문은 한 번만

ISR(Incremental Static Regeneration)은 만들어 둔 결과를 정해진 시간 동안 재사용하는 방식이다.
그 시간 동안은 백엔드를 부르지 않고, 시간이 지나면 다시 만든다.

메인 조회 API에 5분 주기를 걸었다.

![5분 동안 방문자가 몇 명이 오든 Next 서버는 만들어 둔 결과를 내주고, 백엔드 조회는 5분에 한 번만 일어나는 타임라인](isr.svg "5분 동안 백엔드는 한 번만")

```ts src/lib/api/services/main/home.ts
const REVALIDATE_5_MIN = 300;

export const getMainAnnouncement = async () => {
  const response = await publicHttp.get<MainAnnouncementResponse>(ENDPOINTS.MAIN.announcemnet(), {
    cache: "force-cache",
    next: { revalidate: REVALIDATE_5_MIN },
  });
  return { data: response.data };
};
```

5분이면 공지가 바뀌어도 늦어야 5분 뒤에 보인다.
대신 몰리는 날에도 백엔드가 받는 메인 조회는 5분에 한 번이다. 접속자 수와 상관이 없어진다.

## 결과

몰리는 날의 부하와 평소의 비용을 같이 줄였다.

@@ ip-block
## IP 차단을 켰더니 서비스가 내려갔다

IP 차단을 도입했다.
그런데 도입한 뒤 서비스가 다운됐다. 차단된 IP가 Next 서버 자신이었다.

## SSR에서는 서버가 손님이다

원인은 SSR의 구조에 있었다.

브라우저에서 API를 부르면 백엔드는 사용자의 IP를 본다.
그런데 SSR에서는 사용자의 브라우저가 아니라 Next 서버가 API를 부른다.
백엔드가 보기에는 모든 요청이 Next 서버 한 곳에서 오는 것이다.

그래서 차단 규칙에 걸린 것도 사용자가 아니라 Next 서버의 IP였다.
Next 서버가 막히면 그 뒤의 모든 사용자가 같이 막힌다.

## 실제 사용자 IP 넘기기

프록시나 서버가 요청을 대신 전달할 때는 원래 IP를 `X-Forwarded-For` 헤더에 적어 넘기는 게 관례다.

Next 서버가 받은 요청에서 사용자 IP를 꺼내, API를 부를 때 그대로 넘기게 했다.

![이전에는 백엔드가 Next 서버 IP만 보고 차단했고, 이후에는 Next 서버가 사용자 IP를 X-Forwarded-For로 넘겨 백엔드가 사용자 IP로 판단하는 구조](xff.svg "백엔드가 보는 IP")

```ts src/lib/api/http/serverAuthHttp.ts
async function getForwardedIp(): Promise<Record<string, string>> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for") || headerList.get("x-real-ip") || "";
  return ip ? { "x-forwarded-for": ip } : {};
}
```

하나 주의할 점이 있다.
`X-Forwarded-For`는 그냥 헤더라서 누구나 적어 보낼 수 있다.
그래서 이 값은 믿을 수 있는 곳(여기서는 Next 서버와 ALB)을 거쳐 온 것일 때만 의미가 있다.

## 결과

이제 실제 사용자 IP 기준으로 차단된다.
