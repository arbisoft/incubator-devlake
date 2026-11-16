#!/usr/bin/env python3
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

"""A mock of Sophia for local end-to-end runs of the Integration Service. Standard library only.

It plays both of Sophia's parts:

* Sophia as a client: it gets a bearer token from the Integration Service (OAuth2 client credentials,
  POST /auth/token/), sends single-email and batch stats requests, and polls each one.
* Sophia as the callback receiver: it runs an OAuth2 client-credentials token endpoint of its own and a
  callback endpoint that accepts only the tokens it issued, exactly as the Integration Service expects
  Sophia to do. Every callback is recorded and matched to the request that caused it.

Commands:

  serve   run only the Sophia side the Integration Service calls (token endpoint + callback).
  run     run the server, send the requests, wait for every result, print a report, then exit.

See "Mock Sophia" in integration-service/README.md for the portal settings this needs.
"""

import argparse
import base64
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FINAL_POLL_STATUSES = {"Success", "Failure", "Revoked"}
MAX_BATCH_EMAILS = 20

# The shape the Integration Service accepts (EmailNormalizer): a dot-atom local part with no leading, trailing or repeated dot, and a host name.
EMAIL_SHAPE = re.compile(r"^[a-z0-9](?:[a-z0-9_%+'\-]|\.(?=[a-z0-9_%+'\-]))*@[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)+$")


DEFAULT_ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mock_sophia.env")


def env(name, default=None):
    value = os.environ.get(name)
    return value if value else default


def load_env_file(path):
    """
    Reads NAME=value lines from the mock's own settings file (dev/mock_sophia.env, kept apart from the Integration Service's .env), so
    nothing has to be exported first. A variable that is already set in
    the environment is left as it is, so an exported value (and any command-line option) still wins. Blank lines and # comments are skipped,
    an `export ` prefix is allowed, and surrounding quotes are removed. A missing default file is fine; a missing --env-file is not.
    """
    try:
        with open(path, encoding="utf-8") as handle:
            lines = handle.readlines()
    except FileNotFoundError:
        return False
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        name, separator, value = line.partition("=")
        name = name.strip()
        if not separator or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(name, value)
    return True


def env_file_from_argv(argv):
    """--env-file has to be known before the other options, because their defaults come from the environment."""
    for i, arg in enumerate(argv):
        if arg == "--env-file" and i + 1 < len(argv):
            return argv[i + 1], True
        if arg.startswith("--env-file="):
            return arg.split("=", 1)[1], True
    return env("MOCK_SOPHIA_ENV_FILE", DEFAULT_ENV_FILE), "MOCK_SOPHIA_ENV_FILE" in os.environ


# --------------------------------------------------------------------------------------------------
# Sophia as the callback receiver
# --------------------------------------------------------------------------------------------------


@dataclass
class Callback:
    received_at: float
    method: str
    correlation_id: str
    status_returned: int
    body: object


@dataclass
class ReceiverState:
    client_id: str
    client_secret: str
    token_lifetime: int
    callback_script: list
    retry_after: int | None
    tokens: dict = field(default_factory=dict)
    token_requests: int = 0
    rejected_callbacks: int = 0
    callbacks: list = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def issue_token(self):
        token = "mock-sophia-" + secrets.token_urlsafe(24)
        with self.lock:
            self.tokens[token] = time.time() + self.token_lifetime
            self.token_requests += 1
        return token

    def token_is_valid(self, token):
        with self.lock:
            expires = self.tokens.get(token)
        return expires is not None and expires > time.time()

    def next_callback_status(self):
        with self.lock:
            return self.callback_script.pop(0) if self.callback_script else 200

    def record(self, callback):
        with self.lock:
            self.callbacks.append(callback)

    def callbacks_for(self, correlation_id):
        with self.lock:
            return [c for c in self.callbacks if c.correlation_id == correlation_id]


