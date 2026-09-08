"""M4 gate 4 single-segment-import follow-up: a KNOWN, ACCEPTED false negative. This router is genuinely
mounted by consumer.py's single-segment absolute import (`from singleseg_src_users import ...`), and a real
src-layout project running with `src/` on `sys.path` would make this import genuinely resolve at runtime -
but this file does not sit directly under the workspace root (it sits under `src/`), so the single-segment
depth guard rejects it anyway. Accepted: this function has no way to distinguish a real `src/`-style package
root from an arbitrary nested directory without reading project metadata, which stays out of scope.
"""

from fastapi import APIRouter

singleseg_src_router = APIRouter()


@singleseg_src_router.get("/singleseg-src")
def singleseg_src_handler() -> str:
    return "reachable in a real src-layout project, but not confirmed by this heuristic"
