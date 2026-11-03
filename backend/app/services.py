"""yt-dlp wrapper service — format extraction and streamed downloads."""

from __future__ import annotations

import asyncio
import hashlib
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Any

from yt_dlp import YoutubeDL

# ── In-memory format cache (no persistent storage) ──
_format_cache: dict[str, tuple[dict[str, Any], float]] = {}
_CACHE_TTL = 300  # 5 minutes


def cache_key(url: str, cookies_text: str | None = None) -> str:
    """Cache key that keeps signed-in results apart from anonymous ones.

    The media URLs yt-dlp returns are minted for the session that asked for
    them, so reusing an anonymous result for a request that carries cookies
    (or a result from an older cookie set) hands out URLs YouTube no longer
    accepts — which then looks like "cookies rejected" even though the current
    cookies are fine.
    """
    if not cookies_text or not cookies_text.strip():
        return "anon:" + url
    digest = hashlib.sha256(cookies_text.encode("utf-8")).hexdigest()[:16]
    return f"auth:{digest}:{url}"


def cache_get(key: str) -> dict[str, Any] | None:
    """Return cached info dict if still fresh, else None."""
    entry = _format_cache.get(key)
    if entry and time.time() - entry[1] < _CACHE_TTL:
        return entry[0]
    if entry:
        del _format_cache[key]
    return None


def cache_set(key: str, info: dict[str, Any]) -> None:
    _format_cache[key] = (info, time.time())
    expired = [k for k, v in _format_cache.items() if time.time() - v[1] > _CACHE_TTL]
    for k in expired:
        del _format_cache[k]


_COOKIES_HEADER = "# Netscape HTTP Cookie File"

# `#` starts a comment in the Netscape format — except `#HttpOnly_`, which
# prefixes a real cookie line.
_HTTPONLY_PREFIX = "#HttpOnly_"

# yt-dlp errors that a signed-in cookie set resolves.
_COOKIE_REQUIRED_PATTERNS = (
    "sign in to confirm",
    "use --cookies",
    "cookies-from-browser",
    "login required",
    "confirm your age",
    "age-restricted",
    "private video",
    "members-only",
    "requires payment",
    # YouTube returns this player response when the request (or its cookies)
    # fails the bot check. It is the error users hit most often.
    "the page needs to be reloaded",
    "please sign in",
    "not a bot",
)


class CookiesError(ValueError):
    """Raised when supplied cookies are not a usable Netscape cookies file."""


def normalize_cookies(cookies_text: str) -> str:
    """Return cookies text in the Netscape format yt-dlp accepts.

    Exports produced on Windows use CRLF newlines, and some exports omit the
    header line yt-dlp requires; either makes yt-dlp fail with HTTP 400.
    Raises CookiesError when no usable cookie line is present.
    """
    text = cookies_text.replace("\ufeff", "").replace("\r\n", "\n").replace("\r", "\n")
    # Keep `#HttpOnly_` lines: browsers mark the signed-in session cookies
    # (SID, HSID, SSID, LOGIN_INFO, __Secure-*PSID, …) that way, and they are
    # the only reason yt-dlp can get past YouTube's bot check.
    cookie_lines = [
        line
        for line in text.split("\n")
        if line.strip() and (line.startswith(_HTTPONLY_PREFIX) or not line.lstrip().startswith("#"))
    ]
    if not cookie_lines:
        raise CookiesError("The cookies text contains no cookies.")
    for line in cookie_lines:
        if len(line.split("\t")) != 7:
            raise CookiesError(
                "Cookies must be in Netscape cookies.txt format "
                "(7 tab-separated fields per line). Export them with a cookies.txt "
                "browser extension and paste the file contents."
            )
    return "\n".join([_COOKIES_HEADER, "", *cookie_lines, ""])


def is_cookies_required_error(exc: BaseException) -> bool:
    """True when yt-dlp failed because the extractor wants a signed-in session."""
    message = str(exc).lower()
    return any(pattern in message for pattern in _COOKIE_REQUIRED_PATTERNS)


_ERROR_PREFIX_RE = re.compile(r"^ERROR:\s*", re.IGNORECASE)
_EXTRACTOR_PREFIX_RE = re.compile(r"^\[youtube\]\s*[\w-]+:\s*", re.IGNORECASE)


def error_reason(exc: BaseException) -> str:
    """The first line of a yt-dlp error, without its `ERROR: [youtube] <id>:` prefix.

    Surfacing YouTube's own words is what tells the user whether the video is
    unavailable, geo-blocked, or actually waiting on a signed-in session.
    """
    message = _ERROR_PREFIX_RE.sub("", str(exc).strip())
    message = _EXTRACTOR_PREFIX_RE.sub("", message)
    return (message.splitlines()[0] if message else "").strip()[:200]


def build_cookie_header(cookies_text: str | None) -> str | None:
    """Build a `Cookie` request header from Netscape cookies text.

    yt-dlp only uses the cookie file while extracting; the media URLs it
    returns are then fetched by us. For age-restricted or bot-checked videos
    those streams can require the same signed-in cookies.
    """
    if not cookies_text or not cookies_text.strip():
        return None
    try:
        text = normalize_cookies(cookies_text)
    except CookiesError:
        return None

    now = time.time()
    pairs: list[str] = []
    for line in text.split("\n"):
        if not line.strip():
            continue
        if line.startswith("#") and not line.startswith(_HTTPONLY_PREFIX):
            continue
        parts = line.split("\t")
        if len(parts) != 7:
            continue
        domain, _, _, _, expires, name, value = parts
        domain = domain.removeprefix(_HTTPONLY_PREFIX).lower()
        if not (
            domain == "youtube.com"
            or domain.endswith(".youtube.com")
            or domain.endswith(".google.com")
            or domain.endswith(".googlevideo.com")
        ):
            continue
        try:
            if float(expires) > 0 and float(expires) < now:
                continue
        except ValueError:
            pass
        pairs.append(f"{name}={value}")
    return "; ".join(pairs) or None


