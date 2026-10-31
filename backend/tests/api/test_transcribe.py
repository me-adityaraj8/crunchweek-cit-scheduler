"""Voice input: the browser records a short WAV, Gemini turns it into text, and the text then goes
through the same assistant and checks as typed text."""
from backend.app.llm import client as llm

WAV = b"RIFF" + b"\x00" * 40      # content isn't inspected; the model (faked here) reads it


def _post(client, heads, data=WAV, mime="audio/wav", who="club"):
    return client.post("/api/assistant/transcribe", headers=heads[who],
                       files={"audio": ("voice.wav", data, mime)})


def test_transcribes_and_tidies_spacing(client, heads, monkeypatch):
    seen = {}

    def fake(system, audio, mime):
        seen.update(audio=audio, mime=mime, system=system)
        return "  seminar hall kal  shaam 6 baje,\n 100 log  "

    monkeypatch.setattr(llm, "audio_transport", fake)
    r = _post(client, heads)
    assert r.status_code == 200, r.text
    assert r.json() == {"text": "seminar hall kal shaam 6 baje, 100 log"}
    assert seen["audio"] == WAV and seen["mime"] == "audio/wav" and "Latin script" in seen["system"]


def test_without_ai_voice_input_says_type_instead(client, heads):
    r = _post(client, heads)                     # tests run with no GEMINI_API_KEY
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "llm_unavailable" and "type" in r.json()["error"]["message"].lower()


def test_rejects_files_that_are_not_audio(client, heads):
    r = _post(client, heads, data=b"%PDF-1.4", mime="application/pdf")
    assert r.status_code == 415


def test_rejects_recordings_that_are_too_long(client, heads, monkeypatch):
    monkeypatch.setattr(llm, "audio_transport", lambda *a: "never called")
    r = _post(client, heads, data=b"\x00" * (4 * 1024 * 1024 + 1))
    assert r.status_code == 413


def test_silence_is_a_clear_error(client, heads, monkeypatch):
    monkeypatch.setattr(llm, "audio_transport", lambda *a: "   ")
    r = _post(client, heads)
    assert r.status_code == 422 and "hear" in r.json()["error"]["message"].lower()


def test_needs_login(client):
    r = client.post("/api/assistant/transcribe", files={"audio": ("voice.wav", WAV, "audio/wav")})
    assert r.status_code == 401
