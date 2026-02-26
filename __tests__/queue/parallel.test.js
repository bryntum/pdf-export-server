const fs = require('fs');
const path = require('path');
const { createExportServer, stopExportServer, streamToBuffer, getLoggerConfig, getTmpFilePath, loadTestHTML, RESOURCES_PORT } = require('../utils.js');
const { waitForWithTimeout } = require('../assertions.js');

// We export many pages, takes time
jest.setTimeout(5 * 60 * 1000);

const parallelSamplesDir = path.join(__dirname, '../samples/parallel');
const smokeSamplesDir = path.join(__dirname, '../samples/smoke');
const baselineParallelPDF = path.join(parallelSamplesDir, 'base.pdf');

// URL to navigate before setting content - establishes same-origin context for loading resources
const clientURL = `http://localhost:${RESOURCES_PORT}/resources/build/grid.css`;

// Allow 5% size difference from baseline
const SIZE_THRESHOLD = 0.05;

/**
 * Assert that buffer size is within threshold of baseline file.
 * If not, save the output to tmp directory for inspection.
 */
function assertSizeMatchesBaseline(buffer, baselinePath, fileFormat) {
    const baseSize = fs.statSync(baselinePath).size;
    const sizeDelta = Math.abs(baseSize - buffer.length);
    const threshold = baseSize * SIZE_THRESHOLD;

    if (sizeDelta > threshold) {
        const tmpFilePath = getTmpFilePath(fileFormat);
        fs.writeFileSync(tmpFilePath, buffer);
        throw new Error(
            `${fileFormat.toUpperCase()} size differs from baseline.\n` +
            `Expected: ~${baseSize} bytes, Got: ${buffer.length} bytes\n` +
            `Delta: ${sizeDelta} (threshold: ${Math.round(threshold)})\n` +
            `Exported file saved to: ${tmpFilePath}`
        );
    }

    expect(sizeDelta).toBeLessThanOrEqual(threshold);
}

let exportServer;

afterEach(() => {
    if (exportServer) {
        stopExportServer(exportServer);
        exportServer = null;
    }
});

describe('Queue Parallel Export', () => {
    test('Should export many pages in parallel matching baseline', async () => {
        // Load HTML chunks from samples/parallel/chunks
        const chunksDir = path.join(parallelSamplesDir, 'chunks');
        const chunkFiles = fs.readdirSync(chunksDir).filter(f => f.endsWith('.html')).sort();
        const htmlChunks = chunkFiles.map(file => ({
            html : loadTestHTML(path.join(chunksDir, file))
        }));

        exportServer = createExportServer({
            workers : 4,
            logger  : getLoggerConfig('queue_parallel')
        });

        const requestData = {
            orientation : 'portrait',
            format      : 'A4',
            fileFormat  : 'pdf',
            html        : htmlChunks,
            clientURL
        };

        const result = await exportServer.exportRequestHandler(requestData, 'test-parallel-1');
        const buffer = await streamToBuffer(result);

        // Verify we got a valid PDF
        expect(buffer.slice(0, 4).toString('utf8')).toBe('%PDF');

        // Compare with baseline
        assertSizeMatchesBaseline(buffer, baselineParallelPDF, 'pdf');
    });

    test('Should handle concurrent export requests', async () => {
        const testPageHTML = loadTestHTML(path.join(smokeSamplesDir, 'base.html'));

        exportServer = createExportServer({
            workers : 2,
            logger  : getLoggerConfig('queue_parallel_concurrent')
        });

        const requestData = {
            orientation : 'portrait',
            format      : 'A4',
            fileFormat  : 'pdf',
            html        : [{ html : testPageHTML }],
            clientURL
        };

        // Send multiple requests concurrently
        const promises = [
            exportServer.exportRequestHandler(requestData, 'concurrent-1'),
            exportServer.exportRequestHandler(requestData, 'concurrent-2'),
            exportServer.exportRequestHandler(requestData, 'concurrent-3')
        ];

        const results = await Promise.all(promises);
        const buffers = await Promise.all(results.map(r => streamToBuffer(r)));

        // All should produce valid PDFs of similar size
        buffers.forEach((buffer, i) => {
            expect(buffer.length).toBeGreaterThan(0);
            expect(buffer.slice(0, 4).toString('utf8')).toBe('%PDF');
        });

        // All files should be approximately the same size
        const sizes = buffers.map(b => b.length);
        const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
        sizes.forEach(size => {
            expect(Math.abs(size - avgSize)).toBeLessThan(avgSize * 0.1);
        });
    });

    test('Should handle request arriving while worker is processing', async () => {
        const testPageHTML = loadTestHTML(path.join(parallelSamplesDir, 'chunks/page_1.html'));

        exportServer = createExportServer({
            workers : 2,
            logger  : getLoggerConfig('queue_parallel_timing')
        });

        const requestData = {
            orientation : 'portrait',
            format      : 'A4',
            fileFormat  : 'pdf',
            html        : [{ html : testPageHTML }],
            clientURL
        };

        const old = exportServer.taskQueue.runJob.bind(exportServer.taskQueue);

        // Create a promise which resolves when first worker starts processing
        // At that moment, we send another request
        const promise2 = new Promise(resolve => {
            let overridden = false;

            exportServer.taskQueue.runJob = function(worker, job) {
                if (!overridden) {
                    overridden = true;

                    worker.onPageCreated = function() {
                        worker.onPageCreated = () => {};
                        resolve(exportServer.exportRequestHandler(requestData, 'request2'));
                    };
                }
                old(worker, job);
            };
        });

        const promise1 = exportServer.exportRequestHandler(requestData, 'request1');

        const results = await waitForWithTimeout(Promise.all([promise1, promise2]), 20000);
        const buffers = await Promise.all(results.map(r => streamToBuffer(r)));

        // Both should produce valid PDFs of same size
        expect(buffers[0].length).toBeGreaterThan(0);
        expect(buffers[1].length).toBeGreaterThan(0);
        expect(buffers[0].length).toEqual(buffers[1].length);
    });
});
