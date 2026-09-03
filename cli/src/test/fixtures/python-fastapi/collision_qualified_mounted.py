"""M4 stage 2 corpus case 3 false-positive-guard fixture (commander-found): this file's `qualified_router`
IS actually mounted, bound with a MODULE-QUALIFIED form (`qualified_router = fastapi.APIRouter()`) - a
form the original bindingPattern missed. collision_qualified_unmounted.py defines an unrelated
`qualified_router` under the same name with the plain form. Querying either handler must produce
mount-unresolved, not a confident answer either way.
"""

import fastapi
from fastapi import FastAPI

qualified_router = fastapi.APIRouter()


@qualified_router.get("/qualified-mounted")
def qualified_mounted_handler() -> str:
    return "reachable-but-ambiguous-by-name"


qualified_app = FastAPI()
qualified_app.include_router(qualified_router)
