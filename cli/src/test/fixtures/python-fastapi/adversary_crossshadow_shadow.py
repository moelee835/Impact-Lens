"""M4 gate 4 module-resolution follow-up, round 2: genuinely imports
adversary_crossshadow_router.py's router at module level (real import provenance), but the only
`include_router(...)` call is inside `setup()`, whose PARAMETER of the same name shadows that import -
the actual mount call refers to the parameter, not the module-level import. This file never mounts the
module-level import at all.
"""

from fastapi import FastAPI
from adversary_crossshadow_router import adversary_crossshadow_router

app = FastAPI()


def setup(app, adversary_crossshadow_router):
    app.include_router(adversary_crossshadow_router)
