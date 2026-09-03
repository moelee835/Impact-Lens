"""M4 stage 2 corpus case 3 regression fixture: a plain APIRouter, actually mounted via a normal
`include_router(name)` call, with no name collision anywhere else in this workspace - the mount check's
positive case must keep working exactly as it did before the false-positive-guard fix. Querying this
handler as root must produce a normal augmented edge, no framework_route_mount_unresolved limitation.
"""

from fastapi import APIRouter, FastAPI

mounted_router = APIRouter()


@mounted_router.get("/mounted")
def mounted_handler() -> str:
    return "reachable"


mounted_app = FastAPI()
mounted_app.include_router(mounted_router)
