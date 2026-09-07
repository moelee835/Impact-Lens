"""M4 gate 4 module-resolution follow-up: mounts routers/users.py's router via a one-dot relative
import into a subpackage (`from .routers.users import relative_router`).
"""

from fastapi import FastAPI
from .routers.users import relative_router

app = FastAPI()
app.include_router(relative_router)
