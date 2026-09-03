"""M4 stage 2 corpus case 1 fixture: imports `get_db` from `real_module` only - `decoy_module.get_db` is
never referenced here, even though it shares the same bare name.
"""

from fastapi import Depends

from real_module import get_db


def handler(db: str = Depends(get_db)) -> str:
    return db
