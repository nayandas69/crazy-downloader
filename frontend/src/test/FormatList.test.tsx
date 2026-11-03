import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import FormatList from "../components/FormatList";
import type { VideoInfo } from "../api/client";

const info: VideoInfo = {
  title: "Example",
  thumbnail: null,
  duration: null,
  uploader: null,
  view_count: null,
  formats: [
    {
      format_id: "v",
      ext: "mp4",
      resolution: null,
      width: null,
      height: 1080,
      fps: null,
      vcodec: "h264",
      acodec: "aac",
      filesize: 100,
      filesize_approx: null,
      tbr: null,
      format_note: null,
      category: "video_audio",
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("download announcements", () => {
  it("announces cancellation and stops periodic updates", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError"))
            );
          })
      )
    );
    render(<FormatList info={info} url="https://youtu.be/example" />);
    const status = screen.getByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "Download 1080p mp4" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel download" }));
    });
    expect(status).toHaveTextContent("download canceled");
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(status).toHaveTextContent("download canceled");
  });

  it("announces download errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));
    render(<FormatList info={info} url="https://youtu.be/example" />);
    const status = screen.getByRole("status");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download 1080p mp4" }));
    });
    expect(status).toHaveTextContent("download failed: Network unavailable");
  });

  it("hands cookie rejections to the cookie manager instead of failing silently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: { code: "cookies_rejected", message: "Re-export your cookies." },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const onNeedsCookies = vi.fn();
    render(
      <FormatList info={info} url="https://youtu.be/example" onNeedsCookies={onNeedsCookies} />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download 1080p mp4" }));
    });
    expect(onNeedsCookies).toHaveBeenCalledWith("Re-export your cookies.");
    expect(screen.queryByRole("button", { name: "Cancel download" })).not.toBeInTheDocument();
  });

  it("announces progress at intervals while visual progress updates and reports completion", async () => {
    vi.useFakeTimers();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(stream, { headers: { "Content-Length": "100" } }))
    );
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() })
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<FormatList info={info} url="https://youtu.be/example" />);
    const status = screen.getByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "Download 1080p mp4" }));
    expect(status).toHaveTextContent("1080p mp4 download started.");
    await act(async () => {
      controller.enqueue(new Uint8Array(20));
      await Promise.resolve();
    });
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(status).toHaveTextContent("download started");
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(status).toHaveTextContent("20% complete");
    await act(async () => {
      controller.close();
      await Promise.resolve();
    });
    expect(status).toHaveTextContent("download complete");
    expect(screen.getByText("Downloaded")).toBeInTheDocument();
  });
});
