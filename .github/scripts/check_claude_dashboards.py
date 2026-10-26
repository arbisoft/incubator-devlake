#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

"""Check the Claude dashboards load as classic Grafana JSON and their drill-down links resolve.

usage: check_claude_dashboards.py <dashboards root> <checked folder>

Every dashboard under the checked folder must be classic dashboard JSON (not the v2
resource format), reference the MySQL datasource by name, and link only to dashboards,
panels and variables that exist. Link targets are looked up across the whole root.
"""

import json
import pathlib
import re
import sys

DASHBOARD_LINK = re.compile(r"/d/([A-Za-z0-9_-]+)([^\s\"']*)")
VIEW_PANEL = re.compile(r"[?&]viewPanel=(?:panel-)?(\d+)")
VAR_PARAM = re.compile(r"[?&]var-([A-Za-z0-9_]+)=")
QUERYPARAM_VAR = re.compile(r"\$\{([A-Za-z0-9_]+):queryparam\}")


def panels(items):
    """Yields every panel, including those nested in collapsed rows."""
    for panel in items:
        yield panel
        yield from panels(panel.get("panels", []))


def links(dashboard):
    """Yields (where, url) for every dashboard, panel and field link."""
    for link in dashboard.get("links", []):
        yield "dashboard link", link.get("url", "")
    for panel in panels(dashboard.get("panels", [])):
        where = f"panel {panel.get('id')} {panel.get('title', '')!r}"
        for link in panel.get("links", []):
            yield where, link.get("url", "")
        config = panel.get("fieldConfig", {})
        for link in config.get("defaults", {}).get("links", []):
            yield where, link.get("url", "")
        for override in config.get("overrides", []):
            for prop in override.get("properties", []):
                if prop.get("id") == "links":
                    for link in prop.get("value") or []:
                        yield where, link.get("url", "")


def datasources(node):
    """Yields every datasource reference in the dashboard."""
    if isinstance(node, dict):
        if "datasource" in node:
            yield node["datasource"]
        for value in node.values():
            yield from datasources(value)
    elif isinstance(node, list):
        for value in node:
            yield from datasources(value)


def main(root, checked):
    errors = []
    by_uid = {}
    for path in sorted(pathlib.Path(root).rglob("*.json")):
        try:
            dashboard = json.loads(path.read_text(encoding="utf-8"))
        except ValueError as err:
            if path.is_relative_to(checked):
                errors.append(f"{path}: invalid JSON: {err}")
            continue
        if isinstance(dashboard, dict) and dashboard.get("uid"):
            by_uid[dashboard["uid"]] = dashboard

    for path in sorted(pathlib.Path(checked).rglob("*.json")):
        try:
            dashboard = json.loads(path.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if "apiVersion" in dashboard or "spec" in dashboard:
            errors.append(f"{path}: v2 resource format; export it as classic dashboard JSON")
            continue
        if not isinstance(dashboard.get("panels"), list) or not dashboard.get("uid"):
            errors.append(f"{path}: not a classic dashboard (needs uid and panels)")
            continue
        for ref in datasources(dashboard):
            if isinstance(ref, dict) and ref.get("type") == "mysql":
                errors.append(f"{path}: references the MySQL datasource by uid; use \"datasource\": \"mysql\"")
                break
        for where, url in links(dashboard):
            for match in DASHBOARD_LINK.finditer(url):
                uid, rest = match.group(1), match.group(2)
                target = by_uid.get(uid)
                if target is None:
                    errors.append(f"{path}: {where} links to unknown dashboard {uid!r}")
                    continue
                panel_ids = {panel.get("id") for panel in panels(target.get("panels", []))}
                for panel_id in VIEW_PANEL.findall(rest):
                    if int(panel_id) not in panel_ids:
                        errors.append(f"{path}: {where} opens missing panel {panel_id} of {uid!r}")
                names = {var.get("name") for var in target.get("templating", {}).get("list", [])}
                for name in VAR_PARAM.findall(rest) + QUERYPARAM_VAR.findall(rest):
                    if name not in names:
                        errors.append(f"{path}: {where} sets variable {name!r} that {uid!r} does not define")

    for error in errors:
        print(error)
    print(f"checked {checked}: {len(errors)} problem(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
