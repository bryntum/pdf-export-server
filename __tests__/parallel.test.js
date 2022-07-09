const fs = require('fs');
const testData = require('./samples/parallel/data.json');
const { getTmpFilePath, certExists, startServer, stopServer, getLoggerConfig } = require('./utils.js');
const { getFile } = require('./assertions.js');
const requestPayload = require('./samples/parallel/parallel2.json');

// We export 100 pages, takes time
jest.setTimeout(5 * 60 * 1000);

let server;

afterEach(() => {
    if (server) {
        return stopServer(server).then(() => server = null);
    }
});

describe('Should export over HTTP', () => {
    test('Should export tp PDF', async () => {
        const
            host       = 'localhost',
            protocol   = 'http',
            port       = 8081,
            workers    = 4,
            fileFormat = 'pdf';

        server = await startServer({ protocol, port, workers, logger : getLoggerConfig('parallel_http_pdf') })

        const promises = [];

        const json = JSON.stringify(testData);

        for (let i = 0; i < 2; i++) {
            promises.push(getFile(json, protocol, fileFormat, host, server.httpPort, 60000 * 2));
        }

        const exportedFiles = await Promise.all(promises);

        exportedFiles.forEach(file => {
            if (file.length < 100000) {
                const tmpFilePath = getTmpFilePath(fileFormat);

                fs.writeFileSync(tmpFilePath, file);

                fail(`${fileFormat} length is incorrect!\nSee exported file here: ${tmpFilePath}`);
            }

            // Not clear how to compare visual result of pdf, yet
            // So this is more of a sanity test, checking if returned pdf has size greater that .100KB
            expect(file.length).toBeGreaterThan(100000);
        });
    });
});

describe('Should export over HTTPS', () => {
    if (certExists) {
        test('Should export tp PDF', async () => {

        });
    }
    else {
        test('Cert is not found, skipping tests', () => {});
    }
});

describe('Parallel export requests received in very specific moments should work ok', () => {
    test('', async () => {
        const
            protocol = 'http',
            port     = 8081,
            workers  = 2;

        server = await startServer({ protocol, port, workers, logger : getLoggerConfig('parallel_2') });

        const old = server.taskQueue.runJob;

        // Create a promise which will resolve when first worker is started. At that point of time we want to process another
        // request on the server.
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

        // Limit waiting time by 20 sec
        const promises = [
            Promise.all([promise1, promise2]),
            new Promise(resolve => setTimeout(() => {
                resolve('timeout');
            }, 20000))
        ];
        const buffers = await Promise.race(promises);

        await Promise.allSettled(promises);

        if (buffers === 'timeout') {
            fail('Request timeout');
        }
        else {
            // Generated files have same size
            expect(buffers[0].length).toEqual(buffers[1].length);
        }

        // Wait couple seconds for workers to become idle/get destroyed
        await new Promise(resolve => setTimeout(resolve, 3000));
    });
});
