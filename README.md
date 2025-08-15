# PDF export server

This repository contains sources for a server which builds PDF and PNG files out of HTML fragments.
Server is designed to work with [Bryntum PDF Export feature](https://bryntum.com/products/grid/docs/api/Grid/feature/export/PdfExport).
See compatibility table between Export server and other Bryntum products in this [table](docs/compatibility.md).

Live demos available here:
- [Gantt](https://bryntum.com/products/gantt/examples/export/)
- [Scheduler](https://bryntum.com/products/scheduler/examples/export/)
- [Grid](https://bryntum.com/products/grid/examples/export/)

#### Features 
- Uses headless chromium browser.
- Runnable as NodeJS instance.
- Docker container available at [Docker Hub](https://hub.docker.com/r/bryntum/pdf-export-server)
- Can be assembled to a single executable file
- Written in JavaScript and fully adaptable.
- Can be used as standalone service or as an intermediary between your (C#, Java, PHP) frontend and backend.

## Getting started

### Using NodeJS

Supported Node versions:
```
1.0.0+: Node >=8 <14
2.0.0+: Node >= 20
```

1. Check out this repository
```shell
git clone git@github.com:bryntum/pdf-export-server.git
cd pdf-export-server 
```
2. Install packages
```shell
pdf-export-server$ npm i
```
3. Start the server
```shell
pdf-export-server$ npm run start
Access-Control-Allow-Origin: *
Http server started on port 8080
```

Multiple configuration options are available as you can see in the [configuration](docs/configuration.md) guide.


### Using image from Docker Hub

For your convenience we have pre-built container available on
[Docker Hub](https://hub.docker.com/r/bryntum/pdf-export-server).

1. Pull it
```shell
docker pull bryntum/pdf-export-server
```
2. Create `docker-compose.yml` and configure image/port forwarding
```yaml
version: "3.9"
services:
  web:
    image: "bryntum/pdf-export-server:latest"
    ports:
      - "8080:8080"
```
3. Start container
```shell
docker compose -f docker-compose.yml up
```

You can also build image from source as described in the [Docker guide](docs/docker.md)

## Building Executable

To create a standalone executable file for the PDF Export Server, follow the detailed instructions provided in
the [Building executable guide](docs/building.md). This process ensures that the server can run independently without
needing a Node.js environment.

### Steps to Build

1. **Install Prerequisites**
 - Ensure you have the required Node.js version (as mentioned in the [Getting Started](#using-nodejs) section).
 - Make sure all dependencies are installed:
   ```shell
   npm i
   ```

2. **Run the Build Command**  
   Execute the following command to create the executable:
   ```shell
   npm run build
   ```

3. **Run the Executable**  
   Once the executable is built, you can launch the server directly without any external dependencies:
   ```shell
   ./dist/pdf-export-server*
   ```

## Links
- [Architecture](docs/architecture.md)
- [Server protocol](docs/protocol.md)
- [Building executable](docs/building.md)
- [Docker](docs/docker.md)
- [Compatibility table](docs/compatibility.md)
- [Configuration options](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)

## FAQ

### Exported PDF/PNG doesn't look correct

Most likely server couldn't get access to the resources. See [architecture](docs/architecture.md) guide for detailed
information, [resources section](#CORS) for short summary and [troubleshooting](docs/troubleshooting.md) guide for
debugging tips.

### PDF/PNG file is not generated

Most likely there is a problem on the server, see [troubleshooting](docs/troubleshooting.md) guide for help.

### Cannot export using HTTPS

You can see errors like `NET::ERR_CERT_AUTHORITY_INVALID` or CORS exception (in Firefox). See
 [Make browser to accept self-signed certificate](docs/building.md#self-signed-certificate) section for more info.
