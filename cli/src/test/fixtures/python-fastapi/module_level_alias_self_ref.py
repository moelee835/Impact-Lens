"""M4 gate 7 real-code measurement fix (docs/work/task-m4-fastapi-depends-enclosing-scope-fix.md):
module-level `Annotated[T, Depends(fn)]` with the target's OWN `def` immediately above - the exact shape
that produced a self-referencing edge (fn's candidate caller reported as fn itself) in two real,
unmodified open-source FastAPI projects (`tiangolo/full-stack-fastapi-template`'s `get_db`,
`Netflix/dispatch`'s `get_db`). There is no enclosing function for a module-level statement - the
correct answer is no candidate at all, not a guess.
"""

from typing import Annotated

from fastapi import Depends


def module_alias_self_target() -> str:
    return "value"


ModuleAliasSelfDep = Annotated[str, Depends(module_alias_self_target)]
