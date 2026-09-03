"""M4 stage 2 corpus case 3 false-positive-guard fixture (commander-found): this file's `typed_router` IS
actually mounted, using a TYPE-ANNOTATED binding (`typed_router: APIRouter = APIRouter()`) - a form the
original bindingPattern missed. collision_typed_unmounted.py defines an unrelated `typed_router` under the
same name with the plain form. Querying either handler must produce mount-unresolved, not a confident
answer either way.
"""

from fastapi import APIRouter, FastAPI

typed_router: APIRouter = APIRouter()


@typed_router.get("/typed-mounted")
def typed_mounted_handler() -> str:
    return "reachable-but-ambiguous-by-name"


typed_app = FastAPI()
typed_app.include_router(typed_router)
