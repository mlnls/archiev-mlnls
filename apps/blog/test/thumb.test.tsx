import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Thumb } from "@/components/Thumb";

afterEach(cleanup);

describe("Thumb", () => {
  it("shows the cover until it fails, then leaves the slot empty", () => {
    const { container } = render(<Thumb src="/api/uploads/missing.jpg" eager={false} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("lazy");
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
  });
});
