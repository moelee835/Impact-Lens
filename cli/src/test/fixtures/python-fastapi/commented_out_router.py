"""M4 stage 2 corpus case 3 false-positive-guard fixture: a route decorated on an APIRouter whose only
`include_router(...)` reference in the workspace is commented out - must NOT be treated as mounted.
Commenting out the mount call is a realistic, common way a router genuinely stops being reachable.
"""

from fastapi import APIRouter

commented_router = APIRouter()


@commented_router.get("/commented")
def commented_handler() -> str:
    return "unreachable"


# app.include_router(commented_router)  # left here on purpose, never actually called
