"""M4 stage 2 corpus case 3 false-positive-guard fixture: `include_router(docstring_router)` appears only
inside this module's own docstring as documentation text, never as real code - must NOT be treated as
mounted. Example (not real code): `app.include_router(docstring_router)`.
"""

from fastapi import APIRouter

docstring_router = APIRouter()


@docstring_router.get("/docstring")
def docstring_handler() -> str:
    return "unreachable"
