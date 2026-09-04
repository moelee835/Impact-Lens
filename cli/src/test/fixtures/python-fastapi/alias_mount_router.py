"""M4 stage 3 accuracy corpus - known false negative: this router IS genuinely mounted, but only under an
import alias (`from alias_mount_router import router as mount_alias_router`, then
`include_router(mount_alias_router)`) - isRouterMounted() searches for this router's OWN name
("router"), never the name a different file imports it under. Querying alias_mount_handler must produce
mount-unresolved (no edge) - an accepted miss, not a bug.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/alias-mount")
def alias_mount_handler() -> str:
    return "reachable-but-undetectable-by-this-adapter"
