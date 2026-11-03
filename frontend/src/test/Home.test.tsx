import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "../pages/Home";
import { ApiError, api, type VideoInfo } from "../api/client";

const info: VideoInfo = {
  title: "Example video",
  thumbnail: null,
  duration: 60,
  uploader: "Creator",
  view_count: 10,
  formats: [
    {
      format_id: "v",
      ext: "mp4",
      resolution: "1920x1080",
      width: 1920,
      height: 1080,
      fps: 30,
      vcodec: "h264",
      acodec: "aac",
      filesize: 1000,
      filesize_approx: null,
      tbr: null,
      format_note: "1080p",
      category: "video_audio",
    },
    {
      format_id: "a",
      ext: "m4a",
      resolution: null,
      width: null,
      height: null,
      fps: null,
      vcodec: null,
      acodec: "aac",
      filesize: 500,
      filesize_approx: null,
      tbr: 128,
      format_note: null,
      category: "audio_only",
    },
  ],
};
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
describe("download flow", () => {
  it("validates a link and displays returned video and audio formats", async () => {
    const getFormats = vi.spyOn(api, "getFormats").mockResolvedValue(info);
    const user = userEvent.setup();
    render(<Home />);
    await user.click(screen.getByRole("button", { name: /get formats/i }));
    expect(screen.getByText("Please paste a YouTube URL.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("YouTube video link"), "https://youtu.be/example");
    await user.click(screen.getByRole("button", { name: /get formats/i }));
    expect(await screen.findByText("Example video")).toBeInTheDocument();
    expect(screen.getByText("Video + audio")).toBeInTheDocument();
    expect(screen.getByText("Audio only")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /download/i })).toHaveLength(2);
    expect(getFormats).toHaveBeenCalledWith("https://youtu.be/example");
  });
  it("announces loading outside the busy section and keeps help available", async () => {
    let finish!: (value: VideoInfo) => void;
    vi.spyOn(api, "getFormats").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const user = userEvent.setup();
    render(<Home />);
    const help = document.getElementById("how-it-works");
    expect(help).toBeVisible();
    await user.type(screen.getByLabelText("YouTube video link"), "https://youtu.be/example");
    await user.click(screen.getByRole("button", { name: /get formats/i }));
    const busy = document.querySelector('[aria-busy="true"]');
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Getting available formats");
    expect(busy).not.toContainElement(status);
    expect(help).toBeVisible();
    expect(screen.queryByRole("region", { name: "Sponsored" })).not.toBeInTheDocument();
    await act(async () => finish(info));
    expect(status).toHaveTextContent("Formats available for Example video");
    expect(help).toBe(document.getElementById("how-it-works"));
    expect(help).toBeVisible();
    expect(busy).toHaveAttribute("aria-busy", "false");
  });
  it("shows an extraction error", async () => {
    vi.spyOn(api, "getFormats").mockRejectedValue(new Error("Video unavailable"));
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByLabelText("YouTube video link"), "https://youtu.be/example");
    await user.click(screen.getByRole("button", { name: /get formats/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Video unavailable");
    expect(document.getElementById("how-it-works")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Sponsored" })).not.toBeInTheDocument();
  });
});

describe("cookies", () => {
  it("opens the cookie manager when YouTube asks for verification", async () => {
    vi.spyOn(api, "getFormats").mockRejectedValue(
      new ApiError("YouTube asked us to confirm you're not a bot.", "cookies_required")
    );
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByLabelText("YouTube video link"), "https://youtu.be/example");
    await user.click(screen.getByRole("button", { name: /get formats/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("confirm you're not a bot");
    expect(await screen.findByText("Cookie Manager")).toBeInTheDocument();
  });

  it("retries the failed video once cookies are saved", async () => {
    const getFormats = vi
      .spyOn(api, "getFormats")
      .mockRejectedValueOnce(new ApiError("YouTube needs cookies.", "cookies_required"))
      .mockResolvedValueOnce(info);
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByLabelText("YouTube video link"), "https://youtu.be/example");
    await user.click(screen.getByRole("button", { name: /get formats/i }));
    await screen.findByText("Cookie Manager");

    await user.click(screen.getByRole("button", { name: /paste cookies text instead/i }));
    fireEvent.change(screen.getByPlaceholderText(/Netscape HTTP Cookie File/), {
      target: { value: ".youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc" },
    });
    await user.click(screen.getByRole("button", { name: /save cookies/i }));

    expect(await screen.findByText("Example video")).toBeInTheDocument();
    expect(getFormats).toHaveBeenCalledTimes(2);
  });
});
