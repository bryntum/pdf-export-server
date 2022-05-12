const requestPayload = require('./samples/parallel/parallel2.json');
const { is, fail, startServer, stopServer } = require('./utils.js');

async function assertConcurrentRequests({ protocol = 'http', port = 8080, workers = 1 }) {
    const server = await startServer({ protocol, port, workers });

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
    const buffers = await Promise.race([
        Promise.all([promise1, promise2]),
        new Promise(resolve => setTimeout(() => {
            resolve('timeout');
        }, 20000))
    ]);

    if (buffers === 'timeout') {
        fail('Request timeout');
    }
    else {
        is(buffers[0].length, buffers[1].length, 'Generated files have same size');
    }

    // Wait couple seconds for workers to become idle/get destroyed
    await new Promise(resolve => setTimeout(resolve, 3000));

    await stopServer(server);

    return true;
}

async function run(options) {
    let successful = true;

    console.log('\nTesting parallel export requests received in very specific moments\n');

    successful &= await assertConcurrentRequests(Object.assign({ protocol : 'http' }, options));

    return successful;
}

module.exports = { run };
