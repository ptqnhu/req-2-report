import traceback

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class HttpError(Exception):
    """Raise this anywhere to send {"error": message} with the given status code."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def add_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HttpError)
    async def http_error(request: Request, exc: HttpError):
        return JSONResponse({"error": exc.message}, status_code=exc.status)

    @app.exception_handler(StarletteHTTPException)
    async def framework_error(request: Request, exc: StarletteHTTPException):
        if exc.status_code == 404:
            message = f"No API route for {request.method} {request.url.path}"
        else:
            message = str(exc.detail)
        return JSONResponse({"error": message}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def bad_input(request: Request, exc: RequestValidationError):
        first = exc.errors()[0]
        field = ".".join(str(part) for part in first["loc"][1:])
        return JSONResponse({"error": f"{field}: {first['msg']}"}, status_code=400)

    @app.exception_handler(Exception)
    async def crashed(request: Request, exc: Exception):
        traceback.print_exception(exc)
        return JSONResponse({"error": "Something went wrong on the server."}, status_code=500)
