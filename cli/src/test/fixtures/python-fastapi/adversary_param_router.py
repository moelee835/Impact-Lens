"""M4 gate 4 reopening fixture (docs/work/task-m4-gate4-mount-false-positive.md): a route decorated on
a genuinely never-mounted APIRouter. adversary_param_shadow.py mentions this exact name
(`adversary_param_router`) inside an `include_router(...)` call, but only as a function PARAMETER - an
identifier that shares this router's name by pure coincidence, never bound to it. Before the
import-provenance check (isRouterMounted()'s importsNameFromModule()) was added, the bare-identifier
mountPattern matched that call regardless of what the parameter actually held, and this handler was
falsely reported as reachable. Querying adversary_param_router_handler must produce zero augmented
edges and framework_route_mount_unresolved, exactly like orphan_router.py.
"""

from fastapi import APIRouter

adversary_param_router = APIRouter()


@adversary_param_router.get("/adversary-param")
def adversary_param_router_handler() -> str:
    return "unreachable"
