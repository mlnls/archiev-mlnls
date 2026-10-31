import { defineConfig } from "vitest/config";

// PGlite(WASM) 초기화는 병렬 실행 시 몇 초 걸릴 수 있어 여유를 둡니다
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 60_000 },
});
