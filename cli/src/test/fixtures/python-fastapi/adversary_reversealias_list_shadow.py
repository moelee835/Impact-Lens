"""M4 gate 4 module-resolution follow-up, round 3: same reverse-alias adversarial import as
adversary_reversealias_shadow.py, but the `other_thing as router` entry is NOT first in a
comma-separated import list - `router as decoy_router` (a harmless forward alias of the real router,
under an unrelated local name) sits before it. Tests that rejecting a reverse alias does not depend on
list position.
"""

from fastapi import FastAPI
from adversary_reversealias_target import router as decoy_router, other_thing as router

app = FastAPI()
app.include_router(router)
