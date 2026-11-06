import re

import boto3
import pytest

from conftest import REGION
from handlers import cognito_post_confirmation, cognito_pre_signup


def _signup(**attributes):
    return {"triggerSource": "PreSignUp_SignUp", "request": {"userAttributes": attributes}, "response": {}}


def test_pre_signup_auto_confirms_public_signups():
    result = cognito_pre_signup.handler(_signup(email="a@b.com", name="Alex Tan"), None)
    assert result["response"] == {"autoConfirmUser": True, "autoVerifyEmail": True}


@pytest.mark.parametrize("name, message", [
    (None, "Enter your full name (2–80 characters)"),
    ("A", "Enter your full name (2–80 characters)"),
    ("A" * 81, "Enter your full name (2–80 characters)"),
    ("Alex‮Tan", "Your name can't contain hidden or control characters"),
    ("Alex​Tan", "Your name can't contain hidden or control characters"),
    ("Alex\x00", "Your name can't contain hidden or control characters"),
])
def test_pre_signup_refuses_names_the_form_would_refuse(name, message):
    """Someone calling Cognito's SignUp API directly gets the same rules as the registration form."""
    attributes = {"email": "a@b.com", **({"name": name} if name is not None else {})}
    with pytest.raises(ValueError, match=re.escape(message)):
        cognito_pre_signup.handler(_signup(**attributes), None)


def test_pre_signup_refuses_an_overlong_email():
    with pytest.raises(ValueError, match="Email address is too long"):
        cognito_pre_signup.handler(_signup(email="a" * 245 + "@example.com", name="Alex Tan"), None)


def test_pre_signup_accepts_names_in_other_scripts():
    for name in ("陈伟明", "Siti Nur'aini", "முருகன் ராஜ்", "José  Núñez"):
        assert cognito_pre_signup.handler(_signup(email="a@b.com", name=name), None)["response"]["autoConfirmUser"]


def test_pre_signup_leaves_admin_created_users_alone():
    event = {"triggerSource": "PreSignUp_AdminCreateUser", "request": {"userAttributes": {}}, "response": {}}
    assert cognito_pre_signup.handler(event, None)["response"] == {}


def _pool_with_user(email):
    client = boto3.client("cognito-idp", region_name=REGION)
    pool_id = client.create_user_pool(PoolName="unit", UsernameAttributes=["email"])["UserPool"]["Id"]
    client.create_group(UserPoolId=pool_id, GroupName="user")
    user = client.admin_create_user(UserPoolId=pool_id, Username=email, UserAttributes=[{"Name": "email", "Value": email}])["User"]
    sub = next(a["Value"] for a in user["Attributes"] if a["Name"] == "sub")
    return client, pool_id, user["Username"], sub


def test_post_confirmation_adds_group_and_profile(aws):
    client, pool_id, username, sub = _pool_with_user("alex@example.com")
    event = {
        "triggerSource": "PostConfirmation_ConfirmSignUp",
        "userPoolId": pool_id,
        "userName": username,
        "request": {"userAttributes": {"sub": sub, "email": "alex@example.com", "name": "Alex Tan"}},
        "response": {},
    }
    assert cognito_post_confirmation.handler(event, None) is event
    groups = client.admin_list_groups_for_user(UserPoolId=pool_id, Username=username)["Groups"]
    assert [g["GroupName"] for g in groups] == ["user"]
    profile = aws.Table("unit-user").get_item(Key={"userId": sub})["Item"]
    assert profile["displayName"] == "Alex Tan"
    assert profile["email"] == "alex@example.com"
    assert profile["submissionCount"] == 0
    # Re-running (e.g. a Cognito retry) keeps the existing profile.
    aws.Table("unit-user").update_item(Key={"userId": sub}, UpdateExpression="SET submissionCount = :n", ExpressionAttributeValues={":n": 5})
    cognito_post_confirmation.handler(event, None)
    assert aws.Table("unit-user").get_item(Key={"userId": sub})["Item"]["submissionCount"] == 5


def test_post_confirmation_display_name_falls_back_to_email(aws):
    client, pool_id, username, sub = _pool_with_user("sam@example.com")
    event = {
        "triggerSource": "PostConfirmation_ConfirmSignUp",
        "userPoolId": pool_id,
        "userName": username,
        "request": {"userAttributes": {"sub": sub, "email": "sam@example.com"}},
        "response": {},
    }
    cognito_post_confirmation.handler(event, None)
    assert aws.Table("unit-user").get_item(Key={"userId": sub})["Item"]["displayName"] == "sam"


def test_post_confirmation_cleans_a_name_that_skipped_the_sign_up_checks(aws):
    client, pool_id, username, sub = _pool_with_user("kim@example.com")
    event = {
        "triggerSource": "PostConfirmation_ConfirmSignUp",
        "userPoolId": pool_id,
        "userName": username,
        "request": {"userAttributes": {"sub": sub, "email": "kim@example.com", "name": "Kim‮" + "x" * 200}},
        "response": {},
    }
    cognito_post_confirmation.handler(event, None)
    # Hidden characters: the name is unusable, so the email's name part is shown instead.
    assert aws.Table("unit-user").get_item(Key={"userId": sub})["Item"]["displayName"] == "kim"
