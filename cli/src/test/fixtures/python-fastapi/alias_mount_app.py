"""M4 stage 3 accuracy corpus fixture: mounts alias_mount_router.py's router under an import alias
(`mount_alias_router`), not its own name ("router") - the name isRouterMounted() searches for.
"""

from fastapi import FastAPI
from alias_mount_router import router as mount_alias_router

app = FastAPI()
app.include_router(mount_alias_router)
