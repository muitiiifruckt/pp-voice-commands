import json
import logging
import os
import subprocess
import tempfile
import wave
from pathlib import Path

from app.config import settings

_model = None
_log = logging.getLogger(__name__)


def _resolve_model_dir(root: Path) -> Path:
    p = root.resolve()
    if not p.is_dir():
        return p
    # Частый случай: zip создаёт вложенную папку с тем же именем
    nested = p / p.name
    if nested.is_dir() and _is_complete_vosk_model(nested) and not _is_complete_vosk_model(p):
        return nested
    return p


def _has_vosk_graph(p: Path) -> bool:
    """Граф: единый HCLG.fst или пара Gr.fst + HCLr.fst (типично для vosk-model-small-ru)."""
    g = p / "graph"
    if (g / "HCLG.fst").is_file():
        return True
    return (g / "Gr.fst").is_file() and (g / "HCLr.fst").is_file()


def _is_complete_vosk_model(p: Path) -> bool:
    return (p / "am" / "final.mdl").is_file() and _has_vosk_graph(p)


def _assert_model_complete(p: Path) -> None:
    if not _is_complete_vosk_model(p):
        missing = []
        if not (p / "am" / "final.mdl").is_file():
            missing.append("am/final.mdl")
        if not _has_vosk_graph(p):
            missing.append("graph/HCLG.fst или graph/Gr.fst + graph/HCLr.fst")
        extra = ""
        if os.name == "nt":
            try:
                str(p).encode("ascii")
            except UnicodeEncodeError:
                extra = (
                    " Если после полной распаковки Vosk всё ещё ругается, задайте VOSK_MODEL_PATH на каталог "
                    "без кириллицы, например C:\\Models\\vosk-model-small-ru-0.22."
                )
        raise RuntimeError(
            f"Каталог модели неполный или это не модель Vosk: {p}. Нет: {', '.join(missing)}. "
            "Скачайте архив с https://alphacephei.com/vosk/models , распакуйте в каталог backend/ "
            "(рядом с app/) или укажите VOSK_MODEL_PATH."
            + extra
        )


def get_model():
    global _model
    if _model is not None:
        return _model
    try:
        root = settings.resolved_vosk_model_directory()
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError("Не удалось определить каталог модели VOSK. Проверьте VOSK_MODEL в .env.") from e
    p = _resolve_model_dir(root)
    if not p.is_dir():
        raise RuntimeError(f"Каталог модели VOSK не найден: {p}")

    _assert_model_complete(p)

    import vosk

    if os.name == "nt":
        from app.winpaths import path_for_vosk_windows

        model_path = path_for_vosk_windows(p)
    else:
        model_path = str(p)

    _model = vosk.Model(model_path)
    return _model


def _convert_to_wav_16k_mono(src: Path, dst: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-ar",
            "16000",
            "-ac",
            "1",
            "-sample_fmt",
            "s16",
            str(dst),
        ],
        check=True,
        capture_output=True,
    )


def _ensure_wav_16k_mono(src: Path) -> tuple[Path, bool]:
    """
    Возвращает (путь к wav 16k mono, нужно_ли_удалить_файл).
    """
    fd, tmp_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    tmp = Path(tmp_path)
    try:
        if src.suffix.lower() != ".wav":
            _convert_to_wav_16k_mono(src, tmp)
            return tmp, True
        wf = wave.open(str(src), "rb")
        ok = wf.getnchannels() == 1 and wf.getsampwidth() == 2 and wf.getframerate() == 16000
        wf.close()
        if ok:
            tmp.unlink(missing_ok=True)
            return src, False
        _convert_to_wav_16k_mono(src, tmp)
        return tmp, True
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def transcribe_file(audio_path: Path) -> str:
    import vosk

    model = get_model()
    work_wav: Path | None = None
    delete_work = False
    try:
        try:
            work_wav, delete_work = _ensure_wav_16k_mono(audio_path)
        except FileNotFoundError as e:
            raise RuntimeError("Утилита ffmpeg не найдена в PATH.") from e
        except subprocess.CalledProcessError as e:
            raise RuntimeError("Не удалось конвертировать аудио (ffmpeg).") from e

        wf = wave.open(str(work_wav), "rb")
        rate = wf.getframerate()
        nchan = wf.getnchannels()
        sw = wf.getsampwidth()
        nframes = wf.getnframes()
        duration_s = nframes / rate if rate else 0.0
        raw_pcm = wf.readframes(nframes)
        wf.close()

        peak = 0
        if sw == 2 and nchan >= 1 and len(raw_pcm) >= 2:
            # mono/stereo int16 LE — оценка максимальной амплитуды по первому каналу
            step = nchan * 2
            for i in range(0, len(raw_pcm) - 1, step):
                sample = int.from_bytes(raw_pcm[i : i + 2], "little", signed=True)
                a = abs(sample)
                if a > peak:
                    peak = a

        if peak < 200:
            _log.warning(
                "ASR: очень тихий или пустой сигнал после конвертации (peak=%s, %.2fs, %d ch). "
                "Проверьте микрофон в системе и громкость записи.",
                peak,
                duration_s,
                nchan,
            )
        else:
            _log.info("ASR: входной WAV %d Hz, %.2fs, peak=%d", rate, duration_s, peak)

        rec = vosk.KaldiRecognizer(model, rate)
        rec.SetWords(False)
        full: list[str] = []
        pos = 0
        frame_bytes = 4000 * nchan * sw
        while pos < len(raw_pcm):
            chunk = raw_pcm[pos : pos + frame_bytes]
            pos += len(chunk)
            if rec.AcceptWaveform(chunk):
                res = json.loads(rec.Result())
                if res.get("text"):
                    full.append(res["text"])
        res = json.loads(rec.FinalResult())
        if res.get("text"):
            full.append(res["text"])
        out = " ".join(full).strip()
        _log.info("ASR: результат распознавания (%d симв.): %s", len(out), out if out else "<пусто>")
        return out
    finally:
        if delete_work and work_wav and work_wav.exists():
            work_wav.unlink(missing_ok=True)
