"""M4 gate 4 reopening fixture: defines a plain string under the name `adversary_elsewhere_router` - a
completely different module and a completely different object than adversary_elsewhere_router.py's real
APIRouter(). Only adversary_elsewhere_shadow.py imports this.
"""

adversary_elsewhere_router = "not a router"
