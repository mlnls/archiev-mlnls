"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { CODE_LANGUAGES } from "@/lib/editor";

export function CodeBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "";
  const known = CODE_LANGUAGES.some(([value]) => value === language);
  return (
    <NodeViewWrapper className="code-block">
      <select
        className="code-lang"
        contentEditable={false}
        aria-label="코드 언어"
        value={language}
        onChange={(e) => updateAttributes({ language: e.target.value || null })}
      >
        {/* 목록에 없는 언어로 쓴 기존 글도 언어가 지워지지 않게 합니다 */}
        {!known && <option value={language}>{language}</option>}
        {CODE_LANGUAGES.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <pre>
        <NodeViewContent<"code"> as="code" className={language ? `hljs language-${language}` : "hljs"} />
      </pre>
    </NodeViewWrapper>
  );
}
