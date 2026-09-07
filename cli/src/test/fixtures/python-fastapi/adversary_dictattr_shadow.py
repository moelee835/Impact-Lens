"""M4 gate 4 reopening fixture: `adversary_dictattr_router` here is bound to a dict lookup result, never
to the real APIRouter() adversary_dictattr_router.py defines - it just happens to share the name. This
file never imports anything from adversary_dictattr_router.py.
"""

from fastapi import FastAPI

app = FastAPI()

_registry = {"main": object()}
adversary_dictattr_router = _registry["main"]
app.include_router(adversary_dictattr_router)
