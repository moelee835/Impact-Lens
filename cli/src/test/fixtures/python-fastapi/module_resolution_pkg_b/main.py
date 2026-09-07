"""M4 gate 4 module-resolution follow-up: mounts module_resolution_pkg_b/users.py's router via an
ABSOLUTE import (`from module_resolution_pkg_b.users import router`) - a flat-layout absolute import, the
shape the workspace-root-as-package-root approach and the path-segment-suffix approach both resolve
correctly. `router` here is the literal same bare name as module_resolution_pkg_a/users.py's own,
unrelated router - that collision is the point of this fixture pair.
"""

from fastapi import FastAPI
from module_resolution_pkg_b.users import router

app = FastAPI()
app.include_router(router)
