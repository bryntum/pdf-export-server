# Configuration

You can specify application options in the app.config.js or by passing them from the CLI.

```shell
pdf-export-server$ node ./src/server.js --help

Usage: ./server [OPTION]

  -h, --http=PORT           Start http server on port
  -H, --https=PORT          Start https server on port
  -c, --cors=HOST           CORS origin, default value "*". Set to "false" to disable CORS
  -m, --maximum=SIZE        Maximum upload size (default 50mb)
  -r, --resources=PATH      The absolute path to the resource directory. This path will be accessible via the webserver
      --max-workers=WORKERS Maximum amount of workers (puppeteer instances) (default: 5)
      --level=LEVEL         Specify log level (error, warn, verbose). Default "error"
      --timeout=TIMEOUT     Request timeout time in seconds
      --quick               Provide to only wait for page load event
      --no-sandbox          Provide to pass no-sandbox argument to chromium
      --no-config           Provide to ignore app.config.js
      --verbose             Alias for --level=verbose
      --help                Show help message
```

The following command starts a server with HTTP and HTTPS on ports 8080 and 8081 respectively:

```shell
pdf-export-server$ node ./src/server.js -h 8080 -H 8081 -m 100mb
```

The flag -m above extends the upload capacity to 100 MB.

##### Workers

To speed up the export we parallelize it using puppeteer instances (workers). It is slower than using tabs, but much
easier to restart the export if browser or tab fails. By default, there are 5 workers which feel fine on machines with
as much as 1 GB RAM. In general, it takes about 2-3 seconds to generate one PDF page, depending on network speed and
overall system performance. Workers amount is not limited.

##### Resources
<a name="CORS"></a>
When sending HTML fragments to the server, the server launches puppeteer and tries to generate PDF-files based on the
provided input. In case the CSS stylesheets are not accessible to the server (for example the resources are protected
by a login session), you can make use of the built-in web-server to serve resources.

In this case configure the export feature with `translateURLsToAbsolute`.

```javascript
new Grid({
   features : {
       pdfExport : {
           exportServer : 'http://export-host:8081',
           translateURLsToAbsolute : 'http://export-host:8081/resources'
       } 
   }
})
```

This tells the export plugin to change all the used stylesheet URLs to be fetched from
`http://export-host:8081/resources`. Then copy all the resources your application uses to the export server keeping the
folder hierarchy. After this map the virtual `http://export-host:8081/resources` to the real folder on your export
server:

```shell
pdf-export-server$ node ./src/server.js -r /web/application/styles
```

The path can be either absolute (`/web/application/styles`) or relative (`web/application/styles`),
for example when you start the export server with the export demo locally.

So if you're running the export demo from the localhost, for example `http://lh/bryntum-suite/grid/examples/export/`,
you need to copy the folders starting from the `bryntum-suite` to the `examples/_shared/server/web/application/styles`,
keeping only resources the demo uses (css files, fonts etc.).

##### Security

Be careful which folder to set open with the -r option; php, aspx/cs, config files won't be interpreted but served as
download when hit. Only point folders which contain resources needed for generating the page, like fonts, CSS or image
files.

##### OFFOLIO additions

These options and endpoints are specific to the OFFOLIO fork. Numeric `PDF_EXPORT_*` variables accept only plain
positive integers (`/^\d+$/` and greater than zero); any other value is ignored and the configured value is kept.
Environment variables are applied after `app.config.js` and the CLI flags, so they override both.

| Option | Env variable | Default | Effect |
| --- | --- | --- | --- |
| `timeout` (`--timeout`, seconds) | `PDF_EXPORT_TIMEOUT` (seconds) | 120 | Also applied to `page.setContent` and `page.pdf` |
| `max-workers` (`--max-workers`) | `PDF_EXPORT_MAX_WORKERS` | 4 | Chromium workers; 2 per vCPU is the rule of thumb |
| `max-pages` (`--max-pages`) | `PDF_EXPORT_MAX_PAGES` | 500 | A request with more HTML pages is refused with `413 {"code":"TOO_MANY_PAGES"}` |
| `max-queue` (`--max-queue`) | `PDF_EXPORT_MAX_QUEUE` | 20 | Once this many export requests are pending, new ones get `503 {"code":"QUEUE_FULL"}` with `Retry-After: 10` |
| `maximum` (`-m`) | `PDF_EXPORT_MAXIMUM` | `100mb` | Request body limit; keep it aligned with nginx `client_max_body_size` |
| `cors` (`-c`) | `PDF_EXPORT_CORS` | `*` | Value of `Access-Control-Allow-Origin`; set it to the application origin in production |
| `log-format` (`--log-format`) | `PDF_EXPORT_LOG_FORMAT` | none | `json` writes one JSON object per line to the console |
| n/a | `PDF_EXPORT_TEST_PORT` | 9999 | Port of the static resource server used by the Jest suite only |

`quick` defaults to `true`: the page is considered loaded on the `load` event, then the server waits for
`document.fonts.ready`. Lato and Font Awesome are installed in the Docker image so that the fonts are present.

Endpoints:

| Method and path | Purpose |
| --- | --- |
| `GET /status` | Liveness. Always `200` with the server version |
| `GET /ready` | Readiness. `503 {"ready":false}` until the Chromium warm-up launch at start-up succeeds, then `200 {"ready":true}` |
| `GET /metrics` | Prometheus text format, see below |

Prometheus series exposed by `GET /metrics`:

| Series | Type | Meaning |
| --- | --- | --- |
| `pdf_export_requests_total{result}` | counter | `result` is `success`, `failed`, `cancelled` or `refused` (both the 413 and the 503 refusals) |
| `pdf_export_duration_seconds` | histogram | Request to response time for exports that were not refused |
| `pdf_export_queue_depth` | gauge | Pending export requests. This is the figure the `max-queue` check uses, so alert on it to catch the 503 condition |
| `pdf_export_page_jobs` | gauge | Page jobs waiting in the render queue |
| `pdf_export_workers` | gauge | Chromium workers alive |

Shutdown on `SIGTERM`: `/ready` turns `503` at once and the server stops accepting connections on every HTTP, HTTPS and
WebSocket listener. In-flight HTTP exports get up to 30 seconds to finish. The process then exits with `0` if everything
drained, or with `1` if the grace period ran out (remaining connections are closed).

Retries: a failed job is retried once, and only when Chromium itself crashed (errors such as `Target closed` or
`Protocol error`). Any other failure fails the request immediately. In test mode the limit is 3.

Request logs: one line per export with `requestId`, `tenant` (from the `x-tenant` header), `userHash` (from the
`x-user-hash` header), `pages`, `bytes` (set only for binary responses, `null` otherwise), `durationMs` and `result`.
Export HTML and PDF content is never logged.
