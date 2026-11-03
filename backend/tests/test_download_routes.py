"""Exercise the API contracts across framework upgrades without network access."""

from unittest.mock import AsyncMock

from app.routers import download

VIDEO_URL = "https://youtu.be/example"
INFO = {
    "title": "Example",
    "duration": 60,
    "formats": [
        {
            "format_id": "18",
            "ext": "mp4",
            "vcodec": "h264",
            "acodec": "aac",
            "url": "https://example.invalid/video",
            "filesize": 5,
        },
        {"format_id": "140", "ext": "m4a", "vcodec": "none", "acodec": "aac"},
    ],
}


def test_formats_return_metadata_and_categories(client, monkeypatch):
    get_info = AsyncMock(return_value=INFO)
    monkeypatch.setattr(download, "_get_info", get_info)
    response = client.get(
        "/api/formats", params={"url": VIDEO_URL}, headers={"X-Cookies": "dGVzdA=="}
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Example"
    assert [item["category"] for item in response.json()["formats"]] == [
        "video_audio",
        "audio_only",
    ]
    get_info.assert_awaited_once_with(VIDEO_URL, "test")


def test_rejects_non_youtube_url(client):
    response = client.get("/api/formats", params={"url": "https://example.com/video"})
    assert response.status_code == 400


def test_download_streams_selected_format(client, monkeypatch):
    monkeypatch.setattr(download, "_get_info", AsyncMock(return_value=INFO))

    class Upstream:
        status_code = 200
        headers = {"content-type": "video/mp4"}

        async def aiter_raw(self):
            yield b"video"

        async def aclose(self):
            pass

    class StreamClient:
        def __init__(self, **kwargs):
            pass

        def build_request(self, method, url, headers):
            assert (method, url) == ("GET", "https://example.invalid/video")
            return None

        async def send(self, request, stream):
            assert stream is True
            return Upstream()

        async def aclose(self):
            pass

    monkeypatch.setattr(download.httpx, "AsyncClient", StreamClient)
    response = client.get(
        "/api/download", params={"url": VIDEO_URL, "format_id": "18", "title": "My video"}
    )
    assert response.status_code == 200
    assert response.content == b"video"
    assert response.headers["content-disposition"] == 'attachment; filename="My video.mp4"'
    assert response.headers["content-type"] == "video/mp4"


def test_download_forwards_cookies_to_the_media_stream(client, monkeypatch):
    monkeypatch.setattr(download, "_get_info", AsyncMock(return_value=INFO))
    seen: dict[str, str] = {}

    class Upstream:
        status_code = 200
        headers = {"content-type": "video/mp4"}

        async def aiter_raw(self):
            yield b"video"

        async def aclose(self):
            pass

    class StreamClient:
        def __init__(self, **kwargs):
            pass

        def build_request(self, method, url, headers):
            seen.update(headers)
            return None

        async def send(self, request, stream):
            return Upstream()

        async def aclose(self):
            pass

    monkeypatch.setattr(download.httpx, "AsyncClient", StreamClient)
    cookies = "# Netscape HTTP Cookie File\n\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc"
    import base64

    response = client.get(
        "/api/download",
        params={"url": VIDEO_URL, "format_id": "18", "title": "x"},
        headers={"X-Cookies": base64.b64encode(cookies.encode()).decode()},
    )
    assert response.status_code == 200
    assert "SID=abc" in seen.get("Cookie", "")


def test_download_asks_for_cookies_when_media_is_forbidden(client, monkeypatch):
    monkeypatch.setattr(download, "_get_info", AsyncMock(return_value=INFO))

    class Upstream:
        status_code = 403
        headers = {}

        async def aclose(self):
            pass

    class StreamClient:
        def __init__(self, **kwargs):
            pass

        def build_request(self, method, url, headers):
            return None

        async def send(self, request, stream):
            return Upstream()

        async def aclose(self):
            pass

    monkeypatch.setattr(download.httpx, "AsyncClient", StreamClient)
    response = client.get(
        "/api/download", params={"url": VIDEO_URL, "format_id": "18", "title": "x"}
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "cookies_required"


def test_formats_asks_for_cookies_when_youtube_blocks(client, monkeypatch):
    async def blocked(*_args, **_kwargs):
        raise RuntimeError(
            "ERROR: [youtube] BPZkZpGMpXA: Sign in to confirm you’re not a bot. "
            "Use --cookies-from-browser or --cookies for the authentication."
        )

    monkeypatch.setattr(download, "extract_info", blocked)
    response = client.get("/api/formats", params={"url": "https://youtu.be/blocked"})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "cookies_required"


def test_formats_reports_rejected_cookies(client, monkeypatch):
    async def blocked(*_args, **_kwargs):
        raise RuntimeError("ERROR: [youtube] abc: Sign in to confirm you’re not a bot.")

    monkeypatch.setattr(download, "extract_info", blocked)
    response = client.get(
        "/api/formats",
        params={"url": "https://youtu.be/blocked-with-cookies"},
        headers={"X-Cookies": "dGVzdA=="},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "cookies_rejected"


def test_formats_rejection_includes_youtube_reason(client, monkeypatch):
    async def blocked(*_args, **_kwargs):
        raise RuntimeError("ERROR: [youtube] abc: Sign in to confirm you're not a bot.")

    monkeypatch.setattr(download, "extract_info", blocked)
    response = client.get(
        "/api/formats",
        params={"url": "https://youtu.be/blocked-with-cookies"},
        headers={"X-Cookies": "dGVzdA=="},
    )

    message = response.json()["detail"]["message"]
    assert "YouTube said: Sign in to confirm you're not a bot." in message


def test_formats_reports_malformed_cookies(client, monkeypatch):
    async def invalid(*_args, **_kwargs):
        raise download.CookiesError("Cookies must be in Netscape cookies.txt format.")

    monkeypatch.setattr(download, "extract_info", invalid)
    response = client.get(
        "/api/formats",
        params={"url": "https://youtu.be/bad-cookies"},
        headers={"X-Cookies": "dGVzdA=="},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_cookies"
