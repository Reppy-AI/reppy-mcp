Reppy MCP
=========

A local read-only stdio MCP server for the Reppy public API.
Requires Node.js 22+. This repository licenses only the new client code under
MIT. The API backend and app are separate software.

Install and run
---------------

Clone this repository and run::

    git clone https://github.com/kitsunies/reppy-mcp.git
    cd reppy-mcp
    npm ci --ignore-scripts
    npm test
    npm install --global . --ignore-scripts

The shared CLI dependency is pinned to reviewed public commit
``dcb804194d79a3eb781364e5798ed77cdaafebbc`` through its GitHub archive URL. The lockfile
records the archive integrity. No sibling checkout or npm registry
publication is required.

Obtain a Reppy key from your account administrator and save it outside both
checkouts in a private regular file owned by your user. On POSIX its mode must
be 600. The file must contain 64 hexadecimal characters with an optional final
newline. Key-file symlinks are rejected, and file reads are bounded. Never put
the key itself in argv, URLs, environment variable values, assistant settings,
shell history, or source control. Only the file path is configured.
On Windows, restrict the file ACL to your account; this client cannot verify
POSIX ownership or mode bits on Windows.

Claude Desktop or Cursor configuration
--------------------------------------

Configure the host to launch a local process. Use an absolute Node.js executable
path if your host does not inherit your shell's PATH. This example works as an
MCP server entry in Claude Desktop's configuration and Cursor's MCP settings::

    {
      "mcpServers": {
        "reppy": {
          "command": "node",
          "args": ["/absolute/path/to/reppy-mcp/src/index.js"],
          "env": {
            "REPPY_API_KEY_FILE": "/absolute/path/to/private/api-key"
          }
        }
      }
    }

After a global install, ``"command": "reppy-mcp", "args": []`` also works.
Restart the host after configuration changes. Do not run the process through
a shell or supply credentials as command arguments. The server exits with a
safe JSON configuration error on stderr if the file cannot be used. Runtime
results go only to the MCP caller; training data is not logged to stderr.

Tools
-----

* ``ping``: GET /v1/ping, no arguments.
* ``get_account``: GET /v1/me, no arguments.
* ``list_routines``: GET /v1/routines, optional integer limit and offset.
* ``get_routine``: GET /v1/routines/{id}, required string id.
* ``list_workouts``: GET /v1/workouts, optional integer limit and offset.
* ``get_workout``: GET /v1/workouts/{id}, required string id.

All tools advertise ``readOnlyHint`` and reject unknown arguments. Limits are
1..100 (default 25); offsets are 0..100000 (default 0). IDs are 1..128 letters,
digits, underscores, or hyphens. Pass list IDs unchanged; encoded paths and
traversal are rejected. Old list entries with null IDs have no detail lookup.
Lists return the exact API object ``{unit, items, offset, limit, total}`` in
both structured content and JSON text. Detail JSON is also passed unchanged.
Errors set ``isError`` with safe structured and text JSON. HTTP 429 includes
``retryAfter`` seconds when available and never triggers automatic retry.

Security and data access
------------------------

The shared dependency-free HTTP client sends the key only in the Authorization
header to https://api.reppyai.com. It rejects redirects, bounds responses to
4 MiB, and times out requests after 15 seconds. There is no arbitrary endpoint,
local training file access, hosted HTTP server, OAuth flow, or write tool.

Training requires explicit ``routines:read`` and/or ``workouts:read`` key
permissions bound to a live account. Existing ping-only and account-ID keys
do not gain training access. Every operation shares the account key's
60-request-per-minute API limit. Revocation, disablement, and account deletion
deny subsequent reads. Ask your account administrator to revoke or replace
a key. HTTP 403 means insufficient permissions; HTTP 404 includes unowned or
unavailable resources. The clients do not cache training data.

Connecting this server allows the assistant and its provider to receive your
returned training data. Routine and exercise labels are user-authored and may
contain personal information. The assistant provider's own retention policies
apply. Only connect a host you trust with this data. Notes, Coach conversations,
account profiles, bodyweight, goals, media, and credentials are excluded by the
public API. Tool annotations do not replace the server's permissions.

SDK version is pinned to 1.32.1; Zod is pinned to 3.25.76. Protocol tests use
the actual SDK stdio client with a test-only HTTP adapter and synthetic data.

Links
-----

Scalar API reference: https://api.reppyai.com/scalar

OpenAPI schema: https://api.reppyai.com/openapi.json

Public repository release targets:

* https://github.com/kitsunies/reppy-cli
* https://github.com/kitsunies/reppy-mcp
