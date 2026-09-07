"""M4 gate 4 reopening fixture (docs/work/task-m4-gate4-mount-false-positive.md): a route decorated on
a genuinely never-mounted APIRouter. adversary_dictattr_shadow.py mentions this exact name
(`adversary_dictattr_router`) inside an `include_router(...)` call, but only as the result of a DICT
LOOKUP - an identifier that shares this router's name by pure coincidence, never bound to it. Querying
adversary_dictattr_router_handler must produce zero augmented edges and framework_route_mount_unresolved,
exactly like orphan_router.py.
"""

from fastapi import APIRouter

adversary_dictattr_router = APIRouter()


@adversary_dictattr_router.get("/adversary-dictattr")
def adversary_dictattr_router_handler() -> str:
    return "unreachable"
