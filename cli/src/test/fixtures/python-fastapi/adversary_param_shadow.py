"""M4 gate 4 reopening fixture: `adversary_param_router` here is a function PARAMETER name, never bound
to the real APIRouter() adversary_param_router.py defines - it just happens to share the name. This file
never imports anything from adversary_param_router.py.
"""

from fastapi import FastAPI

app = FastAPI()


def register(adversary_param_router):
    app.include_router(adversary_param_router)
