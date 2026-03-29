def test_upload_parses_command(client, operator_headers):
    files = {"file": ("test.webm", b"fake-audio-bytes", "audio/webm")}
    r = client.post("/api/voice/upload", files=files, headers=operator_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "зарегистрировать" in (data.get("raw_transcript") or "")
    assert data.get("parsed_command") == "зарегистрировать"
    assert data.get("parsed_identifier") is not None
    assert data["is_confirmed"] is False


def test_records_list_operator_sees_own(client, operator_headers):
    files = {"file": ("a.webm", b"x", "audio/webm")}
    client.post("/api/voice/upload", files=files, headers=operator_headers)
    r = client.get("/api/voice/records", headers=operator_headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_records_filter_by_command(client, operator_headers):
    files = {"file": ("f.webm", b"z", "audio/webm")}
    client.post("/api/voice/upload", files=files, headers=operator_headers)
    r = client.get(
        "/api/voice/records",
        params={"command": "зарегистрировать"},
        headers=operator_headers,
    )
    assert r.status_code == 200
    for row in r.json():
        assert row.get("parsed_command") == "зарегистрировать"


def test_confirm_record(client, operator_headers):
    files = {"file": ("b.webm", b"y", "audio/webm")}
    up = client.post("/api/voice/upload", files=files, headers=operator_headers)
    rid = up.json()["id"]
    r = client.post(
        f"/api/voice/records/{rid}/confirm",
        headers=operator_headers,
        json={
            "confirmed_transcript": "отменить обработку плавки 21957898",
            "parsed_command": "отменить обработку",
            "parsed_identifier": "21957898",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_confirmed"] is True
    assert "21957898" in (body.get("confirmed_transcript") or "")


def test_audio_download(client, operator_headers):
    files = {"file": ("c.webm", b"pcm", "audio/webm")}
    up = client.post("/api/voice/upload", files=files, headers=operator_headers)
    fn = up.json()["audio_url"].split("/")[-1]
    r = client.get(f"/api/voice/audio/{fn}", headers=operator_headers)
    assert r.status_code == 200
    assert r.content == b"pcm"
