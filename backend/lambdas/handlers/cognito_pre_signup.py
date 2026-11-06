"""Cognito PreSignUp trigger: check a public sign-up's details, then auto-confirm it so no verification
code is needed.

The registration form checks the same rules, but anyone can call Cognito's SignUp API directly, so they
are enforced here too. Raising refuses the sign-up, and Cognito passes the message on to the caller as
"PreSignUp failed with error <message>." Accounts an admin creates (create_admin.py) aren't checked.
"""

from common.validation import clean_text

MIN_NAME_LENGTH, MAX_NAME_LENGTH = 2, 80
MAX_EMAIL_LENGTH = 254


def check_details(attributes):
    """Raise ValueError, in the form's words, if the name or email would be refused by the form."""
    try:
        name = clean_text(attributes.get("name") or "")
    except ValueError:
        raise ValueError("Your name can't contain hidden or control characters")
    if not MIN_NAME_LENGTH <= len(name) <= MAX_NAME_LENGTH:
        raise ValueError(f"Enter your full name ({MIN_NAME_LENGTH}–{MAX_NAME_LENGTH} characters)")
    if len(attributes.get("email") or "") > MAX_EMAIL_LENGTH:
        raise ValueError("Email address is too long")


def handler(event, context):
    if event.get("triggerSource") == "PreSignUp_SignUp":
        attributes = event.get("request", {}).get("userAttributes", {})
        check_details(attributes)
        event["response"]["autoConfirmUser"] = True
        if attributes.get("email"):
            event["response"]["autoVerifyEmail"] = True
    return event
