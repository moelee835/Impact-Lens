"""M4 stage 2 corpus case 3 false-positive-guard fixture: `include_router(string_router)` appears only
inside a string literal (not a docstring, not a comment, not real code) - must NOT be treated as mounted.
"""

from fastapi import APIRouter

string_router = APIRouter()


@string_router.get("/string-literal")
def string_literal_handler() -> str:
    return "unreachable"


USAGE_HINT = "Call app.include_router(string_router) to enable this route."
