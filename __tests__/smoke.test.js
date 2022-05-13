const { startServer, stopServer, certExists, getPort, getLoggerConfig } = require('../tests/utils.js');
const { assertExportedFile } = require('./assertions.js');

// It may take about 10 seconds to export single page
jest.setTimeout(60000);

let server;

afterEach(() => {
    if (server) {
        return stopServer(server);
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
            port
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

        await assertExportedFile({ protocol, host, port, fileFormat });

        // Waiting for 30 seconds, export server should kill all idle workers
        await new Promise(resolve => {
            setTimeout(() => resolve(), 30000);
        });

        const winner = await Promise.race([
            assertExportedFile({ protocol, host, port, fileFormat }),
            new Promise(resolve => {
                setTimeout(() => {
                    resolve('timeout');
                }, 1000 * 60 * 2);
            })
        ]);

        if (winner === 'timeout') {
            fail('Server have not returned file in 2 minutes');
        }
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
                port
            });
        });
    }
    else {
        test('Cert is not found, skipping tests', () => {});
    }
});
