"""M4 gate 4 reopening fixture (docs/work/task-m4-gate4-mount-false-positive.md): a route decorated on
a genuinely never-mounted APIRouter. adversary_factory_shadow.py mentions this exact name
(`adversary_factory_router`) inside an `include_router(...)` call, but only as the RETURN VALUE of an
unrelated factory function - an identifier that shares this router's name by pure coincidence, never
bound to it. Unlike dynamic_mount_router.py (which calls `include_router(get_dynamic_router())`
directly, an accepted miss for a different reason - no bare identifier to even match), this one binds
the factory's result to a local name first, so the bare-identifier mountPattern DOES match it. Querying
adversary_factory_router_handler must produce zero augmented edges and framework_route_mount_unresolved,
exactly like orphan_router.py.
"""

from fastapi import APIRouter

adversary_factory_router = APIRouter()


@adversary_factory_router.get("/adversary-factory")
def adversary_factory_router_handler() -> str:
    return "unreachable"
