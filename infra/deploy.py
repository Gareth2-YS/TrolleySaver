"""Deploy TrolleySaver to AWS with one command: test it, deploy the backend stack, then build and upload
the web app to its CloudFront site.

    python infra\\deploy.py                     # everything, to dev
    python infra\\deploy.py --profile <name>    # use this AWS CLI profile (e.g. the team's SSO profile)
    python infra\\deploy.py --skip-tests        # e.g. straight after a green CI run
    python infra\\deploy.py --backend-only      # just the stack: API, Lambdas, Cognito, buckets, CloudFront
    python infra\\deploy.py --frontend-only     # just rebuild and upload the web app
    python infra\\deploy.py --smoke             # finish with the end-to-end smoke test against the stack

Each step stops the deploy if it fails:
  1. Preflight   the tools are installed, who you are signed in as, and the stack's photo bucket is
                 visible (proof you are in the right AWS account)
  2. Tests       backend and frontend unit tests and the template lint (tests/run_all.py)
  3. Backend     sam validate --lint, then sam deploy (CloudFormation rolls the stack back if it fails)
  4. Outputs     the stack's API URL, Cognito ids, site bucket and CloudFront distribution
  5. Build       npm run build, with the production settings taken from those outputs
  6. Upload      new files first, then index.html, then old files are removed; content-hashed files are
                 cached for a year, index.html never
  7. Invalidate  CloudFront drops its cached copies, so visitors get the new version straight away
  8. Check       the site and a deep link answer with the app (and, with --smoke, the smoke test)

Standard library only (any Python 3). It runs the aws, sam and npm commands, which must be installed;
see docs/deployment.md.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
DIST = FRONTEND / "dist"
DEFAULT_REGION = "ap-southeast-1"
FRONTEND_OUTPUTS = ("ApiUrl", "UserPoolId", "UserPoolClientId", "Region", "FrontendBucketName", "FrontendDistributionId", "SiteUrl")
LONG_CACHE = "public,max-age=31536000,immutable"


class DeployError(Exception):
    """A step failed; the message says what to do."""


def heading(number, title):
    print(f"\n===== {number}. {title}\n", flush=True)


def tool(name, hint):
    path = shutil.which(name)
    if not path:
        raise DeployError(f"`{name}` isn't installed or isn't on PATH. {hint}")
    return path


def run(command, cwd=ROOT, env=None, capture=False):
    """Run a command, showing it first. Stops the deploy if it fails."""
    shown = " ".join([Path(command[0]).stem, *command[1:]])
    if not capture:
        print(f"> {shown}", flush=True)
    result = subprocess.run(command, cwd=cwd, env=env, text=True, encoding="utf-8", errors="replace",
                            capture_output=capture)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip() if capture else ""
        raise DeployError(f"`{shown}` failed (exit {result.returncode}).{' ' + detail if detail else ''}")
    return result.stdout


class Aws:
    def __init__(self, env):
        self.cli = tool("aws", "Install the AWS CLI v2.")
        self.env = env

    def json(self, *args):
        out = run([self.cli, *args, "--output", "json"], env=self.env, capture=True)
        return json.loads(out) if out.strip() else {}

    def run(self, *args):
        run([self.cli, *args], env=self.env)

    def stack_outputs(self, stack):
        try:
            described = self.json("cloudformation", "describe-stacks", "--stack-name", stack)
        except DeployError as error:
            if "does not exist" in str(error):
                return None
            raise
        return {o["OutputKey"]: o["OutputValue"] for o in described["Stacks"][0].get("Outputs", [])}


def child_env(args):
    """The environment for aws, sam and npm: the chosen profile, and a region (some profiles have none)."""
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "SAM_CLI_TELEMETRY": "0"}
    if args.profile:
        env["AWS_PROFILE"] = args.profile
    env.setdefault("AWS_REGION", args.region)
    env.setdefault("AWS_DEFAULT_REGION", env["AWS_REGION"])
    return env


def preflight(args, aws, stack):
    heading(1, "Preflight")
    if not args.frontend_only:
        tool("sam", "Install the AWS SAM CLI (winget install Amazon.SAM-CLI) and open a new terminal.")
    if not args.backend_only:
        tool("npm", "Install Node.js 22 or later.")
    if not args.skip_tests and not (BACKEND / ".venv").is_dir():
        raise DeployError("backend/.venv is missing, so the backend tests can't run. Set it up as in backend/TESTING.md part 0, or pass --skip-tests.")
    try:
        identity = aws.json("sts", "get-caller-identity")
    except DeployError as error:
        raise DeployError(f"Not signed in to AWS ({error}). Copy fresh keys from the AWS access portal into "
                          "%USERPROFILE%\\.aws\\credentials (docs/deployment.md, Signing in to AWS), then try again.")
    print(f"Signed in as {identity['Arn']}\nAccount {identity['Account']}, region {aws.env['AWS_REGION']}")

    outputs = aws.stack_outputs(stack)
    if outputs is None:
        print(f"Stack {stack} doesn't exist yet: this deploy creates it.")
    else:
        bucket = outputs.get("PhotoBucketName")
        try:
            aws.json("s3api", "head-bucket", "--bucket", bucket)
        except DeployError:
            raise DeployError(f"Can't see the stack's photo bucket {bucket}. Are you signed in to the right AWS account?")
        print(f"Photo bucket {bucket} is visible: this is the right account.")
    if not args.frontend_only:
        try:
            aws.json("cloudfront", "list-distributions", "--max-items", "1")
        except DeployError as error:
            raise DeployError(f"CloudFront isn't available to this account or role ({error}). The web app is hosted on CloudFront.")
        print("CloudFront is available.")


def install_frontend(env):
    run([tool("npm", "Install Node.js 22 or later."), "ci", "--no-audit", "--no-fund"], cwd=FRONTEND, env=env)


def tests(env):
    heading(2, "Tests")
    install_frontend(env)  # so the frontend suite runs instead of being skipped
    run([sys.executable, str(ROOT / "tests" / "run_all.py"), "--only", "backend,frontend,lint"], env=env)


def deploy_backend(args, env):
    heading(3, "Backend")
    sam = tool("sam", "Install the AWS SAM CLI.")
    run([sam, "validate", "--lint"], cwd=BACKEND, env=env)
    run([sam, "deploy", "--config-env", args.env, "--no-progressbar"], cwd=BACKEND, env=env)


def read_outputs(aws, stack):
    heading(4, "Stack outputs")
    outputs = aws.stack_outputs(stack) or {}
    missing = [key for key in FRONTEND_OUTPUTS if key not in outputs]
    if missing:
        raise DeployError(f"The stack has no {', '.join(missing)} output yet. Deploy the backend first (without --frontend-only).")
    for key in FRONTEND_OUTPUTS:
        print(f"{key:24} {outputs[key]}")
    return outputs


def build_frontend(outputs, env, installed):
    heading(5, "Build")
    if not installed:
        install_frontend(env)
    # Vite gives these priority over any frontend/.env.local, so a developer's local settings never leak
    # into the deployed build. None of them are secrets: they all ship to every visitor's browser.
    build_env = {
        **env,
        "VITE_AUTH_MODE": "cognito",
        "VITE_PRICE_SUBMISSION_MODE": "api",
        "VITE_SMART_BASKET_MODE": "api",
        "VITE_API_BASE_URL": outputs["ApiUrl"],
        "VITE_AWS_REGION": outputs["Region"],
        "VITE_COGNITO_USER_POOL_ID": outputs["UserPoolId"],
        "VITE_COGNITO_CLIENT_ID": outputs["UserPoolClientId"],
    }
    run([tool("npm", "Install Node.js."), "run", "build"], cwd=FRONTEND, env=build_env)
    if not (DIST / "index.html").is_file():
        raise DeployError("The build finished without frontend/dist/index.html.")


def upload(aws, outputs):
    heading(6, "Upload")
    target = f"s3://{outputs['FrontendBucketName']}"
    # 1. The new build's files. Vite puts a content hash in each asset's name, so a changed file gets a
    #    new name and can be cached for a year.
    aws.run("s3", "sync", str(DIST), target, "--exclude", "index.html", "--cache-control", LONG_CACHE, "--only-show-errors")
    # 2. The page that points at them, never cached, so a reload always picks up the new build.
    aws.run("s3", "cp", str(DIST / "index.html"), f"{target}/index.html", "--cache-control", "no-cache",
            "--content-type", "text/html; charset=utf-8", "--only-show-errors")
    # 3. Only then remove the old build's files, so nobody mid-visit gets a page whose files are gone.
    aws.run("s3", "sync", str(DIST), target, "--exclude", "index.html", "--delete", "--only-show-errors")
    print(f"Uploaded frontend/dist to {target}")


def invalidate(aws, outputs):
    heading(7, "Invalidate the CloudFront cache")
    distribution = outputs["FrontendDistributionId"]
    created = aws.json("cloudfront", "create-invalidation", "--distribution-id", distribution, "--paths", "/*")
    invalidation = created["Invalidation"]["Id"]
    print(f"Invalidation {invalidation} started; waiting for it to finish (usually under a minute)...", flush=True)
    aws.run("cloudfront", "wait", "invalidation-completed", "--distribution-id", distribution, "--id", invalidation)


def check_site(site):
    heading(8, "Check the site")
    for path in ("/", "/search", "/contribute"):
        url = site.rstrip("/") + path
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                body = response.read().decode("utf-8", "replace")
                ok = response.status == 200 and '<div id="root">' in body
        except urllib.error.URLError as error:
            raise DeployError(f"{url} didn't answer: {error}")
        if not ok:
            raise DeployError(f"{url} answered, but not with the app's page.")
        print(f"OK  {url}")


def smoke(args, env):
    heading("8b", "Smoke test")
    python = BACKEND / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        raise DeployError("backend/.venv is missing, so the smoke test can't run.")
    run([str(python), str(Path("scripts") / "smoke_test.py"), "--env", args.env, "--region", env["AWS_REGION"]], cwd=BACKEND, env=env)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", default="dev", help="Environment, i.e. stack trolleysaver-<env> and samconfig [<env>.*] (default dev)")
    parser.add_argument("--profile", help="AWS CLI profile to use (default: AWS_PROFILE, or the CLI's default)")
    parser.add_argument("--region", default=DEFAULT_REGION, help=f"Region when the profile has none (default {DEFAULT_REGION})")
    parser.add_argument("--skip-tests", action="store_true", help="Don't run the unit tests and template lint first")
    only = parser.add_mutually_exclusive_group()
    only.add_argument("--backend-only", action="store_true", help="Deploy the stack, but don't build or upload the web app")
    only.add_argument("--frontend-only", action="store_true", help="Build and upload the web app, but don't deploy the stack")
    parser.add_argument("--smoke", action="store_true", help="Finish with backend/scripts/smoke_test.py against the stack")
    args = parser.parse_args()
    sys.stdout.reconfigure(errors="replace")

    started = time.monotonic()
    stack = f"trolleysaver-{args.env}"
    env = child_env(args)
    try:
        aws = Aws(env)
        preflight(args, aws, stack)
        if not args.skip_tests:
            tests(env)
        if not args.frontend_only:
            deploy_backend(args, env)
        outputs = read_outputs(aws, stack)
        if not args.backend_only:
            build_frontend(outputs, env, installed=not args.skip_tests)
            upload(aws, outputs)
            invalidate(aws, outputs)
            check_site(outputs["SiteUrl"])
        if args.smoke:
            smoke(args, env)
    except DeployError as error:
        print(f"\nDeploy stopped: {error}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nStopped.")
        sys.exit(130)

    minutes, seconds = divmod(int(time.monotonic() - started), 60)
    print(f"\nDone in {minutes}m {seconds:02d}s. The site: {outputs['SiteUrl']}")


if __name__ == "__main__":
    main()
