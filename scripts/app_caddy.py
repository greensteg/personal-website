"""Preview and update the Caddy route belonging to a single app."""

import difflib
import json
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


CADDYFILE = "/etc/caddy/Caddyfile"
ROUTE_MOUNT = "/etc/caddy/app-routes"
IMPORT = f"import {ROUTE_MOUNT}/*.caddy"
OWNER = "# Managed by the personal-website app lifecycle"


@dataclass(frozen=True)
class RouteChange:
    path: Path
    hostname: str
    before: Optional[str]
    after: Optional[str]

    @property
    def description(self) -> str:
        if self.before == self.after:
            return f"{self.hostname} (no Caddy file change)"
        return "".join(
            difflib.unified_diff(
                (self.before or "").splitlines(keepends=True),
                (self.after or "").splitlines(keepends=True),
                fromfile=self.path.name if self.before is not None else "/dev/null",
                tofile=self.path.name if self.after is not None else "/dev/null",
            )
        ).rstrip()


class CaddyRoutes:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.directory = self.root / "caddy" / "app-routes"
        self.compose = ["docker", "compose", "-f", str(self.root / "docker-compose.yml")]

    def plan(self, app: str, hostname: str, upstream: str, launching: bool) -> RouteChange:
        if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,57}[a-z0-9])?", app):
            raise RuntimeError(f"Invalid Caddy app name: {app}")
        if not re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)+", hostname):
            raise RuntimeError(f"Invalid Caddy hostname: {hostname}")
        if not re.fullmatch(r"[a-z0-9-]+:[0-9]+", upstream):
            raise RuntimeError(f"Invalid Caddy upstream: {upstream}")
        path = self.directory / f"{app}.caddy"
        before = self._read_route(path)
        header = f"{OWNER}\n{hostname} {{\n"
        if before is not None and not before.startswith(header):
            raise RuntimeError(f"Refusing to replace an unmanaged Caddy route at {path}")
        after = f"{header}\treverse_proxy {upstream}\n}}\n" if launching else None
        return RouteChange(path, hostname, before, after)

    def validate(self, change: RouteChange) -> None:
        self._check_unchanged(change)
        self._check_mount()
        caddyfile = self._web("cat", CADDYFILE)
        lines = caddyfile.splitlines(keepends=True)
        positions = [index for index, line in enumerate(lines) if line.rstrip("\r\n") == IMPORT]
        if len(positions) != 1:
            raise RuntimeError("The running website does not have the app-route import. Redeploy it first.")

        fragments = {
            path.name: f"import {json.dumps(f'{ROUTE_MOUNT}/{path.name}')}\n"
            for path in self.directory.glob("*.caddy")
            if path != change.path
        }
        if change.after is not None:
            fragments[change.path.name] = change.after
        lines[positions[0]] = "".join(fragments[name] for name in sorted(fragments))
        self._web(
            "caddy", "validate", "--config", "/dev/stdin", "--adapter", "caddyfile",
            input_text="".join(lines),
        )

    def apply(self, change: RouteChange) -> None:
        self._check_unchanged(change)
        changed = change.before != change.after
        if changed:
            self._write_route(change.path, change.after)
        try:
            # Reload even with no diff so reruns recover a previously interrupted reload.
            self._reload()
        except (RuntimeError, KeyboardInterrupt) as error:
            if changed:
                try:
                    self._write_route(change.path, change.before)
                    self._reload()
                except RuntimeError as rollback_error:
                    raise RuntimeError(
                        f"Caddy reload failed and the rollback did not complete: {rollback_error}"
                    ) from error
            raise

    def _check_mount(self) -> None:
        container = self._run([*self.compose, "ps", "-q", "web"]).split()
        if len(container) != 1:
            raise RuntimeError("Expected one running website container. Deploy the website first.")
        mounts = json.loads(self._run(["docker", "inspect", "--format", "{{json .Mounts}}", container[0]]))
        expected = self.directory.resolve()
        for mount in mounts:
            if (
                mount["Destination"] == ROUTE_MOUNT
                and mount["Type"] == "bind"
                and Path(mount["Source"]).resolve() == expected
                and not mount["RW"]
            ):
                return
        raise RuntimeError("The running website does not have the app-route mount. Redeploy it first.")

    def _reload(self) -> None:
        self._web("caddy", "reload", "--config", CADDYFILE, "--adapter", "caddyfile")

    def _web(self, *args: str, input_text: Optional[str] = None) -> str:
        return self._run([*self.compose, "exec", "-T", "web", *args], input_text=input_text)

    def _run(self, command: list[str], input_text: Optional[str] = None) -> str:
        try:
            result = subprocess.run(
                command, cwd=self.root, input=input_text, text=True, capture_output=True, timeout=30,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise RuntimeError(f"Unable to run {' '.join(command)}: {error}") from error
        if result.returncode:
            detail = result.stderr.strip() or result.stdout.strip() or f"exit {result.returncode}"
            raise RuntimeError(f"{' '.join(command)} failed: {detail}")
        return result.stdout

    def _check_unchanged(self, change: RouteChange) -> None:
        if self._read_route(change.path) != change.before:
            raise RuntimeError(f"Caddy route changed since planning: {change.path}. Run the command again.")

    @staticmethod
    def _read_route(path: Path) -> Optional[str]:
        try:
            if path.is_symlink() or path.exists() and not path.is_file():
                raise RuntimeError(f"Expected a regular Caddy route file: {path}")
            return path.read_text()
        except FileNotFoundError:
            return None
        except (OSError, UnicodeError) as error:
            raise RuntimeError(f"Unable to read Caddy route {path}: {error}") from error

    @staticmethod
    def _write_route(path: Path, content: Optional[str]) -> None:
        pending = None
        try:
            if content is None:
                path.unlink(missing_ok=True)
                return
            with tempfile.NamedTemporaryFile("w", dir=path.parent, suffix=".tmp", delete=False) as handle:
                pending = Path(handle.name)
                handle.write(content)
            pending.chmod(0o644)
            pending.replace(path)
        except OSError as error:
            raise RuntimeError(f"Unable to update Caddy route {path}: {error}") from error
        finally:
            if pending is not None:
                pending.unlink(missing_ok=True)
