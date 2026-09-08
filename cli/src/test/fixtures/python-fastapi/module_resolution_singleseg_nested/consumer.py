"""M4 gate 4 single-segment-import follow-up: a single-segment absolute import (`from singleseg_users
import ...`) naming a nested, unrelated `singleseg_users.py` (`deeply/nested/singleseg_users.py`). This
statement would never actually resolve at runtime unless `deeply/nested` were on `sys.path` (it is not, in
any realistic project layout this workspace represents) - the mount check must not confirm it anyway.
"""

from fastapi import FastAPI
from singleseg_users import singleseg_nested_router

singleseg_nested_app = FastAPI()
singleseg_nested_app.include_router(singleseg_nested_router)
