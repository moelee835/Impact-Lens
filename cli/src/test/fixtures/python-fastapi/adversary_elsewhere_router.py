"""M4 gate 4 reopening fixture (docs/work/task-m4-gate4-mount-false-positive.md): a route decorated on
a genuinely never-mounted APIRouter. adversary_elsewhere_source.py defines an UNRELATED object under
this exact name (`adversary_elsewhere_router`) in a completely different module, and
adversary_elsewhere_shadow.py imports THAT one and passes it to `include_router(...)` - the name
matches, but the module does not. Querying adversary_elsewhere_router_handler must produce zero
augmented edges and framework_route_mount_unresolved, exactly like orphan_router.py.
"""

from fastapi import APIRouter

adversary_elsewhere_router = APIRouter()


@adversary_elsewhere_router.get("/adversary-elsewhere")
def adversary_elsewhere_router_handler() -> str:
    return "unreachable"
