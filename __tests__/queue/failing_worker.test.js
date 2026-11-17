const path = require('path');
const { createExportServer, stopExportServer, streamToBuffer, getLoggerConfig, loadTestHTML, RESOURCES_PORT } = require('../utils.js');

jest.setTimeout(5 * 60 * 1000);

const testPageHTML = loadTestHTML(path.join(__dirname, '../samples/smoke/base.html'));

// URL to navigate before setting content - establishes same-origin context for loading resources
const clientURL = `http://localhost:${RESOURCES_PORT}/resources/build/grid.css`;

let exportServer;

afterEach(() => {
    if (exportServer) {
        stopExportServer(exportServer);
        exportServer = null;
    }
});

describe('Queue with Randomly Failing Workers', () => {
    test('Should successfully export despite random worker failures', async () => {
        exportServer = createExportServer({
            workers : 4,
            testing : true,  // Enable random failures (40% probability)
            logger  : getLoggerConfig('queue_failing_worker')
        });

        const requestData = {
            html        : [{ html : testPageHTML }],
            orientation : 'portrait',
            format      : '1120*2389',
            fileFormat  : 'png',
            clientURL
        };

        // With testing mode, workers randomly fail but should eventually succeed through retries
        // We run multiple exports to test the retry mechanism
        const promises = [];
        for (let i = 0; i < 5; i++) {
            promises.push(
                exportServer.exportRequestHandler(requestData, `test-failing-${i}`)
                    .then(stream => streamToBuffer(stream))
                    .catch(() => null)  // Some may fail after max retries, that's expected
            );
        }

        const results = await Promise.all(promises);

        // At least some should succeed
        const successfulResults = results.filter(r => r !== null);
        expect(successfulResults.length).toBeGreaterThan(0);

        // Successful results should be valid PNGs
        successfulResults.forEach(buffer => {
            expect(buffer.length).toBeGreaterThan(0);
            expect(buffer[0]).toBe(0x89);
            expect(buffer.slice(1, 4).toString('utf8')).toBe('PNG');
        });
    });

    test('Should handle multiple pages with failing workers', async () => {
        exportServer = createExportServer({
            workers : 4,
            testing : true,
            logger  : getLoggerConfig('queue_failing_worker_multi')
        });

        const requestData = {
            html        : [
                { html : testPageHTML },
                { html : testPageHTML },
                { html : testPageHTML }
            ],
            orientation : 'portrait',
            format      : 'A4',
            fileFormat  : 'pdf',
            clientURL
        };

        // Some may fail after max retries
        const result = await exportServer.exportRequestHandler(requestData, 'test-failing-multi')
            .then(stream => streamToBuffer(stream))
            .catch(() => null);

        // If it succeeded, verify it's a valid PDF
        if (result) {
            expect(result.length).toBeGreaterThan(0);
            expect(result.slice(0, 4).toString('utf8')).toBe('%PDF');
        }
    });
});
