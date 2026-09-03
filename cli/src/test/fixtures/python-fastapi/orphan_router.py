"""M4 stage 2 corpus case 3(a) fixture (docs/work/task-m4-stage1-evidence-contract.md): a route decorated
on an APIRouter that is never referenced by include_router(...) anywhere in this workspace - genuinely
unmounted. Querying `orphan_handler` as root must find zero augmented edges and the
framework_route_mount_unresolved limitation.
"""

from fastapi import APIRouter

orphan_router = APIRouter()


@orphan_router.get("/orphan")
def orphan_handler() -> str:
    return "unreachable"
