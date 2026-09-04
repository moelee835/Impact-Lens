"""M4 stage 3 closure audit, gate 3: mounts crossfile_positive_router.py's router via a bare-identifier
`include_router(...)` call, imported by its own (unique, uncollided) name - the cross-file positive case
this corpus was missing before this fixture.
"""

from fastapi import FastAPI

from crossfile_positive_router import crossfile_positive_router

crossfile_positive_app = FastAPI()
crossfile_positive_app.include_router(crossfile_positive_router)
