import { useState } from "react";
import { AlertCircle, Check, Film, Youtube } from "lucide-react";
import UrlInput from "../components/UrlInput";
import FormatList from "../components/FormatList";
import CookieManager from "../components/CookieManager";
import HowItWorks from "../components/HowItWorks";
import AdSection from "../components/AdSection";
import { api, needsCookies, type VideoInfo } from "../api/client";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [activeUrl, setActiveUrl] = useState("");
  const [cookieSignal, setCookieSignal] = useState(0);
  const [cookieNotice, setCookieNotice] = useState("");
  const [pendingCookieUrl, setPendingCookieUrl] = useState("");

  const promptForCookies = (url: string, message: string) => {
    setPendingCookieUrl(url);
    setCookieNotice(message);
    setCookieSignal((count) => count + 1);
  };

  const handleSearch = async (url: string, promptForCookiesEnabled = true) => {
    setLoading(true);
    setError("");
    setVideoInfo(null);
    setActiveUrl(url);
    try {
      const info = await api.getFormats(url);
      if (info.formats.length === 0) setError("No downloadable formats found for this video.");
      else setVideoInfo(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to extract formats.");
      // YouTube needs a signed-in session: open the cookie prompt so one save fixes it.
      if (promptForCookiesEnabled && needsCookies(e)) {
        promptForCookies(url, e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCookiesSaved = () => {
    setCookieNotice("");
    const url = pendingCookieUrl;
    setPendingCookieUrl("");
    if (url) void handleSearch(url, false);
  };

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <section className="hero-entry mx-auto max-w-3xl pt-12 text-center sm:pt-16">
        <div className="inline-flex items-center gap-2 rounded-lg bg-[#35304c] px-3 py-2 text-xs font-bold text-[#dfd6ff]">
          <Youtube className="h-4 w-4" /> Made for YouTube
        </div>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-[#f9f7ff] sm:text-5xl">
          Your videos, ready to go.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#b4b2c6] sm:text-base">
          Paste a link, choose your quality, and save it to your device.
        </p>
        <div className="mt-8 text-left">
          <div className="mb-2 flex items-center justify-between text-sm">
            <label htmlFor="youtube-url" className="font-bold">
              YouTube video link
            </label>
            <span className="hidden text-xs text-[#b4b2c6] sm:inline">
              Supports youtube.com and youtu.be
            </span>
          </div>
          <UrlInput onSubmit={handleSearch} loading={loading} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[#b4b2c6]">
            <span>No account needed. Your files aren't stored on the server.</span>
            <CookieManager
              openSignal={cookieSignal}
              notice={cookieNotice}
              onSaved={handleCookiesSaved}
            />
          </div>
        </div>
      </section>
      <div role="status" aria-live="polite" className="sr-only">
        {loading
          ? "Getting available formats…"
          : videoInfo
            ? `Formats available for ${videoInfo.title}.`
            : ""}
      </div>
      <section className="mx-auto mt-12 max-w-5xl" aria-busy={loading}>
        {error ? (
          <div
            role="alert"
            className="flex gap-3 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200"
          >
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <strong>Could not get formats</strong>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        ) : videoInfo ? (
          <FormatList
            info={videoInfo}
            url={activeUrl}
            onNeedsCookies={(message) => promptForCookies(activeUrl, message)}
          />
        ) : (
          <>
            <h2 className="text-lg font-bold">Choose your format</h2>
            <p className="mt-1 text-sm text-[#b4b2c6]">
              Video and audio options appear here after you paste a link.
            </p>
            <div className="mt-4 flex min-h-44 flex-col items-center justify-center rounded-2xl border border-[#424359] bg-[#22243b] px-6 py-10 text-center">
              <div className="rounded-xl bg-[#403c59] p-3 text-[#d7caff]">
                <Film className="h-6 w-6" />
              </div>
              <p className="mt-4 font-semibold">
                {loading ? "Getting available formats…" : "Your video will appear here"}
              </p>
              <p className="mt-1 text-sm text-[#b4b2c6]">
                {loading ? "This may take a moment." : "Enter a YouTube link above to get started."}
              </p>
            </div>
          </>
        )}
        <div className="mt-7 flex flex-wrap gap-x-8 gap-y-3 text-xs text-[#c0bdd0]">
          {["Video and audio formats", "Live download progress", "No server storage"].map(
            (item) => (
              <span key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[#cbbdff]" />
                {item}
              </span>
            )
          )}
        </div>
        {!loading && !videoInfo && !error && <AdSection />}
      </section>
      <div className="mx-auto max-w-5xl">
        <HowItWorks />
      </div>
    </div>
  );
}
