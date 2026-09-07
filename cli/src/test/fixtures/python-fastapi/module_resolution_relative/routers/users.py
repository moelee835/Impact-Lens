"""M4 gate 4 module-resolution follow-up (docs/work/task-m4-gate4-module-resolution.md): mounted from
module_resolution_relative/main.py (one directory up) via a RELATIVE import into this subpackage
(`from .routers.users import relative_router`, one leading dot). Querying relative_handler must produce
a confirmed edge - the relative-import-into-a-subpackage shape, resolved exactly by file position.
"""

from fastapi import APIRouter

relative_router = APIRouter()


@relative_router.get("/relative")
def relative_handler() -> str:
    return "reachable"
