import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Login } from "../src/App";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Login", () => {
  it("shows the server error and does not log in", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "아이디 또는 비밀번호가 맞지 않습니다" }), { status: 401 }));
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "y" } });
    fireEvent.click(screen.getByRole("button", { name: "들어가기" }));
    expect((await screen.findByRole("alert")).textContent).toBe("아이디 또는 비밀번호가 맞지 않습니다");
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("logs in on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "y" } });
    fireEvent.click(screen.getByRole("button", { name: "들어가기" }));
    await waitFor(() => expect(onLogin).toHaveBeenCalled());
  });
});
