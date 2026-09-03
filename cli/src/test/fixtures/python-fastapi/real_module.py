"""M4 stage 2 corpus case 1 fixture: the `get_db` that `consumer.py` actually imports and references via
`Depends(get_db)`. Querying THIS `get_db` as root must find exactly one augmented edge (`handler`).
"""


def get_db() -> str:
    return "real-db-session"
