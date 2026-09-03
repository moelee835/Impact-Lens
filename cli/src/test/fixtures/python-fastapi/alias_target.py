"""M4 stage 2 import-alias coverage fixture (commander-found gap, docs/work/task-m4-stage2-fastapi-
adapter.md): a plain dependency function, referenced only through import aliases elsewhere - by
alias_caught_consumer.py (a single-name `import X as Y`, detected) and alias_uncaught_consumer.py (`X` not
first in a comma-separated import list, NOT detected - a known, documented limitation, not a regression).
"""


def alias_target_fn() -> str:
    return "alias-target-value"


def unrelated_name() -> str:
    return "unrelated"
