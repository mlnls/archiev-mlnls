/**
 * 기술 스택 사전.
 * 소스마다 표기가 제각각("React.js", "리액트", "ReactJS")이라 하나의 키로 모읍니다.
 * 짧고 흔한 단어(go, s3 등)는 오탐을 막기 위해 영문자/숫자 경계를 검사합니다.
 */

export type SkillTrack = "frontend" | "infra" | "backend" | "data" | "common";

export interface SkillDef {
  key: string;
  label: string;
  track: SkillTrack;
  aliases: string[];
}

export const SKILLS: SkillDef[] = [
  // ── Frontend ──
  { key: "javascript", label: "JavaScript", track: "frontend", aliases: ["javascript", "js", "es6", "ecmascript", "자바스크립트"] },
  { key: "typescript", label: "TypeScript", track: "frontend", aliases: ["typescript", "ts", "타입스크립트"] },
  { key: "react", label: "React", track: "frontend", aliases: ["react", "react.js", "reactjs", "리액트"] },
  { key: "nextjs", label: "Next.js", track: "frontend", aliases: ["next.js", "nextjs", "next js", "넥스트"] },
  { key: "react-native", label: "React Native", track: "frontend", aliases: ["react native", "react-native", "reactnative", "리액트 네이티브", "리액트네이티브", "rn"] },
  { key: "expo", label: "Expo", track: "frontend", aliases: ["expo", "eas update"] },
  { key: "vue", label: "Vue", track: "frontend", aliases: ["vue", "vue.js", "vuejs", "vue3"] },
  { key: "nuxt", label: "Nuxt", track: "frontend", aliases: ["nuxt", "nuxt.js", "nuxtjs"] },
  { key: "angular", label: "Angular", track: "frontend", aliases: ["angular", "angularjs"] },
  { key: "svelte", label: "Svelte", track: "frontend", aliases: ["svelte", "sveltekit"] },
  { key: "flutter", label: "Flutter", track: "frontend", aliases: ["flutter", "플러터"] },
  { key: "html", label: "HTML", track: "frontend", aliases: ["html", "html5"] },
  { key: "css", label: "CSS", track: "frontend", aliases: ["css", "css3", "scss", "sass", "less"] },
  { key: "tailwindcss", label: "Tailwind CSS", track: "frontend", aliases: ["tailwind", "tailwindcss", "tailwind css"] },
  { key: "styled-components", label: "styled-components", track: "frontend", aliases: ["styled-components", "styled components", "styledcomponents"] },
  { key: "emotion", label: "Emotion", track: "frontend", aliases: ["emotion", "@emotion"] },
  { key: "redux", label: "Redux", track: "frontend", aliases: ["redux", "redux toolkit", "rtk"] },
  { key: "zustand", label: "Zustand", track: "frontend", aliases: ["zustand"] },
  { key: "recoil", label: "Recoil", track: "frontend", aliases: ["recoil"] },
  { key: "jotai", label: "Jotai", track: "frontend", aliases: ["jotai"] },
  { key: "react-query", label: "TanStack Query", track: "frontend", aliases: ["react-query", "react query", "reactquery", "tanstack query", "tanstack-query", "@tanstack/react-query"] },
  { key: "swr", label: "SWR", track: "frontend", aliases: ["swr"] },
  { key: "react-hook-form", label: "React Hook Form", track: "frontend", aliases: ["react hook form", "react-hook-form"] },
  { key: "zod", label: "Zod", track: "frontend", aliases: ["zod"] },
  { key: "webpack", label: "Webpack", track: "frontend", aliases: ["webpack", "웹팩"] },
  { key: "vite", label: "Vite", track: "frontend", aliases: ["vite"] },
  { key: "monorepo", label: "Monorepo", track: "frontend", aliases: ["monorepo", "모노레포", "turborepo", "turbo repo", "pnpm workspace", "yarn workspace"] },
  { key: "design-system", label: "디자인 시스템", track: "frontend", aliases: ["디자인 시스템", "디자인시스템", "design system", "ui 라이브러리", "공통 컴포넌트"] },
  { key: "storybook", label: "Storybook", track: "frontend", aliases: ["storybook", "스토리북"] },
  { key: "jest", label: "Jest", track: "frontend", aliases: ["jest"] },
  { key: "vitest", label: "Vitest", track: "frontend", aliases: ["vitest"] },
  { key: "testing-library", label: "Testing Library", track: "frontend", aliases: ["testing library", "testing-library", "react testing library"] },
  { key: "e2e", label: "E2E 테스트", track: "frontend", aliases: ["cypress", "playwright", "e2e"] },
  { key: "graphql", label: "GraphQL", track: "common", aliases: ["graphql", "apollo"] },
  { key: "pwa", label: "PWA", track: "frontend", aliases: ["pwa", "service worker", "서비스워커", "서비스 워커"] },
  { key: "web-push", label: "웹 푸시/FCM", track: "frontend", aliases: ["fcm", "web push", "웹 푸시", "웹푸시", "firebase cloud messaging"] },
  { key: "seo", label: "SEO", track: "frontend", aliases: ["seo", "검색엔진최적화", "검색 엔진 최적화"] },
  { key: "web-performance", label: "웹 성능 최적화", track: "frontend", aliases: ["lighthouse", "web vitals", "core web vitals", "lcp", "fcp", "성능 최적화", "성능최적화", "코드 스플리팅", "code splitting"] },
  { key: "ssr", label: "SSR/ISR", track: "frontend", aliases: ["ssr", "isr", "server side rendering", "서버 사이드 렌더링", "server components", "rsc"] },
  { key: "accessibility", label: "웹 접근성", track: "frontend", aliases: ["접근성", "a11y", "accessibility", "wcag"] },
  { key: "webview", label: "WebView/하이브리드", track: "frontend", aliases: ["webview", "웹뷰", "하이브리드 앱", "hybrid app"] },
  { key: "websocket", label: "WebSocket", track: "common", aliases: ["websocket", "웹소켓", "socket.io", "sse"] },
  { key: "threejs", label: "Three.js", track: "frontend", aliases: ["three.js", "threejs", "webgl"] },
  { key: "d3", label: "D3/데이터 시각화", track: "frontend", aliases: ["d3", "d3.js", "chart.js", "echarts", "데이터 시각화"] },
  { key: "i18n", label: "i18n", track: "frontend", aliases: ["i18n", "다국어", "국제화"] },
  { key: "micro-frontend", label: "마이크로 프론트엔드", track: "frontend", aliases: ["micro frontend", "micro-frontend", "마이크로 프론트엔드", "module federation"] },
  { key: "google-analytics", label: "GA4/로그 분석", track: "common", aliases: ["google analytics", "ga4", "gtm", "amplitude", "mixpanel"] },
  { key: "figma", label: "Figma", track: "common", aliases: ["figma", "피그마"] },

  // ── Infra / DevOps ──
  { key: "aws", label: "AWS", track: "infra", aliases: ["aws", "amazon web services", "아마존 웹 서비스"] },
  { key: "aws-ec2", label: "EC2", track: "infra", aliases: ["ec2", "amazon ec2"] },
  { key: "aws-s3", label: "S3", track: "infra", aliases: ["s3", "amazon s3"] },
  { key: "aws-cloudfront", label: "CloudFront/CDN", track: "infra", aliases: ["cloudfront", "cdn"] },
  { key: "aws-lambda", label: "Lambda/서버리스", track: "infra", aliases: ["lambda", "aws lambda", "serverless", "서버리스"] },
  { key: "aws-ecs", label: "ECS/Fargate", track: "infra", aliases: ["ecs", "fargate", "amazon ecs"] },
  { key: "aws-rds", label: "RDS", track: "infra", aliases: ["rds", "aurora", "amazon rds"] },
  { key: "aws-networking", label: "VPC/네트워크", track: "infra", aliases: ["vpc", "route53", "route 53", "alb", "elb", "load balancer", "로드밸런서", "로드 밸런서", "nat gateway", "bastion", "베스천", "바스티온", "vpn"] },
  { key: "aws-iam", label: "IAM/보안", track: "infra", aliases: ["iam", "waf", "security group", "보안 그룹"] },
  { key: "autoscaling", label: "Auto Scaling", track: "infra", aliases: ["auto scaling", "autoscaling", "오토스케일링", "오토 스케일링", "hpa"] },
  { key: "cloudformation", label: "CloudFormation/CDK", track: "infra", aliases: ["cloudformation", "aws cdk", "cdk"] },
  { key: "terraform", label: "Terraform", track: "infra", aliases: ["terraform", "테라폼", "iac", "infrastructure as code"] },
  { key: "docker", label: "Docker", track: "infra", aliases: ["docker", "도커", "container", "컨테이너", "docker compose", "docker-compose"] },
  { key: "kubernetes", label: "Kubernetes", track: "infra", aliases: ["kubernetes", "k8s", "쿠버네티스", "eks", "gke", "aks", "helm"] },
  { key: "github-actions", label: "GitHub Actions", track: "infra", aliases: ["github actions", "github action", "gh actions"] },
  { key: "jenkins", label: "Jenkins", track: "infra", aliases: ["jenkins", "젠킨스"] },
  { key: "argocd", label: "ArgoCD/GitOps", track: "infra", aliases: ["argocd", "argo cd", "gitops", "flux"] },
  { key: "cicd", label: "CI/CD", track: "infra", aliases: ["ci/cd", "cicd", "ci cd", "배포 자동화", "배포 파이프라인"] },
  { key: "nginx", label: "Nginx", track: "infra", aliases: ["nginx", "엔진엑스", "apache", "reverse proxy", "리버스 프록시"] },
  { key: "linux", label: "Linux", track: "infra", aliases: ["linux", "리눅스", "ubuntu", "centos", "shell script", "bash"] },
  { key: "monitoring", label: "모니터링/관측성", track: "infra", aliases: ["prometheus", "grafana", "datadog", "new relic", "cloudwatch", "모니터링", "observability", "관측성", "elk", "loki"] },
  { key: "sentry", label: "Sentry", track: "common", aliases: ["sentry"] },
  { key: "gcp", label: "GCP", track: "infra", aliases: ["gcp", "google cloud", "구글 클라우드"] },
  { key: "azure", label: "Azure", track: "infra", aliases: ["azure"] },
  { key: "ncp", label: "NCP", track: "infra", aliases: ["ncp", "naver cloud", "네이버 클라우드", "네이버클라우드"] },
  { key: "vercel", label: "Vercel", track: "infra", aliases: ["vercel", "netlify"] },
  { key: "networking", label: "네트워크 기초", track: "infra", aliases: ["tcp/ip", "tcp", "dns", "http/2", "네트워크"] },
  { key: "load-testing", label: "부하 테스트", track: "infra", aliases: ["k6", "jmeter", "locust", "ngrinder", "부하 테스트", "부하테스트", "성능 테스트", "load test", "load testing"] },
  { key: "sre", label: "SRE/장애 대응", track: "infra", aliases: ["sre", "장애 대응", "장애대응", "on-call", "온콜", "incident"] },

  // ── Backend / Data ──
  { key: "nodejs", label: "Node.js", track: "backend", aliases: ["node.js", "nodejs", "node js", "노드"] },
  { key: "nestjs", label: "NestJS", track: "backend", aliases: ["nestjs", "nest.js"] },
  { key: "express", label: "Express", track: "backend", aliases: ["express", "express.js"] },
  { key: "java", label: "Java", track: "backend", aliases: ["java"] },
  { key: "spring", label: "Spring", track: "backend", aliases: ["spring", "spring boot", "springboot", "스프링"] },
  { key: "kotlin", label: "Kotlin", track: "backend", aliases: ["kotlin", "코틀린"] },
  { key: "python", label: "Python", track: "backend", aliases: ["python", "파이썬", "django", "fastapi", "flask"] },
  { key: "golang", label: "Go", track: "backend", aliases: ["golang", "go언어", "go 언어"] },
  { key: "sql", label: "SQL", track: "data", aliases: ["sql", "sqld", "rdbms", "mysql", "postgresql", "postgres", "mariadb", "oracle"] },
  { key: "baas", label: "BaaS", track: "backend", aliases: ["supabase", "firebase", "baas"] },
  { key: "nosql", label: "NoSQL", track: "data", aliases: ["mongodb", "dynamodb", "nosql"] },
  { key: "redis", label: "Redis/캐시", track: "backend", aliases: ["redis", "memcached", "레디스"] },
  { key: "kafka", label: "메시지 큐", track: "backend", aliases: ["kafka", "rabbitmq", "sqs", "메시지 큐", "message queue"] },

  // ── 공통 ──
  { key: "git", label: "Git", track: "common", aliases: ["git", "github", "gitlab", "bitbucket"] },
  { key: "jira", label: "Jira/협업툴", track: "common", aliases: ["jira", "confluence", "notion", "slack"] },
  { key: "llm", label: "LLM/AI 연동", track: "common", aliases: ["llm", "openai", "gpt", "claude", "langchain", "rag", "ai agent", "ai 에이전트"] },
];

