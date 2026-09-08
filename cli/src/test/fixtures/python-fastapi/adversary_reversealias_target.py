"""M4 gate 4 module-resolution follow-up, round 3 (docs/work/task-m4-gate4-module-resolution.md,
reviewer finding): the router here is genuinely never mounted. `other_thing` is a completely unrelated
object defined in this same module. adversary_reversealias_shadow.py imports `other_thing` under the
LOCAL alias `router` (`from adversary_reversealias_target import other_thing as router`) - a REVERSE
alias, the direction importsNameFromModule()'s alias check did not cover (it only excluded `router as
X`, our own name being renamed away, never `X as router`, an unrelated symbol being renamed IN).
Querying adversary_reversealias_target_handler must produce zero augmented edges and
framework_route_mount_unresolved.
"""

from fastapi import APIRouter

router = APIRouter()
other_thing = "not a router at all"


@router.get("/adversary-reversealias")
def adversary_reversealias_target_handler() -> str:
    return "unreachable"
