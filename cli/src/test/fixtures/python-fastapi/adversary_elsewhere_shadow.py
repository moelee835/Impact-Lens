"""M4 gate 4 reopening fixture: imports `adversary_elsewhere_router` from adversary_elsewhere_source.py
- NOT from adversary_elsewhere_router.py, which is where the real router lives. The name matches, the
module does not.
"""

from fastapi import FastAPI
from adversary_elsewhere_source import adversary_elsewhere_router

app = FastAPI()
app.include_router(adversary_elsewhere_router)
