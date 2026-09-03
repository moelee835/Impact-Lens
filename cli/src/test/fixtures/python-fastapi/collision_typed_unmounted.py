"""M4 stage 2 corpus case 3 false-positive-guard fixture (commander-found, isolated regex probe): this
file binds `typed_router` with the plain form (`= APIRouter()`) and is never itself mounted, but
collision_typed_mounted.py binds the SAME name using a TYPE-ANNOTATED form
(`typed_router: APIRouter = APIRouter()`). The original bindingPattern only matched the bare form and
would miss this collision entirely - reproducing the exact original bug for this one binding style.
Querying either handler must produce mount-unresolved.
"""

from fastapi import APIRouter

typed_router = APIRouter()


@typed_router.get("/typed-unmounted")
def typed_unmounted_handler() -> str:
    return "unreachable"
