"""One error shape for the whole API: {"error": {"code", "message", "details"}}."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .core.model import DatasetError


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details or {}


def bad_request(message: str, details: dict | None = None) -> ApiError:
    return ApiError(400, "bad_request", message, details)


def forbidden(message: str = "You are not allowed to do this") -> ApiError:
    return ApiError(403, "forbidden", message)


def not_found(message: str) -> ApiError:
    return ApiError(404, "not_found", message)


def conflict(message: str, details: dict | None = None) -> ApiError:
    return ApiError(409, "conflict", message, details)


def _body(code: str, message: str, details=None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, e: ApiError):
        return JSONResponse(_body(e.code, e.message, e.details), status_code=e.status)

    @app.exception_handler(DatasetError)
    async def _dataset(_: Request, e: DatasetError):
        return JSONResponse(_body("bad_dataset", str(e)), status_code=400)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError):
        errs = [{"field": ".".join(str(x) for x in err["loc"][1:]), "message": err["msg"]} for err in e.errors()]
        first = errs[0] if errs else {"field": "", "message": "invalid request"}
        return JSONResponse(_body("invalid_request", f"{first['field'] or 'body'}: {first['message']}",
                                  {"errors": errs}), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        return JSONResponse(_body("http_error", str(e.detail)), status_code=e.status_code)
