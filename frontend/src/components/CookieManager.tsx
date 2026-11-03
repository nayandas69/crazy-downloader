import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Cookie, X, Upload, ScanSearch, CheckCircle2, ShieldCheck } from "lucide-react";
import {
  detectBrowserCookies,
  getCookieStatus,
  setStoredCookies,
  removeStoredCookies,
  type CookieStatus,
} from "../api/client";

interface Props {
  /** Increment to open the modal, e.g. when the API reports cookies are required. */
  openSignal?: number;
  /** Extra explanation shown above the options. */
  notice?: string;
  /** Called after cookies are saved so the caller can retry the failed request. */
  onSaved?: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "pasted",
  file: "file upload",
  auto: "auto-detect",
};

export default function CookieManager({ openSignal = 0, notice, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CookieStatus>({ has_cookies: false, source: null });
  const [cookiesText, setCookiesText] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const autoRan = useRef(false);

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  // Lock the page behind the sheet and close it with Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const refresh = useCallback(() => {
    setStatus(getCookieStatus());
  }, []);

  const autoDetect = useCallback((): boolean => {
    const detected = detectBrowserCookies();
    if (!detected) return false;
    setStoredCookies(detected, "auto");
    setStatus(getCookieStatus());
    return true;
  }, []);

  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    refresh();
    if (!getCookieStatus().has_cookies) {
      autoDetect();
    }
  }, [refresh, autoDetect]);

  /** Persist cookies locally, then let the caller retry the failed request. */
  const saveCookies = (text: string, source: string, message: string) => {
    setError("");
    try {
      setStoredCookies(text, source);
    } catch {
      setError(
        "This browser could not store the cookies (storage is full). Export only youtube.com cookies and try again."
      );
      return;
    }
    setCookiesText("");
    setStatus(getCookieStatus());
    if (onSaved) {
      setOpen(false);
      onSaved();
    } else {
      setSuccess(message);
    }
  };

  const handleManual = () => {
    if (!cookiesText.trim()) {
      setError("Paste your cookies.txt content first.");
      return;
    }
    saveCookies(cookiesText, "manual", "Cookies saved in your browser.");
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    saveCookies(await file.text(), "file", "cookies.txt loaded.");
  };

  const handleAuto = () => {
    setError("");
    setSuccess("");
    const detected = detectBrowserCookies();
    if (!detected) {
      setError(
        'No YouTube cookies found in this browser tab. Browsers never share youtube.com cookies with other sites, so export them once with a cookies.txt extension (e.g. "Get cookies.txt LOCALLY") — or upload the exported file below — and they are reused automatically.'
      );
      return;
    }
    saveCookies(detected, "auto", "Cookies auto-detected from your browser.");
  };

  const handleRemove = () => {
    setError("");
    setSuccess("");
    removeStoredCookies();
    setStatus(getCookieStatus());
    setSuccess("Cookies removed from your browser.");
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-bold transition-colors ${
          status.has_cookies
            ? "text-emerald-300 hover:text-emerald-200"
            : "text-[#d0c2ff] hover:text-white"
        }`}
      >
        <Cookie className="h-4 w-4" />
        Cookie settings
        {status.has_cookies && <span className="flex h-2 w-2 rounded-full bg-emerald-400" />}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
            <button
              aria-label="Close cookie settings"
              onClick={() => setOpen(false)}
              className="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="cookie-manager-title"
              className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-slate-900 shadow-2xl animate-slide-up sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-2xl"
            >
              {/* Drag affordance — the sheet is anchored to the bottom on phones. */}
              <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-white/15 sm:hidden" />

              <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-3 sm:px-6 sm:pt-5">
                <div className="min-w-0">
                  <h3
                    id="cookie-manager-title"
                    className="flex items-center gap-2 text-lg font-bold"
                  >
                    <Cookie className="h-5 w-5 shrink-0 text-amber-400" />
                    Cookie Manager
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Stored in this browser only — never on our server.
                  </p>
                </div>
                <button
                  aria-label="Close cookie settings"
                  onClick={() => setOpen(false)}
                  className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 sm:px-6">
                {/* Status */}
                <div
                  className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
                    status.has_cookies
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-white/5 text-slate-400"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${status.has_cookies ? "bg-emerald-400" : "bg-slate-500"}`}
                    />
                    <span className="truncate">
                      {status.has_cookies
                        ? `Active — ${SOURCE_LABELS[status.source ?? ""] ?? status.source}`
                        : "No cookies set"}
                    </span>
                  </span>
                  {status.has_cookies && (
                    <button
                      onClick={handleRemove}
                      className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {notice && (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
                    {notice}
                  </div>
                )}

                {/* Upload — the one-tap path on phones */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <h4 className="text-sm font-semibold text-white">Upload cookies.txt</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Export your YouTube cookies with an extension, then pick the file here. It is
                    read on this device only.
                  </p>
                  <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#cbbdff] px-4 py-3 text-sm font-semibold text-[#28213d] transition-colors hover:bg-[#e0d6ff] active:scale-[0.99]">
                    <Upload className="h-4 w-4" />
                    Choose cookies.txt
                    <input
                      type="file"
                      accept=".txt,text/plain"
                      onChange={handleFile}
                      className="sr-only"
                      aria-label="Upload cookies.txt file"
                    />
                  </label>
                </div>

                {/* Paste */}
                <div>
                  <button
                    onClick={() => setShowPaste((value) => !value)}
                    aria-expanded={showPaste}
                    className="flex min-h-11 w-full items-center justify-between rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5"
                  >
                    <span className="flex items-center gap-2">
                      <Cookie className="h-4 w-4" />
                      Paste cookies text instead
                    </span>
                    <span className="text-xs text-slate-500">{showPaste ? "Hide" : "Show"}</span>
                  </button>

                  {/* Kept mounted so pasted text survives toggling. */}
                  <div className={showPaste ? "mt-2" : "hidden"}>
                    <label
                      htmlFor="cookie-text"
                      className="mb-1.5 block text-xs font-medium text-slate-400"
                    >
                      Netscape cookies.txt contents
                    </label>
                    <textarea
                      id="cookie-text"
                      value={cookiesText}
                      onChange={(e) => setCookiesText(e.target.value)}
                      rows={5}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="# Netscape HTTP Cookie File&#10;.youtube.com  TRUE  /  TRUE  1234567890  name  value"
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 font-mono text-xs text-slate-300 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
                    />
                    <button
                      onClick={handleManual}
                      className="btn-primary mt-2 min-h-11 w-full text-sm"
                    >
                      <Upload className="h-4 w-4" />
                      Save Cookies
                    </button>
                  </div>
                </div>

                {/* Auto-detect */}
                <div>
                  <button onClick={handleAuto} className="btn-ghost min-h-11 w-full text-sm">
                    <ScanSearch className="h-4 w-4" />
                    Auto-detect browser cookies
                  </button>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                    Browsers keep youtube.com cookies private, so this rarely finds them — the
                    upload above is the reliable path.
                  </p>
                </div>

                <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-[11px] leading-relaxed text-blue-300/80">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                  <p>
                    Cookies are sent only with your own download requests and are never saved on the
                    server. Clearing this browser&apos;s data removes them permanently.
                  </p>
                </div>

                <p className="text-[11px] leading-relaxed text-slate-500">
                  On a phone, install the{" "}
                  <a
                    href="https://github.com/nayandas69/crazy-downloader/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#cbbdff] underline underline-offset-2 hover:text-white"
                  >
                    YouTube Cookies Exporter extension
                  </a>{" "}
                  in a browser that supports extensions; it writes the file for you.
                </p>

                {success && (
                  <p className="flex items-center gap-2 text-sm text-emerald-400 animate-fade-in">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {success}
                  </p>
                )}
                {error && (
                  <p className="text-sm leading-relaxed text-red-400 animate-fade-in">{error}</p>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
