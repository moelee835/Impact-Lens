"""M4 gate 4 reopening fixture: `adversary_loop_router` here is a `for` loop variable, never bound to
the real APIRouter() adversary_loop_router.py defines - it just happens to share the name. This file
never imports anything from adversary_loop_router.py.
"""

from fastapi import FastAPI

app = FastAPI()

for adversary_loop_router in []:
    app.include_router(adversary_loop_router)
