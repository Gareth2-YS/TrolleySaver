"""Caller identity from claims that API Gateway's Cognito authorizer has already verified."""

from dataclasses import dataclass

from common.http import ApiError

ADMIN_GROUP = "admin"


@dataclass(frozen=True)
class Caller:
    user_id: str
    groups: tuple

    @property
    def is_admin(self):
        return ADMIN_GROUP in self.groups


def _parse_groups(raw):
    # REST API authorizers flatten list claims into strings such as "admin" or "[admin user]".
    if not raw:
        return ()
    if isinstance(raw, list):
        return tuple(raw)
    cleaned = str(raw).strip().strip("[]")
    return tuple(part for part in cleaned.replace(",", " ").split() if part)


def get_caller(event):
    claims = ((event.get("requestContext") or {}).get("authorizer") or {}).get("claims") or {}
    user_id = claims.get("sub")
    token_use = claims.get("token_use")
    if not user_id or (token_use and token_use != "access"):
        raise ApiError(401, "UNAUTHENTICATED", "Sign in again and retry.")
    return Caller(user_id=user_id, groups=_parse_groups(claims.get("cognito:groups")))


def require_admin(event):
    caller = get_caller(event)
    if not caller.is_admin:
        raise ApiError(403, "FORBIDDEN", "Administrator permission is required.")
    return caller
