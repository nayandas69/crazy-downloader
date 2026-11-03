"""Tests for pure service functions (no network calls)."""

from pathlib import Path

import pytest

from app import services
from app.services import (
    CookiesError,
    _is_hls_format,
    categorize_format,
    find_best_audio,
    find_format,
    is_cookies_required_error,
    normalize_cookies,
    sanitize_title,
)

# ── sanitize_title ──────────────────────────────────────────


def test_sanitize_title_basic():
    assert sanitize_title("My Video Title") == "My Video Title"


def test_sanitize_title_strips_unsafe_chars():
    assert sanitize_title('file<>:"/\\|?*name') == "file_________name"


def test_sanitize_title_collapses_whitespace():
    assert sanitize_title("  multiple   spaces  ") == "multiple spaces"


def test_sanitize_title_truncates():
    long = "A" * 200
    assert len(sanitize_title(long)) == 120


def test_sanitize_title_empty_fallback():
    assert sanitize_title("") == "download"


# ── categorize_format ───────────────────────────────────────


def test_categorize_video_audio():
    assert categorize_format({"vcodec": "h264", "acodec": "mp4a"}) == "video_audio"


def test_categorize_video_only():
    assert categorize_format({"vcodec": "vp9", "acodec": "none"}) == "video_only"


def test_categorize_audio_only():
    assert categorize_format({"vcodec": "none", "acodec": "mp4a"}) == "audio_only"


def test_categorize_skips_no_codecs():
    assert categorize_format({"vcodec": "none", "acodec": "none"}) is None


# ── _is_hls_format ──────────────────────────────────────────


def test_is_hls_by_protocol():
    assert _is_hls_format({"ext": "mp4", "protocol": "m3u8_native"}) is True


def test_is_hls_by_ext():
    assert _is_hls_format({"ext": "m3u8", "protocol": "http"}) is True


def test_is_not_hls():
    assert _is_hls_format({"ext": "mp4", "protocol": "https"}) is False


# ── find_format ─────────────────────────────────────────────


def test_find_format_match():
    formats = [{"format_id": "22"}, {"format_id": "18"}]
    assert find_format({"formats": formats}, "18") == {"format_id": "18"}


def test_find_format_no_match():
    assert find_format({"formats": [{"format_id": "22"}]}, "99") is None


# ── find_best_audio ─────────────────────────────────────────


def test_find_best_audio():
    formats = [
        {"vcodec": "none", "acodec": "mp4a", "tbr": 48},
        {"vcodec": "none", "acodec": "mp4a", "tbr": 160},
        {"vcodec": "none", "acodec": "mp4a", "tbr": 128},
    ]
    best = find_best_audio({"formats": formats})
    assert best is not None
    assert best["tbr"] == 160


def test_find_best_audio_none():
    assert find_best_audio({"formats": [{"vcodec": "h264", "acodec": "mp4a"}]}) is None


# ── cache ───────────────────────────────────────────────────


def test_cache_set_and_get():
    from app.services import cache_get, cache_set

    cache_set("https://example.com", {"title": "test"})
    assert cache_get("https://example.com") == {"title": "test"}


def test_cache_miss():
    from app.services import cache_get

    assert cache_get("https://nonexistent.com") is None


# ── cookies ─────────────────────────────────────────────────


def test_normalize_cookies_adds_required_header():
    text = ".youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc"
    assert normalize_cookies(text) == "# Netscape HTTP Cookie File\n\n" + text + "\n"


def test_normalize_cookies_converts_crlf_and_keeps_lines():
    text = "# Netscape HTTP Cookie File\r\n\r\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc\r\n"
    expected = "# Netscape HTTP Cookie File\n\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc\n"
    assert normalize_cookies(text) == expected


def test_normalize_cookies_keeps_httponly_session_cookies():
    # Browsers/exporters mark session cookies with `#HttpOnly_`; dropping those
    # lines left yt-dlp with a signed-out jar and YouTube's bot check kicked in.
    text = (
        "# Netscape HTTP Cookie File\n"
        "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1798761600\tSID\tabc123\n"
        ".youtube.com\tTRUE\t/\tTRUE\t0\tPREF\ttz=UTC"
    )
    normalized = normalize_cookies(text)
    lines = normalized.strip().split("\n")

    assert normalized.startswith("# Netscape HTTP Cookie File\n\n")
    assert lines[2] == "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1798761600\tSID\tabc123"
    assert lines[3] == ".youtube.com\tTRUE\t/\tTRUE\t0\tPREF\ttz=UTC"


def test_httponly_cookies_load_into_the_yt_dlp_cookie_jar(tmp_path):
    from yt_dlp.cookies import YoutubeDLCookieJar

    text = (
        "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1798761600\tSID\tabc123\n"
        ".youtube.com\tTRUE\t/\tTRUE\t0\tPREF\ttz=UTC"
    )
    path = tmp_path / "cookies.txt"
    path.write_text(normalize_cookies(text), encoding="utf-8")

    jar = YoutubeDLCookieJar(str(path))
    jar.load(ignore_discard=True, ignore_expires=True)
    values = {cookie.name: cookie.value for cookie in jar}

    assert values == {"SID": "abc123", "PREF": "tz=UTC"}


def test_normalize_cookies_rejects_non_netscape_text():
    with pytest.raises(CookiesError, match="7 tab-separated fields"):
        normalize_cookies("SID=abc; VISITOR_INFO1_LIVE=def")


def test_normalize_cookies_rejects_empty_text():
    with pytest.raises(CookiesError, match="no cookies"):
        normalize_cookies("# Netscape HTTP Cookie File\n\n")


