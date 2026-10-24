"""Shared helper: read a deployed TrolleySaver stack's outputs."""

import boto3

DEFAULT_REGION = "ap-southeast-1"


def stack_outputs(env, region=DEFAULT_REGION):
    stack = boto3.client("cloudformation", region_name=region).describe_stacks(StackName=f"trolleysaver-{env}")["Stacks"][0]
    return {o["OutputKey"]: o["OutputValue"] for o in stack.get("Outputs", [])}
