const testDataPDF = require('./samples/smoke/base_https.pdf.json');
const { getFile } = require('./smoke.js');
const { getTmpFilePath, startServer, stopServer, ok, fail } = require('./utils.js');

async function assertExportedFile({ protocol, host, port }) {
    const json = JSON.stringify(testDataPDF); // using data for pnf, it has 3 pages

    // request file with timeout 20 seconds, which is more than enough
    const exportedFile = await getFile(json, protocol, 'png', host, port, 20000);

    let result;

    if (exportedFile && exportedFile.length > 1000) {
        ok('Image received');

        result = true;
    }
    else {
        fail('Received empty response from the server');

        result = false;
    }

    return result;
}

async function testComplexPNG({ protocol, workers = 3, host = 'localhost', port = 8080 }) {
    console.log(`Testing exporting image on a server with randomly failing workers by address ${protocol}://${host}:${port}`);

    let server = await startServer({ protocol, port, workers, testing : true });

    let result = true;

    try {
        // make 5 consequent requests, waiting for each previous to end
        for (let i = 0; i < 5; i++) {
            console.log(`Requesting image ${i + 1} of 5`);

            result &= await assertExportedFile({ protocol, host, port });
        }

        await stopServer(server);
    }
    catch (e) {
        fail('Exception occurred');

        console.error(e.stack);

        result = false;

        await stopServer(server);
    }

    return result;
}

async function run(options = {}) {
    let successful = true;

    console.log('\nRunning failing workers tests\n');

    successful &= await testComplexPNG(Object.assign({ protocol : 'http' }, options));

    return successful;
}

module.exports = { run, getTmpFilePath };
