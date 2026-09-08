"""M4 gate 4 module-resolution follow-up, round 3 (docs/work/task-m4-gate4-module-resolution.md,
reviewer finding): `adversary_commentapp_router` is actually an APIRouter(), never mounted anywhere -
but a comment mentions it as if it were a FastAPI() instance. isDirectFastapiApp() used to test the raw,
un-stripped file text, so this comment alone made it return true and skip isRouterMounted() entirely -
bypassing every check this lane built (import provenance, module-level scoping) with one comment line.
Querying adversary_commentapp_router_handler must produce zero augmented edges and
framework_route_mount_unresolved, exactly like orphan_router.py.
"""

from fastapi import APIRouter

# Example usage elsewhere: adversary_commentapp_router = FastAPI()
adversary_commentapp_router = APIRouter()


@adversary_commentapp_router.get("/adversary-commentapp")
def adversary_commentapp_router_handler() -> str:
    return "unreachable"
