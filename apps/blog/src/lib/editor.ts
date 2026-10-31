/** 에디터의 순수 텍스트 조작. 화면과 분리해 테스트합니다 */

export interface Edit {
  value: string;
  start: number;
  end: number;
}

/** 선택 영역을 기호로 감쌉니다. 이미 감싸져 있으면 풉니다 */
export function toggleWrap(value: string, start: number, end: number, mark: string): Edit {
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);
  if (before.endsWith(mark) && after.startsWith(mark)) {
    return {
      value: before.slice(0, -mark.length) + selected + after.slice(mark.length),
      start: start - mark.length,
      end: end - mark.length,
    };
  }
  return { value: before + mark + selected + mark + after, start: start + mark.length, end: end + mark.length };
}

/** 선택 영역을 링크로 만들고 커서를 주소 자리에 둡니다 */
export function insertLink(value: string, start: number, end: number): Edit {
  const text = value.slice(start, end) || "링크";
  const inserted = `[${text}](url)`;
  const urlStart = start + text.length + 3;
  return { value: value.slice(0, start) + inserted + value.slice(end), start: urlStart, end: urlStart + 3 };
}

export interface SlashCommand {
  id: string;
  label: string;
  hint: string;
  /** 줄 전체를 대신할 텍스트 */
  insert: string;
  /** insert 안에서 커서가 놓일 위치. 없으면 끝 */
  cursor?: number;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "h2", label: "제목 2", hint: "##", insert: "## " },
  { id: "h3", label: "제목 3", hint: "###", insert: "### " },
  { id: "ul", label: "목록", hint: "-", insert: "- " },
  { id: "ol", label: "번호 목록", hint: "1.", insert: "1. " },
  { id: "todo", label: "체크리스트", hint: "- [ ]", insert: "- [ ] " },
  { id: "quote", label: "인용", hint: ">", insert: "> " },
  { id: "code", label: "코드 블록", hint: "```", insert: "```ts\n\n```", cursor: 6 },
  { id: "table", label: "표", hint: "| |", insert: "| 항목 | 내용 |\n| --- | --- |\n|  |  |", cursor: 32 },
  { id: "hr", label: "구분선", hint: "---", insert: "---\n" },
];

/** 커서가 있는 줄이 "/검색어" 형태면 검색어를 돌려줍니다 */
export function slashQuery(value: string, cursor: number): { lineStart: number; query: string } | null {
  const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
  const line = value.slice(lineStart, cursor);
  const m = /^\/([^\s/]*)$/.exec(line);
  return m ? { lineStart, query: m[1]!.toLowerCase() } : null;
}

export function filterCommands(query: string): SlashCommand[] {
  if (!query) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.id.includes(query) || c.label.includes(query));
}

export function applySlash(value: string, lineStart: number, cursor: number, cmd: SlashCommand): Edit {
  const next = value.slice(0, lineStart) + cmd.insert + value.slice(cursor);
  const at = lineStart + (cmd.cursor ?? cmd.insert.length);
  return { value: next, start: at, end: at };
}

export const parseTags = (text: string) => [...new Set(text.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 10);
