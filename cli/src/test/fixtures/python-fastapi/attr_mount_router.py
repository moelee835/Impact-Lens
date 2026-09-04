"""M4 stage 3 accuracy corpus - known false negative (docs/work/task-m4-stage3-accuracy-latency-gates.md):
this router IS genuinely mounted, but only through a module-attribute reference
(`attr_mount_app.include_router(attr_mount_router.router)`), a shape isRouterMounted()'s bare-identifier
pattern does not match. Querying attr_mount_handler must produce mount-unresolved (no edge) - this is an
accepted miss (false negative), not a bug: the adapter never claims a route is reachable when it is not
confirmed.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/attr-mount")
def attr_mount_handler() -> str:
    return "reachable-but-undetectable-by-this-adapter"
