# Docker

Export server can be run as a Docker container. See `Dockerfile` and `docker-compose.yml` in the server directory.

## Starting container
To start Docker container run:

```
pdf-export-server$ docker-compose up -d --build
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
