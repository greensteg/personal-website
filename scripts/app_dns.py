"""Manage the Cloudflare CNAME for a personal website app."""

import json
import os
import re
from dataclasses import dataclass
from http.client import HTTPException
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener


API_URL = "https://api.cloudflare.com/client/v4"
TTL = 300
OWNERSHIP_COMMENT = "managed-by:personal-website"
PAGE_SIZE = 50
HOST_LABEL = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?")


class _UncertainRequest(RuntimeError):
    """The request may have completed without a readable response."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _normalize_name(name):
    return name.lower().removesuffix(".") if isinstance(name, str) else ""


def _hostname(name):
    normalized = _normalize_name(name)
    if len(normalized) > 253 or not all(
        HOST_LABEL.fullmatch(label) for label in normalized.split(".")
    ):
        raise RuntimeError("Invalid DNS hostname")
    return normalized


@dataclass(frozen=True)
class DNSChange:
    hostname: str
    launching: bool
    zone_name: str
    zone_id: str
    record_id: Optional[str] = None
    modified_on: Optional[str] = None
    comment_modified_on: Optional[str] = None

    @property
    def description(self) -> str:
        if self.launching:
            action = "keep" if self.record_id else "create"
        else:
            action = "delete" if self.record_id else "confirm absence of"
        return f"{action} DNS-only CNAME {self.hostname} -> {self.zone_name} (TTL {TTL}s)"


class CloudflareDNS:
    def __init__(self, zone_name: str):
        self.zone_name = _hostname(zone_name)
        self._token = os.environ.get("CF_API_TOKEN", "").strip()
        if not self._token:
            raise RuntimeError("CF_API_TOKEN is required for Cloudflare DNS access")
        self._opener = build_opener(_NoRedirect())
        zones = self._list("/zones", {"name": self.zone_name, "status": "active"})
        if (
            len(zones) != 1
            or _normalize_name(zones[0].get("name")) != self.zone_name
            or zones[0].get("status") != "active"
            or not self._has_id(zones[0])
        ):
            raise RuntimeError(f"Expected exactly one active Cloudflare zone for {self.zone_name}")
        self._zone_id = zones[0]["id"]
        self._records_path = f"/zones/{quote(self._zone_id, safe='')}/dns_records"

    def plan(self, hostname: str, launching: bool) -> DNSChange:
        hostname = _hostname(hostname)
        if not hostname.endswith(f".{self.zone_name}"):
            raise RuntimeError(f"Expected an app hostname under {self.zone_name}")

        records = self._list(self._records_path, {"name.exact": hostname})
        if not records:
            return DNSChange(hostname, launching, self.zone_name, self._zone_id)
        if len(records) != 1 or not self._is_owned(records[0], hostname):
            raise RuntimeError(f"Cloudflare DNS has conflicting or unmanaged records for {hostname}")

        record = records[0]
        return DNSChange(
            hostname,
            launching,
            self.zone_name,
            self._zone_id,
            record["id"],
            record.get("modified_on"),
            record.get("comment_modified_on"),
        )

    def apply(self, change: DNSChange) -> None:
        if self.plan(change.hostname, change.launching) != change:
            raise RuntimeError(f"Cloudflare DNS changed since planning for {change.hostname}")
        if bool(change.record_id) == change.launching:
            return

        try:
            if change.launching:
                self._request(
                    "POST",
                    self._records_path,
                    {
                        "type": "CNAME",
                        "name": change.hostname,
                        "content": self.zone_name,
                        "ttl": TTL,
                        "proxied": False,
                        "comment": OWNERSHIP_COMMENT,
                    },
                )
            else:
                self._request("DELETE", f"{self._records_path}/{quote(change.record_id, safe='')}")
        except _UncertainRequest:
            if self._matches_desired_state(change):
                return
            raise

        if not self._matches_desired_state(change):
            raise RuntimeError(f"Could not verify the Cloudflare DNS change for {change.hostname}")

    def _matches_desired_state(self, change):
        current = self.plan(change.hostname, change.launching)
        return bool(current.record_id) == change.launching

    @staticmethod
    def _has_id(resource):
        resource_id = resource.get("id")
        return isinstance(resource_id, str) and bool(resource_id)

    def _is_owned(self, record, hostname):
        return (
            _normalize_name(record.get("name")) == hostname
            and record.get("type") == "CNAME"
            and _normalize_name(record.get("content")) == self.zone_name
            and record.get("ttl") == TTL
            and record.get("proxied") is False
            and record.get("comment") == OWNERSHIP_COMMENT
            and self._has_id(record)
        )

    def _list(self, path, filters):
        query = urlencode({**filters, "page": 1, "per_page": PAGE_SIZE})
        payload = self._request("GET", f"{path}?{query}")
        results = payload.get("result")
        info = payload.get("result_info")
        if (
            not isinstance(results, list)
            or not all(isinstance(result, dict) for result in results)
            or not isinstance(info, dict)
        ):
            raise RuntimeError("Cloudflare returned an invalid list response")
        total_pages = info.get("total_pages", 1)
        page = info.get("page")
        page_size = info.get("per_page")
        if (
            page != 1
            or not isinstance(page_size, int)
            or not isinstance(total_pages, int)
            or not 0 <= total_pages <= 1
            or len(results) >= page_size
        ):
            # Exact lookups should fit on one page. An incomplete list cannot prove ownership.
            raise RuntimeError("Cloudflare exact lookup did not return a complete single page")
        return results

    def _request(self, method, path, data=None):
        headers = {"Authorization": f"Bearer {self._token}", "Accept": "application/json"}
        body = None
        if data is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(data).encode("utf-8")
        request = Request(f"{API_URL}{path}", data=body, headers=headers, method=method)
        try:
            with self._opener.open(request, timeout=15) as response:
                payload = json.load(response)
        except HTTPError as error:
            error.close()
            error_type = _UncertainRequest if error.code >= 500 else RuntimeError
            raise error_type(f"Cloudflare {method} failed with HTTP {error.code}") from None
        except (URLError, OSError, HTTPException, ValueError):
            raise _UncertainRequest(f"Cloudflare {method} did not return a usable response") from None
        if not isinstance(payload, dict):
            raise _UncertainRequest(f"Cloudflare {method} returned an invalid response")
        if payload.get("success") is not True:
            raise RuntimeError(f"Cloudflare rejected the {method} request")
        return payload