def _write_temp_cookies(cookies_text: str) -> str | None:
    """Write normalized cookies to a temporary file and return its path.

    The caller is responsible for deleting the file after use.
    Returns None if cookies_text is empty.
    """
    if not cookies_text or not cookies_text.strip():
        return None
    fd, path = tempfile.mkstemp(suffix=".txt", prefix="cdl_cookies_")
    try:
        os.write(fd, normalize_cookies(cookies_text).encode("utf-8"))
    finally:
        os.close(fd)
    return path


def _ydl_opts(cookies_path: str | None = None) -> dict[str, Any]:
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "nocheckcertificate": True,
        "noplaylist": True,
        "retries": 1,
    }
    if cookies_path:
        opts["cookiefile"] = cookies_path
    return opts


def _extract_info_sync(url: str, cookies_path: str | None = None) -> dict[str, Any]:
    with YoutubeDL(_ydl_opts(cookies_path)) as ydl:
        return ydl.extract_info(url, download=False)


async def _extract_anonymously(url: str) -> dict[str, Any]:
    """Extract without cookies, retrying once on YouTube's intermittent block.

    "The page needs to be reloaded" comes back from a fresh player response
    often enough that a second attempt succeeds, and a blocked client cannot
    be fixed by playing with request options.
    """
    try:
        return await asyncio.to_thread(_extract_info_sync, url, None)
    except Exception as exc:  # noqa: BLE001 - retried once, then re-raised
        if not is_cookies_required_error(exc):
            raise
        return await asyncio.to_thread(_extract_info_sync, url, None)


async def extract_info(url: str, cookies_text: str | None = None) -> dict[str, Any]:
    """Run yt-dlp extraction in a thread to avoid blocking the event loop.

    Cookies text (if provided) is written to a temporary file, used for the
    extraction, then immediately deleted. Cookies are never persisted on the server.

    Stale or foreign-IP cookies make YouTube answer with "The page needs to be
    reloaded" even for public videos, so a cookie attempt that fails is retried
    without cookies — expired cookies must never hide a video that downloads
    fine anonymously.
    """
    cookies_path = _write_temp_cookies(cookies_text) if cookies_text else None
    try:
        if cookies_path:
            try:
                return await asyncio.to_thread(_extract_info_sync, url, cookies_path)
            except Exception as cookie_error:  # noqa: BLE001 - retried anonymously
                try:
                    return await _extract_anonymously(url)
                except Exception as anonymous_error:
                    # Only blame the cookies when the failure is actually about
                    # a signed-in session. An "unavailable"/geo-blocked video
                    # fails the same way with and without cookies, and telling
                    # the user to re-export them would be wrong.
                    if is_cookies_required_error(cookie_error):
                        raise cookie_error from anonymous_error
                    raise anonymous_error from cookie_error
        return await _extract_anonymously(url)
    finally:
        if cookies_path:
            Path(cookies_path).unlink(missing_ok=True)


def categorize_format(fmt: dict[str, Any]) -> str | None:
    """Return 'video_audio', 'video_only', 'audio_only', or None to skip."""
    vcodec = (fmt.get("vcodec") or "none").lower()
    acodec = (fmt.get("acodec") or "none").lower()
    if vcodec == "none" and acodec == "none":
        return None
    if vcodec != "none" and acodec != "none":
        return "video_audio"
    if vcodec != "none":
        return "video_only"
    return "audio_only"


def _is_hls_format(fmt: dict[str, Any]) -> bool:
    """Return True for HLS/adaptive streaming formats (.m3u8) that can't be downloaded directly."""
    ext = (fmt.get("ext") or "").lower()
    protocol = (fmt.get("protocol") or "").lower()
    return "m3u8" in ext or "m3u8" in protocol


def parse_formats(info: dict[str, Any]) -> list[dict[str, Any]]:
    formats: list[dict[str, Any]] = []
    for f in info.get("formats", []):
        if _is_hls_format(f):
            continue
        category = categorize_format(f)
        if category is None:
            continue
        formats.append(
            {
                "format_id": f.get("format_id", ""),
                "ext": f.get("ext", ""),
                "resolution": f.get("resolution"),
                "width": f.get("width"),
                "height": f.get("height"),
                "fps": f.get("fps"),
                "vcodec": f.get("vcodec"),
                "acodec": f.get("acodec"),
                "filesize": f.get("filesize"),
                "filesize_approx": f.get("filesize_approx") or f.get("filesize"),
                "tbr": f.get("tbr"),
                "format_note": f.get("format_note"),
                "category": category,
            }
        )
    return formats


def find_best_audio(info: dict[str, Any]) -> dict[str, Any] | None:
    """Find the highest-quality audio-only format for merging."""
    best: dict[str, Any] | None = None
    best_tbr = 0.0
    for f in info.get("formats", []):
        if categorize_format(f) != "audio_only":
            continue
        tbr = f.get("tbr") or f.get("abr") or 0
        if tbr >= best_tbr:
            best = f
            best_tbr = tbr
    return best


def find_format(info: dict[str, Any], format_id: str) -> dict[str, Any] | None:
    for f in info.get("formats", []):
        if str(f.get("format_id")) == str(format_id):
            return f
    return None


def sanitize_title(title: str) -> str:
    """Make a string safe for use as a download filename."""
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", title)
    safe = re.sub(r"\s+", " ", safe).strip()
    return safe[:120] or "download"
