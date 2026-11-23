#!/usr/bin/env python3
"""Preview and apply the lifecycle of a public app on the website host."""

import argparse
from dataclasses import dataclass
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

from app_caddy import CaddyRoutes
from app_dns import CloudflareDNS


ROOT = Path(__file__).resolve().parent.parent
ZONE = "wentongzhang.com"
NETWORK = "shared"
SLUG = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,57}[a-z0-9])?")


@dataclass(frozen=True)
class App:
    name: str
    compose_file: Path
    port: int

    @property
    def hostname(self) -> str:
        return f"{self.name}.{ZONE}"

    @property
    def project(self) -> str:
        return f"app-{self.name}"

    @property
    def upstream(self) -> str:
        return f"{self.project}:{self.port}"


def load_app(root: Path, name: str) -> App:
    if not SLUG.fullmatch(name) or name == "www":
        raise RuntimeError(f"Invalid app label: {name!r}. Use a lowercase DNS label other than 'www'.")

    apps = json.loads((root / "apps.json").read_text())
    if not isinstance(apps, dict):
        raise RuntimeError("apps.json must be an object keyed by app name.")
    if name not in apps:
        raise RuntimeError(f"App {name!r} is missing from apps.json.")
    entry = apps[name]
    if not isinstance(entry, dict) or set(entry) != {"compose_file", "port"}:
        raise RuntimeError(f"App {name!r} must define compose_file and port.")
    if not isinstance(entry["compose_file"], str) or not entry["compose_file"]:
        raise RuntimeError(f"App {name!r} needs a path to a Compose file.")
    if type(entry["port"]) is not int or not 1 <= entry["port"] <= 65535:
        raise RuntimeError(f"App {name!r} needs a port from 1 to 65535.")

    compose_file = (root / entry["compose_file"]).resolve()
    if not compose_file.is_file():
        raise RuntimeError(f"Compose file does not exist: {compose_file}")
    if compose_file == root / "docker-compose.yml":
        raise RuntimeError("Each app needs its own Compose file.")
    return App(name, compose_file, entry["port"])


class ComposeApp:
    def __init__(self, app: App):
        self.app = app
        self.command = [
            "docker", "compose", "--ansi", "never",
            "--project-name", app.project, "--file", str(app.compose_file),
        ]
        # The deployment credential belongs to appctl, not to app containers.
        self.env = os.environ.copy()
        self.env.pop("CF_API_TOKEN", None)

    def run(self, args, *, capture: bool = False):
        return subprocess.run(
            [*self.command, *args],
            cwd=self.app.compose_file.parent,
            env=self.env,
            check=True,
            stdout=subprocess.PIPE if capture else None,
            text=True,
        ).stdout

    def validate_launch(self):
        config = json.loads(self.run(["config", "--format", "json"], capture=True))
        networks = config.get("networks", {})
        shared = {
            key for key, network in networks.items()
            if network.get("external") and network.get("name") == NETWORK
        }
        endpoints = []
        for name, service in config["services"].items():
            attachments = service.get("networks", {})
            if any(
                name == self.app.project or
                self.app.project in ((attachments[key] or {}).get("aliases") or [])
                for key in shared.intersection(attachments)
            ):
                endpoints.append(name)
        if len(endpoints) != 1:
            raise RuntimeError(
                f"Exactly one service in {self.app.project} must use the name or alias "
                f"{self.app.project!r} on the external {NETWORK!r} network."
            )

    def preview(self, args):
        print("Compose preview: " + shlex.join([*self.command, *args]), flush=True)
        self.run(["--dry-run", *args])


def lifecycle(root: Path, name: str, launching: bool, apply: bool):
    app = load_app(root, name)
    compose = ComposeApp(app)
    caddy = CaddyRoutes(root)
    dns = CloudflareDNS(ZONE)
    dns_change = dns.plan(app.hostname, launching)
    route_change = caddy.plan(app.name, app.hostname, app.upstream, launching)

    if launching:
        compose.validate_launch()
        compose_args = ["up", "--build", "--wait", "--wait-timeout", "90", "--remove-orphans"]
    else:
        compose_args = ["down", "--remove-orphans"]

    print(f"Previewing {('launch' if launching else 'retire')} for {app.hostname}.", flush=True)
    print(f"DNS: {dns_change.description}", flush=True)
    print(f"Caddy: {route_change.description}", flush=True)
    caddy.validate(route_change)
    compose.preview(compose_args)
    if not apply:
        print("Dry run complete. Pass --apply to make these changes.")
        return

    # Launch the upstream before making it public. Retire the route before
    # stopping the upstream so clients with cached DNS cannot reach it.
    steps = {
        "Compose": lambda: compose.run(compose_args),
        "Caddy": lambda: caddy.apply(route_change),
        "DNS": lambda: dns.apply(dns_change),
    }
    order = ["Compose", "Caddy", "DNS"] if launching else ["Caddy", "DNS", "Compose"]
    for stage in order:
        print(f"Applying {stage} changes for {app.hostname}.", flush=True)
        try:
            steps[stage]()
        except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
            raise RuntimeError(
                f"{stage} failed: {error}. Earlier steps may have succeeded. "
                "Fix the error and rerun the same command to continue."
            ) from error
    print(f"{app.hostname} {'launched' if launching else 'retired'}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["launch", "retire"])
    parser.add_argument("app", help="App name in apps.json")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Preview changes (default)")
    mode.add_argument("--apply", action="store_true", help="Apply the previewed changes")
    args = parser.parse_args()

    try:
        if not args.apply:
            lifecycle(ROOT, args.app, args.action == "launch", apply=False)
            return 0
        lock_path = ROOT / ".app-state" / "deploy.lock"
        lock_path.parent.mkdir(exist_ok=True)
        with lock_path.open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            lifecycle(ROOT, args.app, args.action == "launch", apply=True)
    except (OSError, RuntimeError, subprocess.CalledProcessError, ValueError) as error:
        print(f"appctl: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
