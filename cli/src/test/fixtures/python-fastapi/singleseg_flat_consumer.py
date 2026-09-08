from fastapi import FastAPI
from singleseg_flat_users import singleseg_flat_router

singleseg_flat_app = FastAPI()
singleseg_flat_app.include_router(singleseg_flat_router)
