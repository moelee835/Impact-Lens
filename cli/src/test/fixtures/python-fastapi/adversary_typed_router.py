"""M4 gate 4 reopening fixture (docs/work/task-m4-gate4-mount-false-positive.md): a route decorated on
a genuinely never-mounted APIRouter. adversary_typed_shadow.py mentions this exact name
(`adversary_typed_router`) inside an `include_router(...)` call, but only as a variable TYPE-ANNOTATED
with something other than APIRouter - an identifier that shares this router's name by pure coincidence,
never bound to it (this is deliberately distinct from collision_typed_*.py, which pairs two GENUINE
`APIRouter()` bindings of the same name; this one is never an APIRouter at all). Querying
adversary_typed_router_handler must produce zero augmented edges and framework_route_mount_unresolved,
exactly like orphan_router.py.
"""

from fastapi import APIRouter

adversary_typed_router = APIRouter()


@adversary_typed_router.get("/adversary-typed")
def adversary_typed_router_handler() -> str:
    return "unreachable"
