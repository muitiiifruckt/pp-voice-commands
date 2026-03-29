import pytest

from app.parser import parse_voice_command


@pytest.mark.parametrize(
    "text, cmd, ident",
    [
        (
            "зарегистрировать трубу номер Р45345ИВ",
            "зарегистрировать",
            "р45345ив",
        ),
        (
            "Отменить обработку плавки 21957898",
            "отменить обработку",
            "21957898",
        ),
        ("", None, None),
    ],
)
def test_parse_voice_command(text, cmd, ident):
    c, i = parse_voice_command(text)
    assert c == cmd
    assert i == ident
