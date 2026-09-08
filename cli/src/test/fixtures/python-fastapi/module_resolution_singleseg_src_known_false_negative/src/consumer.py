from fastapi import FastAPI
from singleseg_src_users import singleseg_src_router

singleseg_src_app = FastAPI()
singleseg_src_app.include_router(singleseg_src_router)
