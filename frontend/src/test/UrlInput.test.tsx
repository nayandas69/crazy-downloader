import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UrlInput, { normalizeYouTubeUrl } from "../components/UrlInput";

// ── normalizeYouTubeUrl (issue #2) ──────────────────────────

describe("normalizeYouTubeUrl", () => {
  it("adds https:// to a scheme-less watch link", () => {
    expect(normalizeYouTubeUrl("www.youtube.com/watch?v=BPZkZpGMpXA")).toBe(
      "https://www.youtube.com/watch?v=BPZkZpGMpXA"
    );
  });

  it("adds https:// to scheme-less short, mobile and bare hosts", () => {
    expect(normalizeYouTubeUrl("youtu.be/BPZkZpGMpXA")).toBe("https://youtu.be/BPZkZpGMpXA");
    expect(normalizeYouTubeUrl("m.youtube.com/watch?v=BPZkZpGMpXA")).toBe(
      "https://m.youtube.com/watch?v=BPZkZpGMpXA"
    );
    expect(normalizeYouTubeUrl("youtube.com/watch?v=BPZkZpGMpXA")).toBe(
      "https://youtube.com/watch?v=BPZkZpGMpXA"
    );
  });

  it("keeps an existing scheme and trims surrounding whitespace", () => {
    expect(normalizeYouTubeUrl("  https://youtu.be/BPZkZpGMpXA  ")).toBe(
      "https://youtu.be/BPZkZpGMpXA"
    );
    expect(normalizeYouTubeUrl("http://www.youtube.com/watch?v=BPZkZpGMpXA")).toBe(
      "http://www.youtube.com/watch?v=BPZkZpGMpXA"
    );
  });
});

// ── UrlInput submission ─────────────────────────────────────

describe("UrlInput", () => {
  it("submits a scheme-less link with https:// so the API accepts it", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<UrlInput onSubmit={onSubmit} loading={false} />);

    await user.type(screen.getByRole("textbox"), "www.youtube.com/watch?v=BPZkZpGMpXA");
    await user.click(screen.getByRole("button", { name: /get formats/i }));

    expect(onSubmit).toHaveBeenCalledWith("https://www.youtube.com/watch?v=BPZkZpGMpXA");
  });

  it("submits a protocol-relative link with https://", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<UrlInput onSubmit={onSubmit} loading={false} />);

    await user.type(screen.getByRole("textbox"), "  //youtu.be/BPZkZpGMpXA  ");
    await user.click(screen.getByRole("button", { name: /get formats/i }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("https://youtu.be/BPZkZpGMpXA");
    expect(
      screen.queryByText("That doesn't look like a valid YouTube URL.")
    ).not.toBeInTheDocument();
  });

  it.each([
    "example.com/video",
    "ftp://youtube.com/watch?v=BPZkZpGMpXA",
    "///youtube.com/watch?v=BPZkZpGMpXA",
  ])("still rejects an invalid link: %s", async (url) => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<UrlInput onSubmit={onSubmit} loading={false} />);

    await user.type(screen.getByRole("textbox"), url);
    await user.click(screen.getByRole("button", { name: /get formats/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("That doesn't look like a valid YouTube URL.")).toBeInTheDocument();
  });
});
