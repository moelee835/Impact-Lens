"""M4 gate 4 reopening fixture (docs/work/task-m4-gate4-mount-false-positive.md): a route decorated on
a genuinely never-mounted APIRouter. adversary_loop_shadow.py mentions this exact name
(`adversary_loop_router`) inside an `include_router(...)` call, but only as a `for` LOOP VARIABLE - an
identifier that shares this router's name by pure coincidence, never bound to it. Querying
adversary_loop_router_handler must produce zero augmented edges and framework_route_mount_unresolved,
exactly like orphan_router.py.
"""

from fastapi import APIRouter

adversary_loop_router = APIRouter()


@adversary_loop_router.get("/adversary-loop")
def adversary_loop_router_handler() -> str:
    return "unreachable"
