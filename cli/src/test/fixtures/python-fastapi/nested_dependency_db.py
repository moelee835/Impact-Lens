"""M4 stage 3 corpus, sub-dependency (nested dependency) - the middle function of a two-level Depends()
chain. `get_db` is itself a Depends() target for `nested_dependency_consumer.py`'s `handler`, and it has
its own Depends() parameter naming `nested_dependency_config.py`'s `get_config` - the sub-dependency this
fixture pair exists to verify.
"""

from fastapi import Depends

from nested_dependency_config import get_config


def get_db(config=Depends(get_config)):
    return config
