const { startServer, stopServer, getLoggerConfig } = require('./utils.js');
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
            port     = 8081,
            workers  = 4;

        server = await startServer({ protocol, port, workers, testing : true, logger : getLoggerConfig('failing_workers') });

        try {
            const promises = [];

            for (let i = 0; i < 5; i++) {
                promises.push(assertExportedFile({ protocol, host, port: server.httpPort, fileFormat : 'png' }));
            }

            await Promise.all(promises);
        }
        catch (e) {
            fail(e);
        }
    });
});
