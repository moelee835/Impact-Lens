"""M4 gate 4 module-resolution follow-up, round 3: the router here is genuinely never mounted.
`other_thing` is unrelated. ../reversealias_shadow.py imports `other_thing` under the local alias
`router` via a RELATIVE import - the same reverse-alias adversarial shape as
adversary_reversealias_shadow.py, but exercising the relative-import branch of
importsNameFromModule() specifically (commander/reviewer verified the absolute-import direction by real
execution and inferred the relative branch shares the same code path by reading it - this fixture
proves it by execution too).
"""

from fastapi import APIRouter

router = APIRouter()
other_thing = "not a router at all"


@router.get("/adversary-reversealias-relative")
def reversealias_target_handler() -> str:
    return "unreachable"
