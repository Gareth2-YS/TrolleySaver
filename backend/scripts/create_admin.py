"""Provision an administrator account in a deployed stack's Cognito User Pool.

Usage (from backend/):
    .venv/Scripts/python scripts/create_admin.py --env dev --email admin@example.com --name "Jane Admin"

The password is prompted for (or read from TROLLEYSAVER_ADMIN_PASSWORD) and set as permanent, so the
first sign-in has no forced password change. No invitation email is sent.
"""

import argparse
import getpass
import os
import re
from datetime import datetime, timezone

import boto3

from stack import DEFAULT_REGION, stack_outputs

PASSWORD_POLICY = "at least 8 characters, with an upper-case letter, a lower-case letter, a number and a symbol"


def password_problem(password):
    """Mirror the user pool's password policy so a bad password fails before anything is created."""
    checks = (len(password) >= 8, re.search(r"[A-Z]", password), re.search(r"[a-z]", password),
              re.search(r"\d", password), re.search(r"[^A-Za-z0-9]", password))
    return None if all(checks) else f"The password must be {PASSWORD_POLICY}."


def ask_password():
    while True:
        password = getpass.getpass("Password for the admin account: ")
        problem = password_problem(password)
        if problem:
            print(problem)
        elif getpass.getpass("Type it again: ") != password:
            print("The passwords didn't match.")
        else:
            return password


def create_admin(cognito, dynamodb_table, pool_id, email, name, password):
    try:
        cognito.admin_create_user(
            UserPoolId=pool_id,
            Username=email,
            MessageAction="SUPPRESS",
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "name", "Value": name},
            ],
        )
        print(f"Created {email}")
    except cognito.exceptions.UsernameExistsException:
        print(f"{email} already exists; updating password and group")
    cognito.admin_set_user_password(UserPoolId=pool_id, Username=email, Password=password, Permanent=True)
    cognito.admin_add_user_to_group(UserPoolId=pool_id, Username=email, GroupName="admin")

    user = cognito.admin_get_user(UserPoolId=pool_id, Username=email)
    sub = next(a["Value"] for a in user["UserAttributes"] if a["Name"] == "sub")
    # AdminCreateUser does not fire the PostConfirmation trigger, so create the profile row here.
    dynamodb_table.update_item(
        Key={"userId": sub},
        UpdateExpression="SET displayName = :name, email = :email, createdAt = if_not_exists(createdAt, :now) "
        "ADD submissionCount :zero",
        ExpressionAttributeValues={
            ":name": name,
            ":email": email,
            ":now": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            ":zero": 0,
        },
    )
    return sub


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--region", default=DEFAULT_REGION)
    args = parser.parse_args()

    password = os.environ.get("TROLLEYSAVER_ADMIN_PASSWORD")
    if password and password_problem(password):
        raise SystemExit(f"TROLLEYSAVER_ADMIN_PASSWORD is not valid: {password_problem(password)}")
    password = password or ask_password()

    outputs = stack_outputs(args.env, args.region)
    cognito = boto3.client("cognito-idp", region_name=args.region)
    users = boto3.resource("dynamodb", region_name=args.region).Table(f"trolleysaver-{args.env}-user")
    try:
        sub = create_admin(cognito, users, outputs["UserPoolId"], args.email, args.name, password)
    except cognito.exceptions.InvalidPasswordException as error:
        raise SystemExit(f"Cognito rejected the password ({error.response['Error']['Message']}). "
                         "Run the command again with a different password.")
    print(f"{args.email} is an admin (sub {sub}). Sign in with this email and password; no email is sent.")


if __name__ == "__main__":
    main()
