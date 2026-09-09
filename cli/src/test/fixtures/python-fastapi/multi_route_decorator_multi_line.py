"""M4 gate 7 real-code measurement fix (docs/work/task-m4-fastapi-depends-enclosing-scope-fix.md): same
shape as multi_route_decorator_single_line.py, but the decorator's `dependencies=[Depends(x)]` argument
sits on its own line, separate from the `@router.get(` line itself - the `Depends()` reference's OWN
line never contains an `@`, so classification cannot look at the reference's line in isolation; it must
track paren depth backward to find the decorator that opened the still-unclosed call. Correct candidate:
`multi_line_decorator_second_handler` - `multi_line_decorator_first_handler` must NOT appear.
"""

from fastapi import APIRouter, Depends

router = APIRouter()


def multi_line_decorator_dep_target() -> str:
    return "authorized"


@router.get("/first")
def multi_line_decorator_first_handler() -> dict:
    return {}


@router.get(
    "/second",
    dependencies=[Depends(multi_line_decorator_dep_target)],
)
def multi_line_decorator_second_handler() -> dict:
    return {}