const BY_KEY = new Map(SKILLS.map((s) => [s.key, s]));

export function skillDef(key: string): SkillDef | undefined {
  return BY_KEY.get(key);
}

export function skillLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 한글이 포함된 별칭은 경계 검사 없이, 영문 별칭은 영숫자 경계를 검사합니다 */
const MATCHERS: { key: string; re: RegExp }[] = SKILLS.flatMap((s) =>
  s.aliases.map((alias) => {
    const a = escapeRegex(alias.toLowerCase()).replace(/\\? /g, "[\\s-]?");
    const hasHangul = /[가-힣]/.test(alias);
    const re = hasHangul ? new RegExp(a, "i") : new RegExp(`(?<![a-z0-9])${a}(?![a-z0-9])`, "i");
    return { key: s.key, re };
  }),
);

/** 하나의 스택 표기(예: "Amazon EC2", "React.js")를 사전 키로 바꿉니다 */
export function normalizeSkill(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  for (const s of SKILLS) {
    if (s.key === t || s.aliases.includes(t)) return s.key;
  }
  for (const m of MATCHERS) {
    if (m.re.test(t)) return m.key;
  }
  return null;
}

/** 자유 텍스트(공고 본문 등)에서 언급된 스킬 키를 모두 찾습니다 */
export function extractSkills(text: string): Set<string> {
  const found = new Set<string>();
  if (!text) return found;
  for (const m of MATCHERS) {
    if (found.has(m.key)) continue;
    if (m.re.test(text)) found.add(m.key);
  }
  // 세부 AWS 서비스가 나오면 AWS 자체도 언급된 것으로 봅니다
  for (const k of found) if (k.startsWith("aws-")) found.add("aws");
  return found;
}

export function normalizeSkillList(list: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of list) {
    const k = normalizeSkill(raw);
    if (k) out.add(k);
    if (k?.startsWith("aws-")) out.add("aws");
  }
  return out;
}
