"""M4 gate 7 real-code measurement fix (docs/work/task-m4-fastapi-depends-enclosing-scope-fix.md): a
file with MORE THAN ONE route - every existing fixture in this corpus has exactly one route per file,
which is exactly why decorator-level `dependencies=[Depends(x)]` mis-attribution (to whatever unrelated
route happened to be defined earlier in the same file) was invisible to the accuracy corpus, even though
it reproduced directly against a real project (`tiangolo/full-stack-fastapi-template`'s
`get_current_active_superuser`, four candidates: two genuine false positives, two right names for the
wrong reason, three real answers missing entirely). Correct candidate here:
`multi_route_second_handler` - `multi_route_first_handler` must NOT appear.
"""

from fastapi import APIRouter, Depends

router = APIRouter()


def multi_route_dep_target() -> str:
    return "authorized"


@router.get("/first")
def multi_route_first_handler() -> dict:
    return {}


@router.get("/second", dependencies=[Depends(multi_route_dep_target)])
def multi_route_second_handler() -> dict:
    return {}
