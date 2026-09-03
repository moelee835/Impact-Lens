"""M4 stage 2 corpus case 3 false-positive-guard fixture (commander-found, isolated regex probe): this
file binds `qualified_router` with the plain form (`= APIRouter()`) and is never itself mounted, but
collision_qualified_mounted.py binds the SAME name using a MODULE-QUALIFIED form
(`qualified_router = fastapi.APIRouter()`). The original bindingPattern only matched a bare `APIRouter(`
immediately after `=` and would miss this collision entirely - reproducing the exact original bug for
this one binding style. Querying either handler must produce mount-unresolved.
"""

from fastapi import APIRouter

qualified_router = APIRouter()


@qualified_router.get("/qualified-unmounted")
def qualified_unmounted_handler() -> str:
    return "unreachable"
