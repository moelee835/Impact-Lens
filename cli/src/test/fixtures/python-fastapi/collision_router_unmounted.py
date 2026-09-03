"""M4 stage 2 corpus case 3 false-positive-guard fixture (reviewer-found): a router named `router`,
never itself mounted - but collision_router_mounted.py ALSO defines a DIFFERENT `router = APIRouter()`
under the same local name, and that one IS mounted. A text search that only matches by bare name cannot
tell these two `router` variables apart, so BOTH must be treated as mount-unresolved (stage 1's "if it
cannot be confirmed, do not assert" - a false negative on either is safe, a false positive on either is
not).
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/collision-unmounted")
def collision_unmounted_handler() -> str:
    return "unreachable"
