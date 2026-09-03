"""M4 stage 2 corpus case 3 false-positive-guard fixture (reviewer-found): this file's `router` IS
actually mounted, but collision_router_unmounted.py defines an UNRELATED `router = APIRouter()` under the
same local name. Querying either handler must produce mount-unresolved, not a confident answer either way
- see collision_router_unmounted.py for the full rationale.
"""

from fastapi import APIRouter, FastAPI

router = APIRouter()


@router.get("/collision-mounted")
def collision_mounted_handler() -> str:
    return "reachable-but-ambiguous-by-name"


collision_app = FastAPI()
collision_app.include_router(router)
