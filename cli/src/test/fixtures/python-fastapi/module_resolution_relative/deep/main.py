"""M4 gate 4 module-resolution follow-up: mounts routers/nested_users.py's router via a two-dot relative
import (`from ..routers.nested_users import nested_relative_router`) - one directory up from here
(`deep/`), then into the `routers/` subpackage.
"""

from fastapi import FastAPI
from ..routers.nested_users import nested_relative_router

app = FastAPI()
app.include_router(nested_relative_router)
