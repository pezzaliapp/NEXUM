"""CODE PIN (2026-10-30): the data of NEXUM reach production every day by themselves; its code never does.

Every run of nexum-events checks out the code the author approved — an annotated git tag approved-YYYYMMDD-<sha>,
named by the repository variable NEXUM_CODE_PIN, which only the author moves — never the newest commit of main. Only the
data change between two publications: the reference world and what the approved sources deliver.

    check   the code checked out is exactly the pin (an annotated approved-* tag, its name's sha its commit's, on main),
            the working tree is clean, and the workflow file running now (always main's: GitHub runs a schedule from
            the default branch) is byte-identical to the pin's. A run of main's newest code (manual, code=main) is
            allowed for a preview only: it never deploys to production and never stores a reference world.
    clean   before a deploy: no tracked file changed since the checkout (the build writes only ignored paths).

Prints one JSON line (check: PINNED, CODE_SHA, CODE_PIN also appended to --github-env); exit 0 = allowed, 4 = refused (the reason is printed and the run stops). Nothing is written to git.
"""

import argparse
import json
import re
import subprocess
import sys

PIN_RE = re.compile(r"^approved-(\d{8})-([0-9a-f]{7,40})$")
WORKFLOW = ".github/workflows/nexum-events.yml"


class Refused(Exception):
    pass


def git(*args, cwd=None) -> str:
    p = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if p.returncode != 0:
        raise Refused(f"git {' '.join(args)}: {(p.stderr or p.stdout).strip()[:200]}")
    return p.stdout.strip()


def ok(*args, cwd=None) -> bool:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True).returncode == 0


def check(pin: str, main: str, code: str, deploy: str, cwd=None) -> dict:
    head = git("rev-parse", "HEAD", cwd=cwd)
    if code == "main":                      # the newest code of main, by the author's hand, for a preview only
        if deploy == "production":
            raise Refused("code=main never deploys to production: production runs only the approved code (NEXUM_CODE_PIN)")
        if head != git("rev-parse", f"{main}^{{commit}}", cwd=cwd):
            raise Refused(f"code=main but the checkout is {head}, not {main}")
        return {"pinned": False, "code_sha": head, "pin": None, "store_reference": False}
    if code != "pin":
        raise Refused(f"unknown code choice {code!r}")
    m = PIN_RE.match(pin or "")
    if not m:
        raise Refused(f"NEXUM_CODE_PIN {pin!r} is not an approved-YYYYMMDD-<sha> tag: nothing runs without approved code")
    if git("cat-file", "-t", f"refs/tags/{pin}", cwd=cwd) != "tag":
        raise Refused(f"{pin} is not an annotated tag")
    sha = git("rev-parse", f"refs/tags/{pin}^{{commit}}", cwd=cwd)
    if not sha.startswith(m.group(2)):
        raise Refused(f"{pin} names {m.group(2)} but points to {sha}")
    if not ok("merge-base", "--is-ancestor", sha, main, cwd=cwd):
        raise Refused(f"{pin} ({sha[:12]}) is not on main ({main[:12]}): approved code is code of main")
    if head != sha:
        raise Refused(f"the checkout is {head[:12]}, not the approved {sha[:12]}")
    if git("status", "--porcelain", "--untracked-files=no", cwd=cwd):
        raise Refused("tracked files differ from the approved code")
    if git("rev-parse", f"{sha}:{WORKFLOW}", cwd=cwd) != git("rev-parse", f"{main}:{WORKFLOW}", cwd=cwd):
        raise Refused(f"{WORKFLOW} on main differs from the approved one: a workflow change needs a new approval")
    return {"pinned": True, "code_sha": sha, "pin": pin, "store_reference": True}


def clean(cwd=None) -> dict:
    if git("status", "--porcelain", "--untracked-files=no", cwd=cwd):
        raise Refused("a tracked file changed during the run: nothing is deployed")
    return {"clean": True, "code_sha": git("rev-parse", "HEAD", cwd=cwd)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="codepin")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("--pin", default="")
    c.add_argument("--main", required=True)
    c.add_argument("--code", default="pin")
    c.add_argument("--deploy", default="none")
    c.add_argument("--github-env", default="", help="append PINNED, CODE_SHA, CODE_PIN to this file (GitHub's env file)")
    sub.add_parser("clean")
    a = ap.parse_args(argv)
    try:
        out = check(a.pin, a.main, a.code or "pin", a.deploy) if a.cmd == "check" else clean()
    except Refused as e:
        print(json.dumps({"refused": str(e)}))
        return 4
    print(json.dumps(out))
    if a.cmd == "check" and a.github_env:
        with open(a.github_env, "a") as fh:
            fh.write(f"PINNED={str(out['pinned']).lower()}\nCODE_SHA={out['code_sha']}\nCODE_PIN={out['pin'] or 'main'}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
