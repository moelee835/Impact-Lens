"""M4 gate 7 real-code measurement fix (docs/work/task-m4-fastapi-depends-enclosing-scope-fix.md):
module-level `Annotated[T, Depends(fn)]` where a DIFFERENT, unrelated function is defined immediately
above - reproduces the non-self-referential mis-attribution the old "nearest preceding def" scan made
(confirmed both with a synthetic reproduction and, in the decorator shape, with real candidates from
`tiangolo/full-stack-fastapi-template`). Correct answer: no candidate at all (reject) - same reasoning as
module_level_alias_self_ref.py, this reference is not inside any function body.
"""

from typing import Annotated

from fastapi import Depends


def module_alias_unrelated_function() -> None:
    """Never calls module_alias_other_target - only here to tempt a scope-blind "nearest preceding def"
    scan into picking this as the (wrong) candidate caller."""
    return None


def module_alias_other_target() -> str:
    return "value"


ModuleAliasOtherDep = Annotated[str, Depends(module_alias_other_target)]
