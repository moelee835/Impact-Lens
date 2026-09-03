"""M4 stage 2 import-alias coverage fixture: `alias_target_fn` is NOT the first name after `import` on
this line (`unrelated_name` is) - `localNamesFor()`'s regex requires the target to be immediately after
`import`, so `target_alias2` is never detected as a local alias. This reference must NOT contribute an
augmented edge when alias_target.py's alias_target_fn is queried - a documented limitation (false
negative), not a bug.
"""

from fastapi import Depends

from alias_target import unrelated_name, alias_target_fn as target_alias2


def uncaught_handler(value: str = Depends(target_alias2)) -> str:
    return value
