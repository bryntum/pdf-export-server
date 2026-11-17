## Compatibility

| pdf-export-server | ExtScheduler/ExtGantt | Bryntum Grid/Scheduler/Gantt |
|-------------------|-----------------------|------------------------------|
| 1.0.0             | *                     | *                            |
| 1.0.1             | *                     | *                            |
| 2.0.0             | *                     | *                            |
| 2.1.0             | *                     | *                            |
| 3.0.0             | *                     | *                            |

## Reverse compatibility

| Bryntum Grid/Scheduler/Gantt | pdf-export-server |
|-----------------------------|------------------|
| < 6.1.6                     | *                |
| 6.1.6 =>                    | 2.0.0            |
| 6.3.0 =>                    | 2.1.0            |

## Releases

### 3.0.0

- Minimum supported Node.js version is 24.
- `clientURL` is not supported anymore. Server used to navigate the headless browser to this URL before loading the
exported HTML, which allowed a client to make the server open any URL. The field is now ignored, server only navigates
the browser to a local address it generates itself. If you relied on `clientURL` to load styles and fonts, either send
`Access-Control-Allow-Origin: *` header for the resources from your web server, or host the resources on the export
server. See [architecture](architecture.md) guide for details.
- New `page-port` config sets the port of the local address which is used to pass exported pages to the headless
browser. See [configuration](configuration.md) guide for details.
- `muhammara` package is replaced with its successor `@muhammara/native`.

### 2.1.0

This release starts supporting custom paper format sent from the client. This is the minimum version of the PDF export
server required by the Bryntum 6.3.x packages