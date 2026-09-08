"""M4 gate 4 single-segment-import follow-up: this router is genuinely never mounted anywhere reachable.
consumer.py's `from singleseg_users import singleseg_nested_router` is a SINGLE-SEGMENT absolute import (no
dots) - before this lane, the suffix comparison degenerated to a bare-basename match and confirmed this
file's mount regardless of how deeply nested it is. No other `singleseg_users.py` exists anywhere in this
workspace, on purpose: this is the primary bug shape, not the narrower "collides with a different file"
sub-case - there is nothing to collide with, the depth alone is what makes this file the wrong target.
"""

from fastapi import APIRouter

singleseg_nested_router = APIRouter()


@singleseg_nested_router.get("/singleseg-nested")
def singleseg_nested_handler() -> str:
    return "unreachable"
