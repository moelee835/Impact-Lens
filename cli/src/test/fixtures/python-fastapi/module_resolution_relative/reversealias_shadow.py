"""M4 gate 4 module-resolution follow-up, round 3: imports `other_thing` (unrelated) from
routers/reversealias_target.py via a RELATIVE import and renames it locally to `router` - a reverse
alias on the relative-import branch of importsNameFromModule().
"""

from fastapi import FastAPI
from .routers.reversealias_target import other_thing as router

app = FastAPI()
app.include_router(router)
