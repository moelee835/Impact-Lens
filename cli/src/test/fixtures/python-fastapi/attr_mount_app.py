"""M4 stage 3 accuracy corpus fixture: mounts attr_mount_router.py's router via a module-attribute
reference (`attr_mount_router.router`), not a bare identifier - the mount reference isRouterMounted()'s
text search cannot follow.
"""

from fastapi import FastAPI

import attr_mount_router

app = FastAPI()
app.include_router(attr_mount_router.router)
