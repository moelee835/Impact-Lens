"""IL-LIM-006 FastAPI E2E fixture (docs/work/task-m2-fastapi-e2e.md, stage 1).

Real FastAPI code, not a stub: this file is analyzed with the real `fastapi` package (a pinned version
installed by the test/CI setup, never checked into the repo) resolvable through the settings.python.pythonPath
mechanism `bundled-pyright`'s own catalog.ts comment already documents. Three call shapes, each with a
directly observed (not assumed) Call Hierarchy result recorded in the work document:

1. `normal_helper`, called ordinarily by `regular_caller` - a ordinary function call, expected to be found.
2. `get_items`, a route handler decorated with `@app.get(...)` - FastAPI's router calls it, not any code in
   this file, so no incoming caller is expected here.
3. `get_db`, referenced only as `Depends(get_db)` in `get_items`'s own signature - a reference, not a call
   expression, so no incoming caller is expected here either.
"""

from fastapi import Depends, FastAPI

app = FastAPI()


def normal_helper() -> str:
    return "helper"


def regular_caller() -> str:
    return normal_helper()


def get_db() -> str:
    return "db-session"


@app.get("/items")
def get_items(db: str = Depends(get_db)) -> dict:
    return {"db": db}
