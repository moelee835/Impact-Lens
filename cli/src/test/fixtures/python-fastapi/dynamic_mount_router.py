"""M4 stage 2 corpus case 3(b) fixture (docs/work/task-m4-stage1-evidence-contract.md): a route decorated
on an APIRouter that IS mounted, but only through dynamic registration
(`dynamic_app.include_router(get_dynamic_router())`) - the mount call's argument is a function call
result, not a direct reference to the router variable, so a scan matching only a bare identifier argument
cannot resolve it. Must produce the SAME result as orphan_router.py: zero augmented edges, the
framework_route_mount_unresolved limitation, with byte-identical message text (a genuinely-unmounted
router and one mounted out of this scan's reach are indistinguishable to a static scan).
"""

from fastapi import APIRouter, FastAPI

dynamic_router = APIRouter()


@dynamic_router.get("/dynamic")
def dynamic_handler() -> str:
    return "reachable-but-not-statically-confirmable"


def get_dynamic_router() -> APIRouter:
    return dynamic_router


dynamic_app = FastAPI()
dynamic_app.include_router(get_dynamic_router())
