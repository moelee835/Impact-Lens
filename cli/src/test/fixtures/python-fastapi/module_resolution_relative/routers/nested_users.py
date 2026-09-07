"""M4 gate 4 module-resolution follow-up (docs/work/task-m4-gate4-module-resolution.md): mounted from
module_resolution_relative/deep/main.py via a TWO-dot relative import (`from ..routers.nested_users
import nested_relative_router`) - one level up from `deep/`, then back down into `routers/`. Querying
nested_relative_handler must produce a confirmed edge.
"""

from fastapi import APIRouter

nested_relative_router = APIRouter()


@nested_relative_router.get("/nested-relative")
def nested_relative_handler() -> str:
    return "reachable"
