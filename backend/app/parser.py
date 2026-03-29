import re
from typing import Optional, Tuple

KNOWN_COMMANDS = [
    "зарегистрировать",
    "начать обработку",
    "отменить обработку",
    "отменить регистрацию",
    "завершить обработку",
]


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().strip())


def _find_command(normalized: str) -> Optional[str]:
    for cmd in sorted(KNOWN_COMMANDS, key=len, reverse=True):
        if cmd in normalized:
            return cmd
    return None


def _extract_identifier(text: str, command: Optional[str]) -> Optional[str]:
    work = _normalize_text(text)
    if command:
        idx = work.find(command)
        if idx >= 0:
            work = work[idx + len(command) :]

    work = re.sub(
        r"\b(номер|плавки|трубы|код|идентификатор|запись)\b",
        " ",
        work,
        flags=re.IGNORECASE,
    )
    work = _normalize_text(work)

    compact = work.replace(" ", "")
    m8 = re.search(r"\d{8,}", compact)
    if m8:
        return m8.group(0)

    token_re = re.compile(r"[0-9A-Za-zА-Яа-яЁё]{4,}")
    candidates: list[str] = []
    for m in token_re.finditer(work):
        tok = m.group(0)
        if tok.isdigit() and len(tok) < 8:
            continue
        candidates.append(tok)

    if not candidates:
        m = re.search(r"\d{6,7}", compact)
        if m:
            return m.group(0)
        return None

    return max(candidates, key=len)


def parse_voice_command(text: str) -> Tuple[Optional[str], Optional[str]]:
    if not text or not text.strip():
        return None, None
    n = _normalize_text(text)
    cmd = _find_command(n)
    ident = _extract_identifier(text, cmd)
    return cmd, ident
