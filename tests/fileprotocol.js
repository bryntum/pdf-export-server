const { certExists, startServer, stopServer, is } = require('./utils.js');
const testData = require('./samples/fileprotocol/data.json');
const { getFile } = require('./smoke.js');

async function exportFile({ protocol, host, port, fileFormat }) {
    const json = JSON.stringify(testData);

    await getFile(json, protocol, fileFormat, host, port);
}

async function testWebServer({ protocol, fileFormat = 'pdf', workers = 1, host = '127.0.0.1', port = 8080 }) {
    console.log(`Testing exporting ${fileFormat} with ${protocol}://${host}:${port}`);

    let server = await startServer({ protocol, port, workers });

    const runJob = server.taskQueue.runJob;

    const errorMessages = [];

    server.taskQueue.runJob = function(worker, job) {
        if (!worker.patched) {
            worker.patched = true;

            worker.error = message => {
                errorMessages.push(message);
            };
        }
        runJob.apply(server.taskQueue, [worker, job]);
    };

    const result = await exportFile({ protocol, host, port, fileFormat });

    const
        fooRe = /Not allowed to load local resource.+foo.css/,
        barRe = /Not allowed to load local resource.+bar.css/,
        buzRe = /Not allowed to load local resource.+buz.css/;

    let fooMatch = false,
        barMatch = false,
        buzMatch = false;

    errorMessages.forEach(message => {
        fooMatch |= fooRe.test(message);
        barMatch |= barRe.test(message);
        buzMatch |= buzRe.test(message);
    });

    is(fooMatch, true, 'foo.css is not loaded');
    is(barMatch, true, 'bar.css is not loaded');
    is(buzMatch, true, 'buz.css is not loaded');

    await stopServer(server);

    return result;
}

async function run(options) {
    let successful = true;

    console.log('\nTesting parallel export requests\n');

    successful &= await testWebServer(Object.assign({ protocol : 'http' }, options));

    if (certExists) {
        successful &= await testWebServer(Object.assign({ protocol : 'https' }, options));
    }

    return successful;
}

module.exports = { run };
