import boto3

from conftest import REGION
from handlers import cognito_post_confirmation, cognito_pre_signup


def test_pre_signup_auto_confirms_public_signups():
    event = {"triggerSource": "PreSignUp_SignUp", "request": {"userAttributes": {"email": "a@b.com"}}, "response": {}}
    result = cognito_pre_signup.handler(event, None)
    assert result["response"] == {"autoConfirmUser": True, "autoVerifyEmail": True}


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
