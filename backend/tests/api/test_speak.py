"""Velo's voice: text in, a WAV of Gemini's speech out. Without the model it says so; it never sends
silence or a made-up sound as if it were speech."""
import base64
import struct

from backend.app.llm import client as llm


def _say(client, heads, text="Two rooms are free on Tuesday.", who="club"):
    return client.post("/api/assistant/speak", json={"text": text}, headers=heads[who])


def test_wraps_the_model_pcm_in_a_wav(client, heads, monkeypatch):
    pcm = struct.pack("<4h", 0, 1200, -1200, 0)
    seen = {}

    def fake(text, voice):
        seen.update(text=text, voice=voice)
        return "audio/L16;codec=pcm;rate=24000", base64.b64encode(pcm).decode()

    monkeypatch.setattr(llm, "tts_transport", fake)
    r = _say(client, heads)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "audio/wav"
    wav = r.content
    assert wav[:4] == b"RIFF" and wav[8:12] == b"WAVE"
    channels, rate = struct.unpack("<HI", wav[22:28])
    assert (channels, rate) == (1, 24000)
    assert wav[44:] == pcm and seen["text"] == "Two rooms are free on Tuesday."


def test_passes_a_wav_through(client, heads, monkeypatch):
    riff = b"RIFF" + b"\x24\x00\x00\x00WAVEfmt " + b"\x00" * 24
    monkeypatch.setattr(llm, "tts_transport", lambda text, voice: ("audio/wav", base64.b64encode(riff).decode()))
    r = _say(client, heads)
    assert r.status_code == 200 and r.content == riff


def test_without_the_model_it_says_so(client, heads):
    r = _say(client, heads)                      # tests run with no GEMINI_API_KEY
    assert r.status_code == 503 and r.json()["error"]["code"] == "tts_unavailable"


def test_empty_audio_is_an_error_not_silence(client, heads, monkeypatch):
    monkeypatch.setattr(llm, "tts_transport", lambda text, voice: ("audio/L16;rate=24000", ""))
    assert _say(client, heads).status_code == 503


def test_needs_a_login_and_short_text(client, heads):
    assert client.post("/api/assistant/speak", json={"text": "hi"}).status_code == 401
    assert _say(client, heads, text="x" * 1201).status_code == 422