def make_handler(state, prefix, verbose):
    token_path = prefix + "/oauth2/token/"
    callback_path = prefix + "/api/v1/devlake/callback/"
    list_path = prefix + "/callbacks"

    class Handler(BaseHTTPRequestHandler):
        server_version = "MockSophia/1.0"

        def log_message(self, fmt, *args):
            if verbose:
                sys.stderr.write("[mock-sophia] " + (fmt % args) + "\n")

        def _send_json(self, status, body, headers=None):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(data)

        def _read_body(self):
            length = int(self.headers.get("Content-Length") or 0)
            return self.rfile.read(length) if length else b""

        def do_GET(self):
            if self.path.rstrip("/") == list_path:
                with state.lock:
                    items = [
                        {"received_at": c.received_at, "method": c.method, "correlation_id": c.correlation_id,
                         "status_returned": c.status_returned, "body": c.body}
                        for c in reversed(state.callbacks)
                    ]
                self._send_json(200, items)
            elif self.path.rstrip("/") == prefix + "/health":
                self._send_json(200, {"ok": True})
            else:
                self._send_json(404, {"error": "not_found"})

        def do_POST(self):
            if self.path == token_path:
                self._token()
            elif self.path == callback_path:
                self._callback()
            else:
                self._send_json(404, {"error": "not_found"})

        do_PUT = do_POST
        do_PATCH = do_POST

        def _token(self):
            """OAuth2 client credentials (RFC 6749 4.4): HTTP Basic client authentication and grant_type=client_credentials."""
            form = urllib.parse.parse_qs(self._read_body().decode())
            if form.get("grant_type") != ["client_credentials"]:
                self._send_json(400, {"error": "unsupported_grant_type"})
                return

            client_id, client_secret = parse_basic(self.headers.get("Authorization"))
            if client_id != state.client_id or client_secret != state.client_secret:
                print("[mock-sophia] token request REFUSED: wrong client ID or secret", flush=True)
                self._send_json(401, {"error": "invalid_client"}, {"WWW-Authenticate": 'Basic realm="mock-sophia"'})
                return

            token = state.issue_token()
            print(f"[mock-sophia] issued an access token to {client_id} (valid {state.token_lifetime}s)", flush=True)
            self._send_json(200, {"access_token": token, "token_type": "Bearer", "expires_in": state.token_lifetime})

        def _callback(self):
            raw = self._read_body()
            correlation_id = self.headers.get("X-Correlation-Id", "")
            authorization = self.headers.get("Authorization", "")
            token = authorization[7:] if authorization.startswith("Bearer ") else ""
            if not state.token_is_valid(token):
                with state.lock:
                    state.rejected_callbacks += 1
                print(f"[mock-sophia] callback {correlation_id} REFUSED: missing, unknown or expired bearer token", flush=True)
                self._send_json(401, {"error": "invalid_token"}, {"WWW-Authenticate": 'Bearer error="invalid_token"'})
                return

            try:
                body = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                body = raw.decode(errors="replace")

            status = state.next_callback_status()
            state.record(Callback(time.time(), self.command, correlation_id or body_correlation(body), status, body))
            print(f"[mock-sophia] callback {correlation_id} received ({summary(body)}), answering {status}", flush=True)
            if verbose:
                print(json.dumps(body, indent=2), flush=True)

            headers = {"Retry-After": str(state.retry_after)} if status in (429, 503) and state.retry_after else None
            self._send_json(status, {"received": status < 300}, headers)

    return Handler


def parse_basic(header):
    if not header or not header.startswith("Basic "):
        return None, None
    try:
        decoded = base64.b64decode(header[6:]).decode()
    except (ValueError, UnicodeDecodeError):
        return None, None
    client_id, _, client_secret = decoded.partition(":")
    return urllib.parse.unquote(client_id), urllib.parse.unquote(client_secret)


def body_correlation(body):
    return body.get("correlation_id", "") if isinstance(body, dict) else ""


