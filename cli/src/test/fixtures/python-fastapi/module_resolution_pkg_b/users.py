"""M4 gate 4 module-resolution follow-up (docs/work/task-m4-gate4-module-resolution.md): a genuine
router in its own package, sharing the basename "users" and the variable name "router" with
module_resolution_pkg_a/users.py (an unrelated router that is never mounted). main.py in this same
directory mounts THIS router via an absolute import - querying pkg_b_handler must produce a confirmed
edge despite the same-named router existing in pkg_a. This is the "ordinary multi-router FastAPI
project" case this lane exists to make work: before it, any workspace-wide `router` name collision
blocked confirmation for BOTH routers, self-mount or not.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/pkg-b")
def pkg_b_handler() -> str:
    return "reachable"
