"""M4 gate 4 module-resolution follow-up (docs/work/task-m4-gate4-module-resolution.md): this router is
genuinely never mounted anywhere. module_resolution_pkg_b/main.py mounts an UNRELATED router also named
`router`, using an ABSOLUTE import that shares this file's basename ("users") - the exact cross-package
basename collision the earlier last-dotted-segment comparison could not tell apart. Querying
pkg_a_handler must still produce mount-unresolved: the absolute-import suffix comparison must tell
`module_resolution_pkg_a.users` apart from `module_resolution_pkg_b.users`.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/pkg-a")
def pkg_a_handler() -> str:
    return "unreachable"
