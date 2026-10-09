# Docker

Export server can be run as a Docker container. See `Dockerfile` and `docker-compose.yml` in the server directory.

## Starting container
To start Docker container run this in the export server root directory:

```shell
docker-compose up -d --build
```

Docker container will expose ports 8080 and 8081 for HTTP and HTTPS connections respectively.

## Accessing log

Server keeps an info log (see above for configuring server log level) in its local directory. It can be accessed
as follows:

```
pdf-export-server$ docker exec bryntum_pdfexport_server sh -c "cat log/export-server*"
2020-06-22 info: Access-Control-Allow-Origin: *
2020-06-22 info: Http server started on port 8080
2020-06-22 info: Https server started on port 8081
2020-06-22 info: POST request ...
2020-06-22 info: [Queue@...] Added 1 to the queue, current length is 1
2020-06-22 info: [Queue@...] Queue is running
2020-06-22 info: [Queue@...] Queue is stopped
2020-06-22 info: POST request ... succeeded
2020-06-22 info: [Queue@...] All workers destroyed, queue is empty
```

## Configuring demo

Using the Docker image has certain constraints. By default, server doesn't have any resources (fonts, styles, etc) and it
is a separate machine with own network, so:

1. URL of the exported page has to be accessible from the Docker container.
2. Docker container has to be allowed to load resources. Either by setting CORS headers or by providing additional
 config

See [architecture guide](architecture.md) for more info.

```javascript
new Grid({
    features : {
        pdfExport : {
            // Assuming Docker is running locally
            exportServer            : 'http://localhost:8080/',
            // Docker has to access external/global address of the exported page
            translateURLsToAbsolute : 'http://external-address:80/',
            // This is required only if you do not choose to enable CORS on web server.
            // In case your web server provides `Access-Control-Allow-Origin: *` header, this can be omitted.
            clientURL               : 'http://external-address:80/'
        }
    }
})
```

## OFFOLIO image

The image installs Lato and Font Awesome, and Chromium starts with `--disable-dev-shm-usage` and
`--font-render-hinting=none`, so text metrics match on every host. Request bodies are limited to 100 MB by default.

Configure the server with environment variables. The full list, defaults and parsing rules are in
[configuration](configuration.md#offolio-additions):

```yaml
services:
    bryntum_pdfexport_server:
        image: bryntum_pdfexport_server
        ports:
            - "8080:8080"
        environment:
            PDF_EXPORT_MAX_WORKERS: "4"
            PDF_EXPORT_TIMEOUT: "120"
            PDF_EXPORT_MAX_PAGES: "500"
            PDF_EXPORT_MAX_QUEUE: "20"
            PDF_EXPORT_MAXIMUM: "100mb"
            PDF_EXPORT_CORS: "https://app.example.com"
            PDF_EXPORT_LOG_FORMAT: "json"
        stop_grace_period: 35s
```

### Health and metrics

- `GET /status` is a liveness probe. It answers `200` as soon as the process is listening.
- `GET /ready` is a readiness probe. It answers `503` until the server has launched Chromium once at start-up, then `200`.
  Send traffic only after `/ready` returns `200`.
- `GET /metrics` serves Prometheus metrics. Alert on `pdf_export_queue_depth` to catch `503 QUEUE_FULL` responses before
  clients see them.

### Stopping the container

On `SIGTERM` the server marks itself not ready, stops accepting connections and waits up to 30 seconds for in-flight
exports. It exits with `0` when all exports finished and with `1` when the grace period ran out.

On Kubernetes a `preStop` `sleep 5` plus the 30 second drain fits under `terminationGracePeriodSeconds: 45`, as the gitops manifests set it.

The Dockerfile uses the exec form of `ENTRYPOINT`, so Node is PID 1 and receives the signal directly. Docker's default stop
timeout is 10 seconds, which is shorter than the drain period. Keep `stop_grace_period` (or `docker stop --time`) at 35
seconds or more, otherwise Docker sends `SIGKILL` during the drain.
