from __future__ import annotations

from bots.core.backend import backend


class Texts:
    def __init__(self) -> None:
        self._m: dict[str, str] = {}

    async def load(self) -> None:
        self._m = {x["code"]: x["text"] for x in await backend.get_messages()}

    def get(self, code: str, **kw: str) -> str:
        t = self._m.get(code, code)
        for k, v in kw.items():
            t = t.replace("{" + k + "}", str(v))
        return t


texts = Texts()
