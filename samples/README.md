# Sample status files

Two files with the same six servers in different states, for **☰ → Build from status file…** and live status:

| Server | Status | What you see with live status on |
| --- | --- | --- |
| `web-01` | up, 45 ms (limit 500) | green |
| `web-02` | up, 950 ms (limit 500) | amber, labelled "slow" |
| `api-01` | degraded | amber |
| `db-01` | up (custom ok colour) | teal `#20c997` |
| `cache-01` | down (custom fail colour) | dark red `#b02a37` |
| `backup-01` | maintenance (custom warn colour) | orange `#fd7e14` |

`web-01` and `web-02` are in the group **DMZ**, the rest in **Internal**; the connections are web → api → db and
cache, and db → backup.

- [`status-servers.csv`](status-servers.csv): CSV with a header row (the same layout works in a Google Sheet).
- [`status-servers.json`](status-servers.json): JSON, `{ "title": "…", "items": [ … ] }` (a bare list works too).

When the app is served (GitHub Pages, `npm run serve`, Docker), type `samples/status-servers.csv` as the address:
files on the app's own site need no host approval. Opened as a `file://` page, use **Choose file…** instead.

## Columns

Column (or JSON key) names ignore case, and `_`, `-` and spaces are the same (`ok_color` = `OK Color` = `ok-color`).

| Column | Required | Meaning | Default |
| --- | --- | --- | --- |
| `name` | yes | The shape's name; unique. Also the key looked up for its status. | |
| `status` | | The value checked. | |
| `type` | | `process`, `datastore`, `interactor`, `infrastructure`, or a ready-made node id such as `firewall`, `waf`, `load-balancer`, `api-gateway`, `cache`, `backup`, `siem`. | `infrastructure` |
| `icon` | | A Bootstrap icon name, such as `bi-server`. | from the type |
| `ok` | | Values that mean healthy, separated by `\|`. | `up\|ok\|online\|healthy\|200` |
| `ok_color` | | Colour when healthy (`#rgb` or `#rrggbb`). | `#198754` |
| `warn` | | Values that mean a warning, separated by `\|`. | `degraded\|slow\|warning\|maintenance` |
| `warn_color` | | Colour for a warning or a latency above `latency_max`. | `#ffc107` |
| `fail_color` | | Colour for any other status. | `#dc3545` |
| `latency` | | The latest latency in ms. | |
| `latency_max` | | Above this latency the warn colour is used. | |
| `group` | | Shapes with the same group share a trust zone. | |
| `connects_to` | | Names separated by `\|`: a data flow to each. | |
| `description` | | The shape's notes. | |

No row for a shape, an empty status or an error reading the file shows grey (`#adb5bd`).
