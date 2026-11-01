/** 콜아웃 종류. 본문에는 > [!tip] 처럼 저장합니다 */
export const CALLOUTS = {
  note: { icon: "💡", label: "메모" },
  tip: { icon: "✅", label: "팁" },
  warning: { icon: "⚠️", label: "주의" },
  danger: { icon: "🚨", label: "위험" },
} as const;

export type CalloutType = keyof typeof CALLOUTS;

export const CALLOUT_TYPES = Object.keys(CALLOUTS) as CalloutType[];

export const isCalloutType = (value: string): value is CalloutType => Object.hasOwn(CALLOUTS, value);

/** 아이콘을 누를 때마다 다음 종류로 바꿉니다 */
export const nextCalloutType = (type: CalloutType): CalloutType => CALLOUT_TYPES[(CALLOUT_TYPES.indexOf(type) + 1) % CALLOUT_TYPES.length]!;
