# Standalone export server

This package contains the sources for an executable service which builds PDF and PNG files out of HTML fragments.

- Uses headless chromium browser.
- Easy OS (Linux, Windows, Mac) independent build/install into binary or runnable as NodeJS instance.
- Written in JavaScript and fully adaptable.
- Can be used as standalone service or as an intermediary between your (C#, Java, PHP) frontend and backend. Just catch
the HTML fragments, call the service and serve the binary.

## Compatibility

| pdf-export-server | ExtScheduler/ExtGantt | Bryntum Grid/Scheduler/Gantt |
|---|---|---|
| 1.0.0 | * | * |

## Usage

To start PDF export server you only need to install packages and run a node command:

```shell
pdf-export-server$ npm i
pdf-export-server$ node ./src/server.js
Access-Control-Allow-Origin: *
Http server started on port 8080
```

<a name="cli"></a>

## Configuration

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

## Links
- [Architecture](docs/architecture.md)
- [Server protocol](docs/protocol.md)
- [Building executable](docs/building.md)
- [Docker](docs/docker.md)

## FAQ

### Exported PDF/PNG doesn't look correct

Most likely server couldn't get access to the resources. See [architecture](docs/architecture.md) guide for detailed
information or [resources section](#CORS) for short summary.

### Cannot export using HTTPS

You can see errors like `NET::ERR_CERT_AUTHORITY_INVALID` or CORS exception (in Firefox). See
 [Make browser to accept self-signed certificate](#self-signed-certificate) section for more info.
