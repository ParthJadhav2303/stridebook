from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.modules.auth.router import router as auth_router
from app.modules.dues.router import router as dues_router
from app.modules.fee_groups.router import router as fee_groups_router
from app.modules.health.router import router as health_router
from app.modules.payments.router import router as payments_router
from app.modules.reports.router import router as reports_router
from app.modules.settings.router import router as settings_router
from app.modules.students.router import router as students_router
from app.modules.users.router import router as users_router

ROUTERS = (
    health_router,
    settings_router,
    auth_router,
    users_router,
    fee_groups_router,
    students_router,
    dues_router,
    payments_router,
    reports_router,
)


def create_app() -> FastAPI:
    settings = get_settings()
    is_prod = settings.environment == "production"
    app = FastAPI(
        title=f"{settings.app_name} API",
        version=settings.app_version,
        # Interactive docs only outside production.
        docs_url=None if is_prod else "/api/docs",
        openapi_url=None if is_prod else "/api/openapi.json",
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    for router in ROUTERS:
        app.include_router(router, prefix="/api")
    return app


app = create_app()
