import { describe, expect, it } from "vitest";
import { extOf, formatBytes, groupByMonth } from "../src/lib";
import type { Item } from "../src/types";

const item = (id: string, takenAt: number): Item => ({ id, name: `${id}.jpg`, type: "image/jpeg", kind: "image", size: 1, takenAt, uploadedAt: takenAt, memo: "", thumb: false });

describe("lib", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(1536)).toBe("1.5KB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0GB");
  });

  it("groups by Korean month in order", () => {
    const groups = groupByMonth([item("a", Date.UTC(2026, 10, 3)), item("b", Date.UTC(2026, 10, 1)), item("c", Date.UTC(2026, 9, 20))]);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["2026년 11월", 2],
      ["2026년 10월", 1],
    ]);
  });

  it("reads extensions", () => {
    expect(extOf("IMG_0001.heic")).toBe("HEIC");
    expect(extOf("noext")).toBe("");
  });
});
