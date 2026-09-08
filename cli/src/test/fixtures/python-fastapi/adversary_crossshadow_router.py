"""M4 gate 4 module-resolution follow-up, round 2 (docs/work/task-m4-gate4-module-resolution.md): a
route decorated on a genuinely never-mounted APIRouter. adversary_crossshadow_shadow.py genuinely
imports this exact router at module level (import provenance is real), but its only
`include_router(...)` call is inside a nested function whose PARAMETER shadows that import - the
cross-file analogue of adversary_selfshadow_router.py. Querying
adversary_crossshadow_router_handler must produce zero augmented edges and
framework_route_mount_unresolved.
"""

from fastapi import APIRouter

adversary_crossshadow_router = APIRouter()


@adversary_crossshadow_router.get("/adversary-crossshadow")
def adversary_crossshadow_router_handler() -> str:
    return "unreachable"
