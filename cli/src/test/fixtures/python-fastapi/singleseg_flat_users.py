"""M4 gate 4 single-segment-import follow-up: this router IS genuinely mounted, by a single-segment
absolute import (`from singleseg_flat_users import ...`) - this file sits directly under the workspace
root, the one case a single-segment absolute import can plausibly resolve to without reading package
metadata. Must still confirm after the single-segment depth guard was added.
"""

from fastapi import APIRouter

singleseg_flat_router = APIRouter()


@singleseg_flat_router.get("/singleseg-flat")
def singleseg_flat_handler() -> str:
    return "reachable"
