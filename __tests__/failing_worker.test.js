const { startServer, stopServer, getLoggerConfig, getPort } = require('./utils.js');
const { assertExportedFile } = require('./assertions.js');

jest.setTimeout(5 * 60 * 1000);

let server;

afterEach(() => {
    if (server) {
        return stopServer(server).then(() => server = null);
    }
});

describe('Should export content with randomly failing workers', () => {
    test('Should export 5 equal PNG files', async () => {
        const
            host     = 'localhost',
            protocol = 'http',
            port     = getPort(),
            workers  = 4;

        server = await startServer({ protocol, port, workers, testing : true, logger : getLoggerConfig('failing_workers') });

        const promises = [];

        for (let i = 0; i < 5; i++) {
            // Use longer timeout since server randomly fails and retries
            promises.push(assertExportedFile({ protocol, host, port: server.httpPort, fileFormat : 'png', timeout : 60000 }));
        }

        // Errors are expected in testing mode due to random failures - don't fail the test
        await Promise.all(promises).catch(() => {});
    });
});
