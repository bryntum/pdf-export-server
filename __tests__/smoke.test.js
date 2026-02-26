const { startServer, stopServer, certExists, getLoggerConfig, getPort } = require('./utils.js');
const { assertExportedFile, waitForWithTimeout } = require('./assertions.js');

jest.setTimeout(3 * 60 * 1000);

let server;

afterEach(() => {
    if (server) {
        return stopServer(server).then(() => server = null);
    }
});

describe('Should export over HTTP', () => {
    test('Should export to PDF', async () => {
        const
            protocol = 'http',
            port     = getPort(),
            workers  = 1;

        server = await startServer({ protocol, port, workers, logger : getLoggerConfig('smoke_http_pdf') })

        await assertExportedFile({
            fileFormat: 'pdf',
            host: 'localhost',
            protocol,
            port: server.httpPort
        });
    });

    test('Should run consequent requests', async () => {
        const
            host       = 'localhost',
            protocol   = 'http',
            port       = getPort(),
            workers    = 1,
            fileFormat = 'pdf';

        server = await startServer({ protocol, port, workers, logger : getLoggerConfig('smoke_consequent') });

        await assertExportedFile({ protocol, host, port: server.httpPort, fileFormat });

        // Wait for queue to empty
        await waitForWithTimeout(server.waitForQueueEvent('empty'), 1000 * 5);

        // Export another file, it should create workers again and return file
        await waitForWithTimeout(assertExportedFile({ protocol, host, port: server.httpPort, fileFormat }), 1000 * 5);
    });
});

describe('Should export over HTTPS', () => {
    if (certExists) {
        test('Should export to PDF', async () => {
            const
                protocol = 'https',
                port     = getPort(),
                workers  = 1;

            server = await startServer({ protocol, port, workers, logger : getLoggerConfig('smoke_https_pdf') })

            await assertExportedFile({
                fileFormat: 'pdf',
                host: 'localhost',
                protocol,
                port: server.httpsPort
            });
        });
    }
    else {
        test('Cert is not found, skipping tests', () => {});
    }
});
