const testDataPDF = require('./samples/smoke/base_https.pdf.json');
const { startServer, stopServer, getLoggerConfig } = require('./utils.js');
const { getFile } = require('./assertions.js');

// We export 100 pages, takes time
jest.setTimeout(5 * 60 * 1000);

let server;

async function assertExportedFile({ protocol, host, port }) {
    const json = JSON.stringify(testDataPDF); // using data for pnf, it has 3 pages

    // request file with timeout 20 seconds, which is more than enough
    const exportedFile = await getFile(json, protocol, 'png', host, port, 20000);

    // Image received
    expect(exportedFile?.length).toBeGreaterThan(1000);
}

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
                promises.push(assertExportedFile({ protocol, host, port: server.httpPort }));
            }

            await Promise.all(promises);
        }
        catch (e) {
            fail(e);
        }
    });
});
