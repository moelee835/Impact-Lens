"""M4 gate 4 reopening fixture: `adversary_factory_router` here is bound to an unrelated factory's
return value, never to the real APIRouter() adversary_factory_router.py defines - it just happens to
share the name. This file never imports anything from adversary_factory_router.py.
"""

from fastapi import FastAPI

app = FastAPI()


def make_unrelated_thing():
    return object()


adversary_factory_router = make_unrelated_thing()
app.include_router(adversary_factory_router)
