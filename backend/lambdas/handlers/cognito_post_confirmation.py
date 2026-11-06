"""Cognito PostConfirmation trigger: put new users in the `user` group and create their profile row.

The group is assigned here, server-side, so a client can never choose its own role.
"""

import logging
from datetime import datetime, timezone

from botocore.exceptions import ClientError

from common import db
from common.validation import clean_text, to_iso
from handlers.cognito_pre_signup import MAX_NAME_LENGTH

logger = logging.getLogger()
USER_GROUP = "user"


def _display_name(attributes, email):
    """The name admins see next to this user's submissions. PreSignUp has already checked public
    sign-ups; this also covers accounts created another way."""
    try:
        name = clean_text(attributes.get("name") or "")[:MAX_NAME_LENGTH].strip()
    except ValueError:
        name = ""
    return name or email.split("@")[0]


def handler(event, context):
    if event.get("triggerSource") != "PostConfirmation_ConfirmSignUp":
        return event

    attributes = event.get("request", {}).get("userAttributes", {})
    user_id = attributes["sub"]
    email = attributes.get("email", "")

    db.cognito().admin_add_user_to_group(UserPoolId=event["userPoolId"], Username=event["userName"], GroupName=USER_GROUP)

    try:
        db.users().put_item(
            Item={
                "userId": user_id,
                "displayName": _display_name(attributes, email),
                "email": email,
                "submissionCount": 0,
                "createdAt": to_iso(datetime.now(timezone.utc)),
            },
            ConditionExpression="attribute_not_exists(userId)",
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
        logger.info("Profile for %s already exists", user_id)
    return event