def summary(body):
    if not isinstance(body, dict):
        return "not JSON"
    engineers = body.get("engineers") or []
    errors = sum(len(e.get("errors") or []) for e in engineers if isinstance(e, dict))
    window = body.get("time_frame") or "range"
    return f"{len(engineers)} engineer(s), {window} {body.get('from', '?')} to {body.get('to', '?')}, {errors} error(s)"


def start_receiver(args):
    state = ReceiverState(
        client_id=args.outbound_client_id,
        client_secret=args.outbound_client_secret,
        token_lifetime=args.token_lifetime,
        callback_script=[int(s) for s in args.callback_statuses.split(",") if s.strip()] if args.callback_statuses else [],
        retry_after=args.retry_after,
    )
    if not state.client_id or not state.client_secret:
        sys.exit("The mock's own OAuth client ID and secret are needed: --outbound-client-id/--outbound-client-secret "
                 "or SOPHIA_OUTBOUND_CLIENT_ID/SOPHIA_OUTBOUND_CLIENT_SECRET.")

    server = ThreadingHTTPServer((args.host, args.port), make_handler(state, args.prefix.rstrip("/"), args.verbose))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://{args.host}:{args.port}{args.prefix.rstrip('/')}"
    print(f"[mock-sophia] listening on {base}", flush=True)
    print(f"[mock-sophia]   token endpoint  POST {base}/oauth2/token/  (client {state.client_id})", flush=True)
    print(f"[mock-sophia]   callback        POST {base}/api/v1/devlake/callback/  (bearer token required)", flush=True)
    print(f"[mock-sophia]   received        GET  {base}/callbacks", flush=True)
    return server, state


# --------------------------------------------------------------------------------------------------
# Sophia as the client of the Integration Service
# --------------------------------------------------------------------------------------------------


class IntegrationService:
    def __init__(self, base_url, client_id, client_secret, timeout=30):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.timeout = timeout
        self.token = None
        self.token_expires = 0

    def _call(self, method, path, body=None, headers=None, form=None):
        data = None
        all_headers = dict(headers or {})
        if form is not None:
            data = urllib.parse.urlencode(form).encode()
            all_headers["Content-Type"] = "application/x-www-form-urlencoded"
        elif body is not None:
            data = json.dumps(body).encode()
            all_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base_url + path, data=data, method=method, headers=all_headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.status, read_json(response.read())
        except urllib.error.HTTPError as error:
            return error.code, read_json(error.read())

    def authenticate(self):
        credentials = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        status, body = self._call("POST", "/auth/token/", headers={"Authorization": "Basic " + credentials},
                                  form={"grant_type": "client_credentials"})
        if status != 200 or not isinstance(body, dict) or "access_token" not in body:
            sys.exit(f"[sophia] the Integration Service refused our client credentials: HTTP {status} {body}")
        self.token = body["access_token"]
        self.token_expires = time.time() + int(body.get("expires_in", 0)) - 30
        print(f"[sophia] got an access token (scopes: {body.get('scope') or 'none'}, expires in {body.get('expires_in')}s)", flush=True)

    def _authorized(self, method, path, body=None):
        if not self.token or time.time() >= self.token_expires:
            self.authenticate()
        status, answer = self._call(method, path, body=body, headers={"Authorization": "Bearer " + self.token})
        if status == 401:
            self.authenticate()
            status, answer = self._call(method, path, body=body, headers={"Authorization": "Bearer " + self.token})
        return status, answer

    def single(self, email, period):
        query = urllib.parse.urlencode(period)
        return self._authorized("GET", f"/api/v1/engineers/{urllib.parse.quote(email, safe='')}/stats?{query}")

    def batch(self, emails, time_frame):
        return self._authorized("POST", "/api/v1/engineers/stats/batch", {"emails": emails, "timeFrame": time_frame})

    def poll(self, correlation_id):
        return self._authorized("GET", f"/api/v1/requests/poll/{correlation_id}")


