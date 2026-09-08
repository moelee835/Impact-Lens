"""M4 gate 4 module-resolution follow-up, round 2 (docs/work/task-m4-gate4-module-resolution.md):
the module-level `adversary_selfshadow_router` is genuinely never mounted. `setup()` below has a
PARAMETER of the exact same name, which shadows the module-level binding inside its own body -
`app.include_router(adversary_selfshadow_router)` there refers to the parameter, not the module-level
router. Before the module-level-line requirement (`MODULE_LEVEL_LINE_PATTERN`) was added, the self-mount
branch trusted any `include_router(name)` match in root's own file with no scope check at all, and this
handler was falsely reported as reachable. Querying adversary_selfshadow_router_handler must produce zero
augmented edges and framework_route_mount_unresolved, exactly like orphan_router.py.
"""

from fastapi import APIRouter

adversary_selfshadow_router = APIRouter()


@adversary_selfshadow_router.get("/adversary-selfshadow")
def adversary_selfshadow_router_handler() -> str:
    return "unreachable"


def setup(app, adversary_selfshadow_router):
    app.include_router(adversary_selfshadow_router)
