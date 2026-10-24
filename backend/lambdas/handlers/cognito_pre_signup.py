"""Cognito PreSignUp trigger: auto-confirm public registrations so no verification code is needed."""


def handler(event, context):
    if event.get("triggerSource") == "PreSignUp_SignUp":
        event["response"]["autoConfirmUser"] = True
        if event.get("request", {}).get("userAttributes", {}).get("email"):
            event["response"]["autoVerifyEmail"] = True
    return event
