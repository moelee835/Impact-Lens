"""M4 stage 3 corpus, sub-dependency (nested dependency) - the outermost consumer of a two-level
Depends() chain. `handler` depends on `nested_dependency_db.py`'s `get_db`, which itself depends on
`nested_dependency_config.py`'s `get_config`.
"""

from fastapi import Depends

from nested_dependency_db import get_db


def handler(db=Depends(get_db)):
    return db
