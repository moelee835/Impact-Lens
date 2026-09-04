"""M4 stage 3 accuracy corpus - known false negative: parenthesized_target_fn is referenced only through
a parenthesized multi-line import alias in parenthesized_import_consumer.py (a common black/isort output
shape) - aliasBindingsFor()'s single-line regex does not match it. Querying parenthesized_target_fn must
produce zero augmented edges - an accepted miss, not a bug.
"""


def parenthesized_target_fn() -> str:
    return "value"
