import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Comments } from "@/components/Comments";

const fetchMock = vi.fn();

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const fill = () => {
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "reader" } });
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "pass1234" } });
  fireEvent.change(screen.getByLabelText("댓글 내용"), { target: { value: "잘 읽었습니다" } });
  fireEvent.click(screen.getByRole("button", { name: "등록" }));
};

describe("Comments", () => {
  it("adds a comment, remembers only the username", async () => {
    fetchMock.mockResolvedValue(respond(201, { id: 1, body: "잘 읽었습니다", createdAt: "2026-10-01T00:00:00.000Z", username: "reader" }));
    render(<Comments slug="글" initial={[]} />);
    fill();
    await screen.findByText("잘 읽었습니다", { selector: "p" });
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/posts/${encodeURIComponent("글")}/comments`);
    expect(localStorage.getItem("comment-username")).toBe("reader");
    expect(JSON.stringify({ ...localStorage })).not.toContain("pass1234");
  });

  it("shows the server error and keeps the typed text", async () => {
    fetchMock.mockResolvedValue(respond(401, { error: "비밀번호를 확인해 주세요" }));
    render(<Comments slug="a" initial={[]} />);
    fill();
    expect((await screen.findByRole("alert")).textContent).toContain("비밀번호");
    expect((screen.getByLabelText("댓글 내용") as HTMLTextAreaElement).value).toBe("잘 읽었습니다");
  });

  it("renders comment text as plain text, not html", () => {
    render(<Comments slug="a" initial={[{ id: 1, body: "<img src=x onerror=alert(1)>", createdAt: "2026-10-01T00:00:00.000Z", username: "x1" }]} />);
    expect(document.querySelector(".comment img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });

  it("deletes with the comment author's id and the typed password", async () => {
    fetchMock.mockResolvedValue(respond(200, { ok: true }));
    render(<Comments slug="a" initial={[{ id: 7, body: "지울 글", createdAt: "2026-10-01T00:00:00.000Z", username: "writer" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    fireEvent.change(screen.getByLabelText("댓글 비밀번호"), { target: { value: "pw12" } });
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    await waitFor(() => expect(screen.queryByText("지울 글")).toBeNull());
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ username: "writer", password: "pw12" });
  });
});
