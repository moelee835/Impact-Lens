"""M4 stage 3 closure audit (docs/work/task-m4-milestone-closure-audit.md, gate 3): the missing case
found by the audit - a bare-identifier router mount where the router definition and the
`include_router(...)` call are in DIFFERENT files, and the mount actually succeeds (unlike
`attr_mount_*`/`alias_mount_*`, which are both documented accepted misses). `mounted_router.py` is the
only other genuinely-mounted fixture, but its definition and mount call are in the SAME file - this
fixture pair is the first positive cross-file case. The variable name is deliberately unique across this
whole corpus (`crossfile_positive_router`, not the generic `router` several other fixtures already use)
so the ambiguity check (isRouterMounted()'s ANOTHER-file-binds-this-name scan) has nothing to collide
with - a name collision here would test the ambiguity guard, not this case.
"""

from fastapi import APIRouter

crossfile_positive_router = APIRouter()


@crossfile_positive_router.get("/crossfile-positive")
def crossfile_positive_handler() -> str:
    return "reachable"
