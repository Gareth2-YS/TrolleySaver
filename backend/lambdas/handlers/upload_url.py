"""POST /price-submissions/image-upload-url: a short-lived presigned POST for one shelf-tag photo.

A presigned POST (rather than PUT) lets S3 itself enforce the content type and size limit.
"""

import uuid
from datetime import datetime, timedelta, timezone

from common import db
from common.auth import get_caller
from common.http import api_handler, parse_json_body, response
from common.validation import IMAGE_EXTENSIONS, max_upload_bytes, to_iso, validate_upload_request

UPLOAD_URL_TTL_SECONDS = 300


def photo_prefix(user_id):
    return f"price-evidence/{user_id}/"


@api_handler
def handler(event, context):
    caller = get_caller(event)
    content_type, _ = validate_upload_request(parse_json_body(event))
    photo_key = f"{photo_prefix(caller.user_id)}{uuid.uuid4()}.{IMAGE_EXTENSIONS[content_type]}"
    presigned = db.s3().generate_presigned_post(
        Bucket=db.photo_bucket(),
        Key=photo_key,
        Fields={"Content-Type": content_type},
        Conditions=[{"Content-Type": content_type}, ["content-length-range", 1, max_upload_bytes()]],
        ExpiresIn=UPLOAD_URL_TTL_SECONDS,
    )
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=UPLOAD_URL_TTL_SECONDS)
    return response(200, {
        "method": "POST",
        "uploadUrl": presigned["url"],
        "fields": presigned["fields"],
        "photoKey": photo_key,
        "expiresAt": to_iso(expires_at),
        "maxSizeBytes": max_upload_bytes(),
    })
