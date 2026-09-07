"""M4 gate 4 reopening fixture: `adversary_typed_router` here is type-annotated as `str`, never bound to
an APIRouter() at all, let alone the real one adversary_typed_router.py defines - it just happens to
share the name. This file never imports anything from adversary_typed_router.py.
"""

from fastapi import FastAPI

app = FastAPI()


def get_thing() -> str:
    return "not-a-router"


adversary_typed_router: str = get_thing()
app.include_router(adversary_typed_router)
