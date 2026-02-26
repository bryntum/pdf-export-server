/**
 * E2E tests for HTTP connectivity.
 * These tests verify that the HTTP server correctly receives requests and returns responses.
 * Most export logic testing is done in queue tests which are faster.
 */
const fs = require('fs');
const path = require('path');
const { startServer, stopServer, getLoggerConfig, getPort, certExists } = require('../utils.js');
const { assertExportedFile } = require('../assertions.js');

jest.setTimeout(60 * 1000);

let server;

afterEach(() => {
    if (server) {
        return stopServer(server).then(() => server = null);
    }
});

describe('E2E HTTP Export', () => {
    test('Should accept POST request and return PDF', async () => {
        const port = getPort();

        server = await startServer({
            protocol : 'http',
            port,
            workers  : 1,
            logger   : getLoggerConfig('e2e_http_pdf')
        });

        await assertExportedFile({
            fileFormat : 'pdf',
            host       : 'localhost',
            protocol   : 'http',
            port       : server.httpPort
        });
    });

    test('Should accept POST request and return PNG', async () => {
        const port = getPort();

        server = await startServer({
            protocol : 'http',
            port,
            workers  : 1,
            logger   : getLoggerConfig('e2e_http_png')
        });

        await assertExportedFile({
            fileFormat : 'png',
            host       : 'localhost',
            protocol   : 'http',
            port       : server.httpPort
        });
    });
});

describe('E2E HTTPS Export', () => {
    if (certExists) {
        test('Should accept POST request over HTTPS', async () => {
            const port = getPort();

            server = await startServer({
                protocol : 'https',
                port,
                workers  : 1,
                logger   : getLoggerConfig('e2e_https_pdf')
            });

            await assertExportedFile({
                fileFormat : 'pdf',
                host       : 'localhost',
                protocol   : 'https',
                port       : server.httpsPort
            });
        });
    }
    else {
        test('Cert is not found, skipping HTTPS tests', () => {});
    }
});