def test_is_cookies_required_error_detects_bot_check():
    exc = RuntimeError(
        "ERROR: [youtube] BPZkZpGMpXA: Sign in to confirm you’re not a bot. "
        "Use --cookies-from-browser or --cookies for the authentication."
    )
    assert is_cookies_required_error(exc) is True


def test_is_cookies_required_error_ignores_other_failures():
    assert is_cookies_required_error(RuntimeError("Video unavailable")) is False


def test_is_cookies_required_error_detects_reload_page_bot_check():
    # This is the player response YouTube returns for a blocked request.
    exc = RuntimeError("ERROR: [youtube] BPZkZpGMpXA: The page needs to be reloaded.")
    assert is_cookies_required_error(exc) is True


def test_build_cookie_header_reads_netscape_cookies():
    text = (
        "# Netscape HTTP Cookie File\n"
        "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1999999999\tSID\tabc123\n"
        ".youtube.com\tTRUE\t/\tFALSE\t0\tPREF\ttz=UTC\n"
        ".example.com\tTRUE\t/\tFALSE\t0\tTRACKER\tno\n"
    )
    header = services.build_cookie_header(text)
    assert header is not None
    assert "SID=abc123" in header
    assert "PREF=tz=UTC" in header
    assert "TRACKER" not in header


def test_build_cookie_header_skips_expired_and_empty():
    assert services.build_cookie_header("") is None
    expired = ".youtube.com\tTRUE\t/\tTRUE\t100\tSID\told"
    assert services.build_cookie_header(expired) is None


async def test_extract_info_retries_without_cookies_when_they_fail(monkeypatch):
    calls: list[str | None] = []

    def fake(url, path, client=None):
        calls.append(path)
        if path:
            raise RuntimeError("ERROR: [youtube] x: The page needs to be reloaded.")
        return {"id": "x"}

    monkeypatch.setattr(services, "_extract_info_sync", fake)
    text = ".youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc"
    assert await services.extract_info("https://youtu.be/x", text) == {"id": "x"}
    assert len(calls) == 2 and calls[1] is None


async def test_extract_info_retries_once_when_youtube_blocks(monkeypatch):
    attempts = 0

    def fake(url, path):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("ERROR: [youtube] x: Sign in to confirm you're not a bot.")
        return {"id": "x"}

    monkeypatch.setattr(services, "_extract_info_sync", fake)
    assert await services.extract_info("https://youtu.be/x") == {"id": "x"}
    assert attempts == 2


async def test_extract_info_does_not_retry_permanent_failures(monkeypatch):
    attempts = 0

    def fake(url, path):
        nonlocal attempts
        attempts += 1
        raise RuntimeError("ERROR: [youtube] x: Video unavailable")

    monkeypatch.setattr(services, "_extract_info_sync", fake)
    with pytest.raises(RuntimeError, match="Video unavailable"):
        await services.extract_info("https://youtu.be/x")
    assert attempts == 1


async def test_extract_info_deletes_temp_cookie_file(monkeypatch):
    paths: list[str] = []
    real_write = services._write_temp_cookies

    def spy(cookies_text: str) -> str:
        path = real_write(cookies_text)
        paths.append(path)
        return path

    monkeypatch.setattr(services, "_write_temp_cookies", spy)
    monkeypatch.setattr(services, "_extract_info_sync", lambda url, path, client=None: {"id": "x"})

    text = ".youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc"
    assert await services.extract_info("https://youtu.be/x", text) == {"id": "x"}
    assert paths and not Path(paths[0]).exists()


async def test_extract_info_deletes_temp_cookie_file_on_failure(monkeypatch):
    paths: list[str] = []
    real_write = services._write_temp_cookies

    def spy(cookies_text: str) -> str:
        path = real_write(cookies_text)
        paths.append(path)
        return path

    def boom(url, path):
        raise RuntimeError("extraction failed")

    monkeypatch.setattr(services, "_write_temp_cookies", spy)
    monkeypatch.setattr(services, "_extract_info_sync", boom)

    text = ".youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc"
    with pytest.raises(RuntimeError):
        await services.extract_info("https://youtu.be/x", text)
    assert paths and not Path(paths[0]).exists()


def test_cache_key_separates_anonymous_from_cookie_results():
    from app.services import cache_key

    url = "https://youtu.be/x"
    assert cache_key(url) == cache_key(url, "   ")
    assert cache_key(url) != cache_key(url, ".youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc")
    assert cache_key(url, "jar a") != cache_key(url, "jar b")


def test_cache_set_and_get_are_scoped_by_key():
    from app.services import cache_get, cache_key, cache_set

    url = "https://youtu.be/scoped"
    cache_set(cache_key(url), {"title": "anonymous"})
    cache_set(cache_key(url, "jar"), {"title": "signed-in"})

    assert cache_get(cache_key(url)) == {"title": "anonymous"}
    assert cache_get(cache_key(url, "jar")) == {"title": "signed-in"}


def test_error_reason_strips_ytdlp_decorations():
    from app.services import error_reason

    exc = RuntimeError(
        "ERROR: [youtube] BPZkZpGMpXA: Sign in to confirm you're not a bot.\n"
        "Use --cookies for the authentication."
    )
    assert error_reason(exc) == "Sign in to confirm you're not a bot."


async def test_extract_info_does_not_blame_cookies_for_unrelated_failures(monkeypatch):
    def fake(url, path, client=None):
        if path:
            raise RuntimeError("ERROR: [youtube] x: Video unavailable")
        raise RuntimeError("ERROR: [youtube] x: This video is not available in your country")

    monkeypatch.setattr(services, "_extract_info_sync", fake)
    text = ".youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc"
    with pytest.raises(RuntimeError, match="not available in your country"):
        await services.extract_info("https://youtu.be/x", text)
