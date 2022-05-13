const { startServer, stopServer, certExists, getLoggerConfig } = require('./utils.js');
const { assertExportedFile } = require('./assertions.js');

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
            port     = 8081,
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
            port       = 8081,
            workers    = 1,
            fileFormat = 'pdf';

        server = await startServer({ protocol, port, workers, logger : getLoggerConfig('smoke_consequent') });

        await assertExportedFile({ protocol, host, port: server.httpPort, fileFormat });

        // Waiting for 30 seconds, export server should kill all idle workers
        await new Promise(resolve => {
            setTimeout(() => resolve(), 30000);
        });

        const promises = [
            assertExportedFile({ protocol, host, port: server.httpPort, fileFormat }),
            new Promise(resolve => {
                setTimeout(() => {
                    resolve('timeout');
                }, 1000 * 60 * 2);
            })
        ];

        const winner = await Promise.race(promises);

        await Promise.allSettled(promises);

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
                port     = 8081,
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
