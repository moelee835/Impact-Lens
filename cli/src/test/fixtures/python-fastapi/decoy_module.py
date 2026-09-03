"""M4 stage 2 corpus case 1 fixture (docs/work/task-m4-stage1-evidence-contract.md): a function with the
same name as `real_module.get_db`, never referenced by `consumer.py`'s `Depends(get_db)`. Proves the
adapter resolves via the real provider, not by name - querying THIS `get_db` as root must find zero
augmented edges, even though the text `Depends(get_db)` exists elsewhere in this workspace.
"""


def get_db() -> str:
    return "decoy-db-session"