def read_json(raw):
    try:
        return json.loads(raw) if raw else None
    except json.JSONDecodeError:
        return raw.decode(errors="replace")


@dataclass
class Sent:
    kind: str
    target: str
    http_status: int
    correlation_id: str | None
    answer: object
    poll_status: str = "-"


def emails_from_devlake(args):
    """
    The most active engineers in the local DevLake database: emails in the allowed domain that appear as commit authors, Jira or GitHub
    accounts, or AI usage, ranked by how much activity each has. Read-only, through the MySQL client inside DevLake's container.
    """
    if not re.fullmatch(r"[a-z0-9.-]+", args.email_domain):
        sys.exit("--email-domain must be a plain domain such as arbisoft.com.")
    password = args.devlake_password or devlake_password_from(args.devlake_env)
    pattern = "%@" + args.email_domain
    query = f"""
        SELECT email FROM (
          SELECT LOWER(TRIM(author_email)) email, COUNT(*) n FROM commits WHERE LOWER(author_email) LIKE '{pattern}' GROUP BY 1
          UNION ALL SELECT LOWER(TRIM(email)), COUNT(*) FROM accounts WHERE LOWER(email) LIKE '{pattern}' GROUP BY 1
          UNION ALL SELECT LOWER(TRIM(user_email)), COUNT(*) FROM ai_activities WHERE LOWER(user_email) LIKE '{pattern}' GROUP BY 1
        ) t GROUP BY email ORDER BY SUM(n) DESC, email"""
    command = ["docker", "exec", "-e", "MYSQL_PWD=" + password, args.devlake_container,
               "mysql", "-u" + args.devlake_user, args.devlake_db, "-N", "-B", "-e", query]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=60, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        sys.exit(f"Could not query DevLake's database: {error}")
    if result.returncode != 0:
        sys.exit(f"DevLake's database query failed: {result.stderr.strip()}")

    usable = [e for e in (line.strip() for line in result.stdout.splitlines()) if EMAIL_SHAPE.match(e)]
    picked = usable[:args.emails_from_devlake]
    if not picked:
        sys.exit(f"DevLake has no usable @{args.email_domain} emails.")
    print(f"[sophia] picked the {len(picked)} most active of {len(usable)} @{args.email_domain} emails in DevLake: {', '.join(picked)}", flush=True)
    return picked


