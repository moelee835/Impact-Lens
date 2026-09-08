"""M4 gate 4 module-resolution follow-up, round 3: imports `other_thing` (an unrelated string, not a
router) from adversary_reversealias_target.py and locally renames it to `router` - a REVERSE alias.
`app.include_router(router)` here mounts that unrelated object, never the real router in
adversary_reversealias_target.py.
"""

from fastapi import FastAPI
from adversary_reversealias_target import other_thing as router

app = FastAPI()
app.include_router(router)
