const fs = require('fs');
const path = require('path');
const { getTmpFilePath, startServer, stopServer, getLoggerConfig } = require('./utils.js');
const { getFile, waitForWithTimeout } = require('./assertions.js');

// We export 100 pages, takes time
jest.setTimeout(5 * 60 * 1000);

let server;

afterEach(() => {
    if (server) {
        return stopServer(server).then(() => server = null);
    }
});

describe('Should export over HTTP', () => {
    test('Should export to PDF', async () => {
        // Load HTML chunks from samples/parallel/chunks
        const chunksDir = path.join(__dirname, 'samples', 'parallel', 'chunks');
        const chunkFiles = fs.readdirSync(chunksDir).filter(f => f.endsWith('.html')).sort();
        const htmlChunks = chunkFiles.map(file => ({
            html : fs.readFileSync(path.join(chunksDir, file), 'utf-8')
        }));

        const testData = {
            // Navigate to this URL to fix web security issues
            clientURL    : 'http://localhost:{port}/resources/build/grid.css',
            orientation  : 'portrait',
            format       : 'A4',
            fileFormat   : 'pdf',
            fileName     : 'Grid',
            sendAsBinary : true,
            html         : htmlChunks
        }

        const
            host       = 'localhost',
            protocol   = 'http',
            port       = 8081,
            workers    = 4,
            fileFormat = 'pdf';

        server = await startServer({ protocol, port, workers, logger : getLoggerConfig('parallel_http_pdf') })

        const promises = [];

        const json = JSON.stringify(testData).replace(/{port}/g, String(server.httpPort));

        for (let i = 0; i < 2; i++) {
            promises.push(getFile(json, protocol, fileFormat, host, server.httpPort, 1000 * 20));
        }

        const exportedFiles = await Promise.all(promises);

        exportedFiles.forEach(file => {
            let baseSize = fs.statSync(path.join(process.cwd(), '__tests__', 'samples', 'parallel', `base.pdf`)).size;

            const sizeDelta = Math.abs(baseSize -  file.length);
            const threshold = baseSize * 0.05;

            if (sizeDelta > threshold) {
                const tmpFilePath = getTmpFilePath(fileFormat);

                fs.writeFileSync(tmpFilePath, file);

                fail(`${fileFormat} length differs very much from expected.\nCheck exported file here: ${tmpFilePath}`);
            }

            expect(sizeDelta).toBeLessThanOrEqual(threshold);
        });
    });
});

describe('Parallel export requests received in very specific moments should work ok', () => {
    test('Should export to pdf', async () => {
        const
            protocol = 'http',
            port     = 8081,
            workers  = 2;

        const requestPayload = {
            // Navigate to this URL to fix web security issues
            clientURL    : 'http://localhost:{port}/resources/build/grid.css',
            orientation  : 'portrait',
            format       : 'A4',
            fileFormat   : 'pdf',
            fileName     : 'Grid',
            sendAsBinary : true,
            html         : [{ html : fs.readFileSync(path.join(__dirname, 'samples', 'parallel', 'chunks', 'page_1.html'), 'utf-8') }]
        }

        server = await startServer({ protocol, port, workers, logger : getLoggerConfig('parallel_2') });

        const old = server.taskQueue.runJob;

        // Create a promise which will resolve when first worker is started. At that point of time we want to process
        // another request on the server.
        const promise2 = new Promise(resolve => {
            let overridden = false;

            server.taskQueue.runJob = function(worker, job) {
                if (!overridden) {
                    overridden = true;

                    worker.onPageCreated = function() {
                        // replace hook with empty one
                        worker.onPageCreated = () => {};

                        resolve(server.exportRequestHandler(requestPayload, 'request2'));
                    };
                }
                old.apply(server.taskQueue, [worker, job]);
            };
        });

        const promise1 = server.exportRequestHandler(requestPayload, 'request1');

        const files = await waitForWithTimeout(Promise.all([promise1, promise2]), 1000 * 20);

        // Generated files have same size
        expect(files[0].length).toEqual(files[1].length);
    });
});
