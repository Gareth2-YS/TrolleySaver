"""API Gateway proxy helpers: JSON responses, a stable error shape and a handler wrapper."""

import contextvars
import functools
import json
import logging
import os
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))


class ApiError(Exception):
    """An error the client should see, rendered as {code, message, fieldErrors?, requestId}.

    `extra` adds fields the client can act on, e.g. the id of the existing product on a duplicate.
    """

    def __init__(self, status, code, message, field_errors=None, extra=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.field_errors = field_errors
        self.extra = extra


def _json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, set):
        return sorted(value)
    raise TypeError(f"Not JSON serialisable: {type(value).__name__}")


# The Origin header of the request being handled, set by api_handler.
_request_origin = contextvars.ContextVar("request_origin", default=None)


def allowed_origins():
    """The sites that may call the API from a browser: the local dev server and the deployed site."""
    return [origin.strip() for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",") if origin.strip()]


def cors_headers():
    """CORS headers for the current request. The caller's Origin is echoed back only when it's allowed,
    so a browser on any other site can't read the response."""
    headers = {
        "Access-Control-Allow-Headers": "Authorization,Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "Vary": "Origin",
    }
    origin = _request_origin.get()
    if origin and origin in allowed_origins():
        headers["Access-Control-Allow-Origin"] = origin
    return headers


def _origin(event):
    return next((value for name, value in (event.get("headers") or {}).items() if name.lower() == "origin"), None)


# On every response: browsers must treat it as the JSON it says it is, and nothing (browser or proxy)
# may keep a copy, since many responses hold someone's own submissions or, for admins, people's emails.
SECURITY_HEADERS = {"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"}


def response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", **SECURITY_HEADERS, **cors_headers()},
        "body": json.dumps(body, default=_json_default),
    }


def no_content():
    return {"statusCode": 204, "headers": {**SECURITY_HEADERS, **cors_headers()}, "body": ""}


def error_response(error, request_id):
    body = {"code": error.code, "message": error.message, "requestId": request_id}
    if error.field_errors:
        body["fieldErrors"] = error.field_errors
    if error.extra:
        body.update(error.extra)
    return response(error.status, body)


def parse_json_body(event):
    raw = event.get("body")
    if not raw:
        raise ApiError(400, "INVALID_BODY", "Request body must be a JSON object.")
    try:
        body = json.loads(raw)
    except (TypeError, ValueError):
        raise ApiError(400, "INVALID_BODY", "Request body must be valid JSON.")
    if not isinstance(body, dict):
        raise ApiError(400, "INVALID_BODY", "Request body must be a JSON object.")
    return body


def api_handler(func):
    """Turn ApiError into its HTTP response and anything unexpected into a 500."""

    @functools.wraps(func)
    def wrapper(event, context):
        request_id = getattr(context, "aws_request_id", None)
        origin = _request_origin.set(_origin(event))
        try:
            return func(event, context)
        except ApiError as error:
            logger.info("Client error %s: %s", error.code, error.message)
            return error_response(error, request_id)
        except Exception:
            logger.exception("Unhandled error")
            return error_response(ApiError(500, "INTERNAL_ERROR", "Something went wrong. Please retry."), request_id)
        finally:
            _request_origin.reset(origin)

    return wrapper
