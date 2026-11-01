"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { CALLOUTS, isCalloutType, nextCalloutType } from "@/lib/callout";

export function CalloutView({ node, updateAttributes }: ReactNodeViewProps) {
  const raw = node.attrs.type as string;
  const type = isCalloutType(raw) ? raw : "note";
  const next = nextCalloutType(type);
  return (
    <NodeViewWrapper as="aside" className="callout" data-type={type}>
      <button
        type="button"
        className="callout-icon"
        contentEditable={false}
        aria-label={`${CALLOUTS[type].label} 콜아웃. 눌러서 ${CALLOUTS[next].label}(으)로 바꾸기`}
        onClick={() => updateAttributes({ type: next })}
      >
        {CALLOUTS[type].icon}
      </button>
      <NodeViewContent className="callout-body" />
    </NodeViewWrapper>
  );
}
