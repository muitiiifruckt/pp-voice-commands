"""Пути для нативных библиотек на Windows (Vosk и др.)."""

import hashlib
import os
import subprocess
import tempfile
import ctypes
from pathlib import Path


def path_for_native_windows(path: Path) -> str:
    """
    Возвращает путь, по которому старые нативные API корректно открывают файлы.
    Для каталогов с кириллицей пробуем короткое имя 8.3 (только ASCII).
    """
    resolved = path.resolve()
    s = str(resolved)
    if os.name != "nt":
        return s
    buf = ctypes.create_unicode_buffer(65534)
    n = ctypes.windll.kernel32.GetShortPathNameW(s, buf, len(buf))
    if n and n < len(buf) and buf.value:
        return buf.value
    return s


def _path_is_ascii_filesystem(s: str) -> bool:
    try:
        s.encode("ascii")
    except UnicodeEncodeError:
        return False
    return True


def _vosk_junction_root() -> Path:
    base = os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()
    root = Path(base) / "pp-vosk-model"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _ensure_junction_for_vosk(real: Path) -> str:
    """
    Vosk (C++) на Windows часто ломается на путях с не-ASCII (кириллица в OneDrive и т.д.).
    Создаём каталожную связь (junction) в LOCALAPPDATA — там путь обычно только из ASCII.
    """
    real_resolved = real.resolve()
    real_s = str(real_resolved)
    digest = hashlib.sha256(real_s.encode("utf-8")).hexdigest()[:24]
    link = _vosk_junction_root() / digest

    if link.exists():
        subprocess.run(
            ["cmd", "/c", "rmdir", str(link)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

    proc = subprocess.run(
        ["cmd", "/c", "mklink", "/J", str(link), real_s],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(
            "Не удалось обойти кириллицу в пути к модели Vosk (mklink /J). "
            f"{msg} "
            "Задайте VOSK_MODEL_PATH на каталог только с латиницей, например C:\\Models\\vosk-model-small-ru-0.22"
        )
    return str(link.resolve())


def path_for_vosk_windows(model_dir: Path) -> str:
    """
    Путь для vosk.Model(): Vosk на Windows плохо работает с не-ASCII в пути (кириллица, OneDrive).
    Если в полном пути есть не-ASCII — всегда junction в LOCALAPPDATA (там путь обычно ASCII).
    Иначе — короткое имя 8.3 или обычная строка.
    """
    if os.name != "nt":
        return str(model_dir.resolve())

    resolved = str(model_dir.resolve())
    if not _path_is_ascii_filesystem(resolved):
        return _ensure_junction_for_vosk(model_dir)

    candidate = path_for_native_windows(model_dir)
    return candidate