def devlake_password_from(env_file):
    """The password in DB_URL of DevLake's .env, e.g. mysql://merico:<password>@mysql:3306/lake?..."""
    try:
        with open(env_file, encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("DB_URL="):
                    match = re.match(r"^DB_URL=\S*?//[^:]+:([^@]+)@", line.strip())
                    if match:
                        return urllib.parse.unquote(match.group(1))
    except OSError as error:
        sys.exit(f"Could not read {env_file} for DevLake's database password ({error}); give --devlake-password or DEVLAKE_DB_PASSWORD.")
    sys.exit(f"No DB_URL with a password in {env_file}; give --devlake-password or DEVLAKE_DB_PASSWORD.")


def send_requests(service, args, emails):
    period = {"from": args.date_from, "to": args.date_to} if args.date_from else {"tf": args.tf}
    chunks = [emails[i:i + MAX_BATCH_EMAILS] for i in range(0, len(emails), MAX_BATCH_EMAILS)]
    sent = []
    for i in range(args.singles):
        email = emails[i % len(emails)]
        status, answer = service.single(email, period)
        sent.append(Sent("single", email, status, correlation(answer), answer))
    for i in range(args.batches):
        chunk = chunks[i % len(chunks)]
        status, answer = service.batch(chunk, args.tf)
        sent.append(Sent("batch", f"{len(chunk)} emails ({chunk[0]}...)", status, correlation(answer), answer))

    for s in sent:
        note = f"correlation {s.correlation_id}" if s.correlation_id else f"answer {s.answer}"
        print(f"[sophia] {s.kind:6} {s.target:40} -> HTTP {s.http_status}, {note}", flush=True)

    seen = {}
    for s in sent:
        if s.correlation_id:
            seen.setdefault(s.correlation_id, 0)
            seen[s.correlation_id] += 1
    repeats = [cid for cid, n in seen.items() if n > 1]
    if repeats:
        print(f"[sophia] note: {len(repeats)} correlation ID(s) came back more than once: identical requests inside the duplicate "
              "window return the original acknowledgement", flush=True)
    return sent


def correlation(answer):
    return answer.get("correlation_id") or None if isinstance(answer, dict) else None


def wait_for_results(service, state, sent, timeout, interval):
    pending = {s.correlation_id for s in sent if s.correlation_id and s.http_status == 200}
    deadline = time.time() + timeout
    while pending and time.time() < deadline:
        for correlation_id in list(pending):
            status, answer = service.poll(correlation_id)
            poll_status = answer.get("status") if isinstance(answer, dict) else f"HTTP {status}"
            for s in sent:
                if s.correlation_id == correlation_id:
                    s.poll_status = poll_status
            done = poll_status in FINAL_POLL_STATUSES
            delivered = poll_status != "Success" or state.callbacks_for(correlation_id)
            if done and delivered:
                pending.discard(correlation_id)
        if pending:
            time.sleep(interval)
    return pending


def report(state, sent, pending):
    print("\n=== Mock Sophia report ===")
    print(f"{'kind':6}  {'request':40}  {'poll':10}  {'callbacks':9}  {'engineers':9}  errors")
    unique = {}
    for s in sent:
        unique.setdefault(s.correlation_id or id(s), s)
    failures = 0
    for s in unique.values():
        callbacks = state.callbacks_for(s.correlation_id) if s.correlation_id else []
        accepted = [c for c in callbacks if c.status_returned < 300]
        last = accepted[-1].body if accepted else None
        engineers = len(last.get("engineers") or []) if isinstance(last, dict) else 0
        errors = sum(len(e.get("errors") or []) for e in (last.get("engineers") or [])) if isinstance(last, dict) else 0
        ok = s.poll_status == "Success" and accepted
        failures += 0 if ok else 1
        print(f"{s.kind:6}  {s.target:40}  {s.poll_status:10}  {len(callbacks):9}  {engineers:9}  {errors}")
    print(f"\ntoken requests to mock Sophia: {state.token_requests}, callbacks refused for a bad token: {state.rejected_callbacks}")
    if pending:
        print(f"still unfinished when the wait ran out: {len(pending)}")
    print("result: " + ("all requests delivered" if failures == 0 else f"{failures} request(s) not delivered successfully"))
    return failures


# --------------------------------------------------------------------------------------------------


def parse_args():
    parser = argparse.ArgumentParser(description="Mock Sophia for local runs of the Integration Service.")
    sub = parser.add_subparsers(dest="command", required=True)

    def receiver_options(p):
        p.add_argument("--env-file", default=DEFAULT_ENV_FILE,
                       help="file of NAME=value settings read at start; set variables win (default: dev/mock_sophia.env)")
        p.add_argument("--host", default="127.0.0.1")
        p.add_argument("--port", type=int, default=int(env("MOCK_SOPHIA_PORT", "5097")))
        p.add_argument("--prefix", default="/sophia", help="path prefix of every mock Sophia endpoint (default /sophia)")
        p.add_argument("--outbound-client-id", default=env("SOPHIA_OUTBOUND_CLIENT_ID"),
                       help="client ID the Integration Service must use at mock Sophia's token endpoint")
        p.add_argument("--outbound-client-secret", default=env("SOPHIA_OUTBOUND_CLIENT_SECRET"))
        p.add_argument("--token-lifetime", type=int, default=300, help="seconds an issued token is valid")
        p.add_argument("--callback-statuses", default="",
                       help="HTTP statuses to answer the first callbacks with, in order, e.g. 503,429 (then 200)")
        p.add_argument("--retry-after", type=int, help="Retry-After seconds sent with a scripted 429 or 503")
        p.add_argument("--verbose", action="store_true", help="print every callback body and HTTP request")

    serve = sub.add_parser("serve", help="run only the token and callback endpoints")
    receiver_options(serve)

    run = sub.add_parser("run", help="send requests to the Integration Service and wait for every result")
    receiver_options(run)
    run.add_argument("--service-url", default=env("INTEGRATION_SERVICE_URL", "http://localhost:5099"))
    run.add_argument("--client-id", default=env("SOPHIA_CLIENT_ID"), help="Sophia's client ID at the Integration Service")
    run.add_argument("--client-secret", default=env("SOPHIA_CLIENT_SECRET"))
    who = run.add_mutually_exclusive_group(required=True)
    who.add_argument("--emails", help="comma-separated engineer emails")
    who.add_argument("--emails-from-devlake", type=int, metavar="N",
                     help="use the N most active engineers in the local DevLake database (read-only)")
    run.add_argument("--email-domain", default="arbisoft.com", help="domain of the emails taken from DevLake")
    run.add_argument("--devlake-container", default=env("DEVLAKE_DB_CONTAINER", "devlake-mysql-1"))
    run.add_argument("--devlake-db", default=env("DEVLAKE_DB_NAME", "lake"))
    run.add_argument("--devlake-user", default=env("DEVLAKE_DB_USER", "merico"))
    run.add_argument("--devlake-password", default=env("DEVLAKE_DB_PASSWORD"),
                     help="DevLake's database password (default: read from DB_URL in DevLake's .env)")
    run.add_argument("--devlake-env", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env"),
                     help="DevLake's .env, for its database password (default: the repository root's .env)")
    run.add_argument("--singles", type=int, default=1, help="single-email requests to send (cycling through the emails)")
    run.add_argument("--batches", type=int, default=1,
                     help=f"batch requests to send, each with the next group of up to {MAX_BATCH_EMAILS} emails")
    run.add_argument("--tf", default="24h", help="time frame, e.g. 24h, 1w, 30d, 1M")
    run.add_argument("--from", dest="date_from", help="range start (RFC 3339) for single requests instead of --tf")
    run.add_argument("--to", dest="date_to", help="range end (RFC 3339)")
    run.add_argument("--timeout", type=int, default=180, help="seconds to wait for every result")
    run.add_argument("--poll-interval", type=float, default=2.0)
    return parser.parse_args()


def main():
    env_file, required = env_file_from_argv(sys.argv[1:])
    if load_env_file(env_file):
        print(f"[mock-sophia] read settings from {os.path.normpath(env_file)}", flush=True)
    elif required:
        sys.exit(f"The settings file {env_file} does not exist.")
    else:
        print(f"[mock-sophia] no {os.path.normpath(env_file)}; copy dev/mock_sophia.env.example to it, or pass the settings as options", flush=True)
    args = parse_args()
    server, state = start_receiver(args)
    try:
        if args.command == "serve":
            print("[mock-sophia] waiting for the Integration Service; Ctrl+C to stop", flush=True)
            while True:
                time.sleep(3600)

        if not args.client_id or not args.client_secret:
            sys.exit("Sophia's client ID and secret at the Integration Service are needed: --client-id/--client-secret "
                     "or SOPHIA_CLIENT_ID/SOPHIA_CLIENT_SECRET.")
        if bool(args.date_from) != bool(args.date_to):
            sys.exit("Give both --from and --to, or neither.")

        emails = emails_from_devlake(args) if args.emails_from_devlake else [e.strip() for e in args.emails.split(",") if e.strip()]
        if not emails:
            sys.exit("Give at least one email with --emails.")

        service = IntegrationService(args.service_url, args.client_id, args.client_secret)
        service.authenticate()
        sent = send_requests(service, args, emails)
        pending = wait_for_results(service, state, sent, args.timeout, args.poll_interval)
        sys.exit(1 if report(state, sent, pending) else 0)
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
