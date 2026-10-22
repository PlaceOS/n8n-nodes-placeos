# @placeos/n8n-nodes-placeos

n8n nodes for [PlaceOS](https://place.technology), the smart building and workplace platform.

- **PlaceOS** reads and controls a PlaceOS deployment: systems (rooms and spaces), the modules in them, zones,
  metadata and users, and through the Staff API, bookings, visitors, free desks and spaces. It also works as a
  tool for n8n's AI Agent.
- **PlaceOS Trigger** starts a workflow when a module status value changes, such as a room sensor's people count
  or a display's power state. It keeps a live connection to PlaceOS, so there is no polling and nothing to set up
  in PlaceOS beyond an API key.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation
platform.

[Installation](#installation) ·
[Credentials](#credentials) ·
[PlaceOS node](#placeos-node) ·
[PlaceOS Trigger](#placeos-trigger) ·
[AI Agent](#use-with-the-ai-agent) ·
[MCP](#use-the-placeos-mcp-servers) ·
[Deployment notes](#deployment-notes) ·
[Examples](#examples) ·
[Compatibility](#compatibility) ·
[Development](#development)

## Installation

On self-hosted n8n, open **Settings > Community Nodes**, choose **Install**, enter `@placeos/n8n-nodes-placeos` and
confirm. See n8n's [community nodes guide](https://docs.n8n.io/integrations/community-nodes/installation/gui-install/).

Once the package is verified by n8n, it also appears in the nodes panel on n8n Cloud and self-hosted instances:
search for "PlaceOS".

If n8n runs in queue mode, or on Kubernetes or Docker Compose with several processes, install the package on every
main and worker instance. The simplest way, from n8n 2.21, is to set these on every instance:

```sh
N8N_COMMUNITY_PACKAGES_MANAGED_BY_ENV=true
N8N_COMMUNITY_PACKAGES='[{"name":"@placeos/n8n-nodes-placeos","version":"0.1.0"}]'
```

Until the package is verified, also set `N8N_UNVERIFIED_PACKAGES_ENABLED=true`.

## Credentials

The nodes use a PlaceOS API key.

1. In PlaceOS Backoffice, open **Admin > API Keys** and choose the domain.
2. Click **Add API Key**. Give it a name such as `n8n`, choose a dedicated user for it to act as, set the scope to
   `public` and the permission to **Support**. Save.
3. Copy the key. PlaceOS shows it only once.
4. In n8n, create a **PlaceOS API** credential with:
   - **Base URL**: the PlaceOS domain the key belongs to, such as `https://placeos.example.com`. Use the domain
     itself, not an IP address or another name for the server: PlaceOS checks that the key is used on its own
     domain.
   - **API Key**: the key from step 3.

The credential test calls PlaceOS to inspect the key, so a wrong key or domain shows up straight away.

Everything the nodes do runs as the key's user, with the key's permission level:

| Key permission | What works |
|---|---|
| Support (recommended) | Everything in this package. |
| User | Listing systems, reading metadata and users, bookings and visitors, and the trigger. Reading module functions and state, running functions over the REST API and listing zones without a filter return "not allowed". |

Staff API features (bookings, guests, desks, spaces) also need the `public` scope and a Staff API tenant for the
domain.

## PlaceOS node

| Resource | Operations |
|---|---|
| System | Get, Get Many, Get Module Types, Get Functions, Execute Function, Get State, Start, Stop |
| Module | Get, Get State, Execute Function, Start, Stop |
| Zone | Get, Get Many, Get Tags |
| Metadata | Get, Create or Update, Delete |
| User | Get, Get Current, Get Many |
| Signal | Send |
| Booking | Get, Get Many, Create, Update, Delete, Approve, Reject, Check In, Check Out |
| Guest | Get, Get Many, Create, Get Bookings |
| Desk | Get Free Desks |
| Space | Get Many |

Notes:

- **Systems** can be chosen from a list, by ID (`sys-...`) or by the room's resource email.
- **Modules** are named by class and index, such as `Display_1` or `Sensor_2`, as in PlaceOS Backoffice. The list
  is loaded from the system.
- **Execute Function** loads the module's functions and their arguments. In **Named** mode you give arguments by
  name and the node puts them in order; values are read as JSON, so `true`, `3` and `"hdmi"` keep their types, and
  text that is not JSON is sent as a string. In **Positional JSON** mode you give a JSON array.
- **Get State** returns every status value of a module, or one value when you give a status key.
- **Metadata: Create or Update** replaces the details by default. Turn on **Merge** to apply them as a JSON merge
  patch instead: nested objects are merged and a `null` value removes a key. **Delete** needs a name, because
  PlaceOS would otherwise delete every entry on the parent.
- **Signal: Send** publishes a message on a PlaceOS channel. Drivers that subscribe to `placeos/<channel>` receive
  it, which is a simple way to push data from n8n into a driver.
- **Times** for bookings and guests accept ISO 8601 date-times. A time without an offset is read in the workflow's
  time zone.
- **Get Many** operations have **Return All** and **Limit**. Systems and bookings also have **Simplify**, which
  keeps the ten most useful fields.
- **Booking: Get Many** returns the API key user's own bookings unless you filter by zone or user email. The
  extension data filter compares values as text.

## PlaceOS Trigger

Choose a system and add one or more status values, each a module and a status key, such as `Sensor_1` and
`people`. The workflow runs once for every change, with an item like this:

```json
{
	"system_id": "sys-AbC123xYz",
	"module": "Sensor",
	"index": 1,
	"module_slug": "Sensor_1",
	"status": "people",
	"value": 7,
	"previous_value": 4,
	"initial": false,
	"received_at": "2026-10-22T02:02:22.917Z"
}
```

Options:

- **Emit Current Value on Start**: also run the workflow with each status's current value when the trigger starts.
- **Only on Change** (on by default): skip updates that repeat the last value.
- **Ping Interval**: how often the connection is checked. It reconnects when two pings in a row go unanswered.
- **Reconnect Attempts**: how many times to reconnect after a drop before handing over to n8n, which marks the
  workflow as failed and keeps retrying to activate it.

When building the workflow, **Execute step** returns the first value PlaceOS sends, usually the current one, so
you can see the item without waiting for a change.

After a reconnect, the trigger compares each status with the last value it saw and runs the workflow only for the
ones that changed while it was disconnected.

## Use with the AI Agent

The PlaceOS node is available to n8n's AI Agent as **PlaceOS Tool**. Choose an operation and let the model fill the
fields it needs with `$fromAI()`, for example a level for **Desk: Get Free Desks**:

```text
{{ $fromAI('level_zone_id', 'The zone ID of the level, starting with zone-', 'string') }}
```

No environment variable is needed; community nodes have been usable as tools since n8n 1.85.

## Use the PlaceOS MCP servers

PlaceOS 2.2610.1 and later also serve the REST API and the Staff API to AI assistants over MCP. n8n's built-in
**MCP Client Tool** can use them directly, without this package:

| Field | Value |
|---|---|
| Endpoint | `https://<your-placeos-domain>/api/engine/v2/mcp` (systems, zones, modules and more) or `https://<your-placeos-domain>/api/staff/v1/mcp` (desks, rooms, meetings, visitors) |
| Server Transport | HTTP Streamable |
| Authentication | Header Auth, with a credential whose name is `X-API-Key` and whose value is your PlaceOS API key |

n8n's MCP nodes only accept n8n's own credential types, so the API key goes into a separate Header Auth credential.
MCP OAuth2 with dynamic client registration also works for assistants that should act as the person who connects
them; it needs n8n to be reachable over HTTPS.

PlaceOS groups its MCP tools in toolboxes. Tell the agent in its system message to call `list_toolboxes`, open the
one it needs with `open_toolbox`, and run its tools with `call_read_only` or `call_tool`. The
[AI Agent example](examples/ai-agent.json) has a system message that does this.

## Deployment notes

- The trigger keeps one connection per active workflow. It runs on the main n8n instance (the leader, in a
  multi-main setup); workers only run the executions.
- The trigger connects with Node.js's built-in WebSocket, which ignores `HTTP_PROXY` and similar variables unless
  n8n runs with `NODE_USE_ENV_PROXY=1`. For a PlaceOS server with a private certificate authority, give n8n the CA
  with `NODE_EXTRA_CA_CERTS`. The credential's **Ignore SSL Issues** option applies to API requests only.

## Examples

Import these from the `examples` folder (**Workflow menu > Import from File**) and replace the IDs:

- [occupancy-alert.json](examples/occupancy-alert.json): email building operations when a room sensor reports more
  people than the room holds.
- [daily-desk-bookings.json](examples/daily-desk-bookings.json): every weekday morning, email a list of the day's
  desk bookings in a building.
- [ai-agent.json](examples/ai-agent.json): a chat assistant that finds free desks with PlaceOS Tool and uses the
  Staff API MCP server for everything else.

## Compatibility

- Tested with n8n 2.44.5 on Node.js 24. The trigger needs Node.js 22.4 or later for the built-in WebSocket.
- PlaceOS: the Desk and Space resources and the MCP servers need PlaceOS 2.2610.1 or later. Everything else works
  with earlier releases.

## Development

```sh
npm install
npm run build
npm test
npm run lint
npm run dev
```

`npm run dev` starts n8n at http://localhost:5678 with the package loaded and rebuilds it on change. Releases are
published from GitHub Actions with npm provenance: run `npm run release` on `main`, which bumps the version, tags
and pushes, and the `Publish` workflow publishes the tag.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [PlaceOS documentation](https://docs.placeos.com)
- [PlaceOS API keys](https://docs.placeos.com/placeos/how-to/authentication/x-api-keys/)
- [PlaceOS real-time websocket](https://docs.placeos.com/placeos/reference/api/websocket/)

## Licence

[MIT](LICENSE)
