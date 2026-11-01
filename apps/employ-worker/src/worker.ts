import { spawn } from "node:child_process";
import { buildFigmaPrompt, buildResumePrompt, FIGMA_JSON_SCHEMA, FigmaResultSchema, parseClaudeOutput, RESUME_JSON_SCHEMA, ResumeSchema, type ClaimedJob } from "./resume";

export type RunClaude = (args: string[], stdin: string, timeoutMs: number) => Promise<string>;

export interface WorkerApi {
  claim(): Promise<ClaimedJob | null>;
  saveDraft(id: number, content: unknown, model: string | null): Promise<void>;
  finish(id: number, figma: { figmaUrl: string | null; figmaError: string | null }): Promise<void>;
  fail(id: number, error: string): Promise<void>;
}

/** 같은 피그마 서버가 claude.ai 커넥터나 플러그인 중 어느 쪽으로도 잡힐 수 있어 둘 다 허용합니다 */
export const FIGMA_SERVERS = ["mcp__claude_ai_Figma", "mcp__plugin_figma_figma"];

export function draftArgs(model: string) {
  return [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(RESUME_JSON_SCHEMA),
    "--model", model,
    // 스크랩한 공고가 입력이라 어떤 도구도 쓰지 못하게 합니다
    "--tools", "",
    "--strict-mcp-config",
    "--no-session-persistence",
  ];
}

export function figmaArgs(model: string) {
  return [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(FIGMA_JSON_SCHEMA),
    "--model", model,
    // 피그마만 허용합니다. 파일, 셸, 웹 도구는 쓸 수 없습니다.
    // MCP 도구는 ToolSearch로 불러와야 하므로 이것이 빠지면 피그마 도구를 쓸 수 없습니다.
    "--tools", "ToolSearch",
    "--allowedTools", [...FIGMA_SERVERS, "ToolSearch"].join(","),
    "--permission-mode", "dontAsk",
    "--no-session-persistence",
  ];
}

/** 작업 하나를 처리합니다. 피그마가 실패해도 이력서 내용은 남습니다 */
export async function processJob(claimed: ClaimedJob, api: WorkerApi, run: RunClaude, opts: { model: string; figmaFileKey?: string; log?: (m: string) => void }) {
  const log = opts.log ?? (() => {});
  const company = claimed.job.company;
  try {
    log(`#${claimed.id} ${company}: 이력서 작성`);
    const { data, model } = parseClaudeOutput(await run(draftArgs(opts.model), buildResumePrompt(claimed), 10 * 60_000));
    const resume = ResumeSchema.parse(data);
    await api.saveDraft(claimed.id, resume, model);

    if (!opts.figmaFileKey) {
      await api.finish(claimed.id, { figmaUrl: null, figmaError: "FIGMA_FILE_KEY가 설정되지 않았습니다" });
      return;
    }
    try {
      log(`#${claimed.id} ${company}: 피그마 작성`);
      const output = parseClaudeOutput(await run(figmaArgs(opts.model), buildFigmaPrompt(claimed, resume, opts.figmaFileKey), 10 * 60_000));
      const { figmaUrl } = FigmaResultSchema.parse(output.data);
      if (!/^https:\/\/(www\.)?figma\.com\//.test(figmaUrl)) throw new Error(`피그마 주소를 받지 못했습니다. 응답: ${figmaUrl.slice(0, 400)}`);
      await api.finish(claimed.id, { figmaUrl, figmaError: null });
    } catch (e) {
      log(`#${claimed.id} 피그마 실패: ${(e as Error).message}`);
      await api.finish(claimed.id, { figmaUrl: null, figmaError: (e as Error).message.slice(0, 500) });
    }
    log(`#${claimed.id} 완료`);
  } catch (e) {
    log(`#${claimed.id} 실패: ${(e as Error).message}`);
    await api.fail(claimed.id, (e as Error).message);
  }
}

export function createApi(baseUrl: string, token: string): WorkerApi {
  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}/worker${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  const send = async (path: string, body: unknown) => {
    const res = await post(path, body);
    if (!res.ok) throw new Error(`API ${res.status} ${path}`);
  };
  return {
    async claim() {
      const res = await post("/claim", {});
      if (res.status === 204) return null;
      if (!res.ok) throw new Error(`API ${res.status} /claim`);
      return (await res.json()) as ClaimedJob;
    },
    saveDraft: (id, content, model) => send(`/resumes/${id}/draft`, { content, model }),
    finish: (id, figma) => send(`/resumes/${id}/finish`, figma),
    fail: (id, error) => send(`/resumes/${id}/fail`, { error }),
  };
}

export function createRunner(bin: string): RunClaude {
  return (args, stdin, timeoutMs) =>
    new Promise((resolve, reject) => {
      // 셸을 거치지 않으므로 공고 내용이 명령으로 해석되지 않습니다
      const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], timeout: timeoutMs });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", reject);
      child.on("close", (code, signal) => {
        if (code === 0) resolve(out);
        else reject(new Error(signal ? `claude 시간 초과 (${signal})` : `claude 종료 코드 ${code}: ${(err || out).slice(0, 500)}`));
      });
      child.stdin.end(stdin);
    });
}
