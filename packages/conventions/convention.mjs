// 커밋과 PR 제목 규칙. husky와 CI가 이 파일 하나를 함께 씁니다.
// 의존성 없이 돌아가야 하므로 Node 기본 기능만 씁니다.

export const SCOPES = ["BLOG", "CV", "EMPLOY", "API", "COMMON"];
export const TYPES = ["feature", "fix", "refactor", "style", "docs", "test", "chore", "ci", "perf"];

const TITLE = new RegExp(`^\\[(${SCOPES.join("|")})/(${TYPES.join("|")})\\] \\S.*$`);

const FOLDER_SCOPES = [
  ["apps/blog/", "BLOG"],
  ["apps/cv/", "CV"],
  ["apps/employ/", "EMPLOY"],
  ["apps/employ-worker/", "EMPLOY"],
  ["apps/api/", "API"],
];

export function scopeOfFile(file) {
  return FOLDER_SCOPES.find(([prefix]) => file.startsWith(prefix))?.[1] ?? "COMMON";
}

/** 한 앱 폴더만 고쳤으면 그 앱, 둘 이상이거나 공용 파일을 고쳤으면 COMMON */
export function expectedScope(files) {
  const scopes = new Set(files.map(scopeOfFile));
  if (scopes.size === 1) return [...scopes][0];
  return "COMMON";
}

/** 문제가 없으면 null, 있으면 고칠 방법을 담은 메시지를 돌려줍니다 */
export function checkTitle(title, files) {
  const line = title.split("\n")[0].trim();
  const match = TITLE.exec(line);
  if (!match) {
    return `형식이 맞지 않습니다: "${line}"\n  형식: [${SCOPES.join("|")}/${TYPES.join("|")}] 내용\n  예시: [BLOG/feature] 댓글 삭제 추가`;
  }
  if (!files.length) return null;
  const expected = expectedScope(files);
  if (match[1] !== expected) {
    return `범위가 고친 파일과 맞지 않습니다: [${match[1]}] → [${expected}]\n  앱 폴더 하나만 고치면 그 앱, 둘 이상이거나 공용 파일을 고치면 COMMON입니다.`;
  }
  return null;
}

/** git이 자동으로 만드는 메시지는 검사하지 않습니다 */
export const isAutoMessage = (message) => /^(Merge |Revert "|fixup! |squash! )/.test(message);

// 문자열을 나눠 적어 이 파일 자체가 검사에 걸리지 않게 합니다
const SECRET_PATTERNS = [
  ["개인 키", new RegExp("-----BEGIN [A-Z ]*" + "PRIVATE KEY-----")],
  ["AWS 액세스 키", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub 토큰", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ["Anthropic 키", new RegExp("\\bsk-" + "ant-[A-Za-z0-9_-]{20,}")],
  ["Figma 토큰", new RegExp("\\bfig" + "d_[A-Za-z0-9_-]{20,}")],
  ["Slack 토큰", /\bxox[abpr]-[A-Za-z0-9-]{10,}/],
  ["비밀번호 해시", new RegExp("scrypt\\$" + "[0-9a-f]{32}\\$[0-9a-f]{64,}")],
];

const FORBIDDEN_FILES = [/(^|\/)\.env$/, /(^|\/)\.env\.(?!example$)[^/]+$/, /\.pem$/, /\.key$/, /(^|\/)id_(rsa|ed25519)/, /(^|\/)profile\.local\.json$/, /(^|\/)worker\.env$/];

export const isForbiddenFile = (file) => FORBIDDEN_FILES.some((re) => re.test(file));

export function findSecret(text) {
  return SECRET_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? null;
}
