"""M4 stage 3 accuracy corpus fixture: imports parenthesized_target_fn under an alias, using a
parenthesized multi-line import (black/isort's default output shape when an import line would otherwise
exceed the line-length limit) - aliasBindingsFor() only matches a single-line
`import target as alias` and does not follow this shape.
"""

from fastapi import Depends
from parenthesized_import_target import (
    parenthesized_target_fn as ptarget,
)


def parenthesized_handler(value: str = Depends(ptarget)) -> str:
    return value
