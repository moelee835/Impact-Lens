"""M4 stage 2 import-alias coverage fixture: `alias_target_fn` is the FIRST (and only) name after
`import` on this line, so `localNamesFor()` detects `target_alias` as a local alias for it - this
reference must be found and produce an augmented edge when alias_target.py's alias_target_fn is queried.
"""

from fastapi import Depends

from alias_target import alias_target_fn as target_alias


def caught_handler(value: str = Depends(target_alias)) -> str:
    return value
