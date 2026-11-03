from fastapi import FastAPI

from app.errors import add_error_handlers


def create_app() -> FastAPI:
    app = FastAPI(title="LoanMart Insights API")
    add_error_handlers(app)

    @app.get("/")
    def root():
        return {"name": "LoanMart Insights API", "docs": "/docs"}

    @app.get("/api/health")
    def health():
        return {"ok": True, "connections": 0}

    return app


app = create_app()
