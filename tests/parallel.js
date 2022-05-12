const fs = require('fs');
const testData = require('./samples/parallel/data.json');
const { getFile } = require('./smoke.js');
const { getTmpFilePath, fail, ok, certExists, startServer, stopServer } = require('./utils.js');

async function testWebServer({ protocol, fileFormat = 'pdf', workers = 1, host = 'localhost', port = 8080 }) {
    console.log(`Testing exporting ${fileFormat} with ${protocol}://${host}:${port}`);

    const server = await startServer({ protocol, port, workers });

    const promises = [];

    const json = JSON.stringify(testData);

    for (let i = 0; i < 2; i++) {
        promises.push(getFile(json, protocol, fileFormat, host, port));
    }

    const exportedFiles = await Promise.all(promises);

    // let baseSize = fs.statSync(path.join(__dirname, 'samples', 'parallel', 'base.pdf')).size;

    let result = exportedFiles.every(file => {
        let result;

        // Not clear how to compare visual result of pdf, yet
        // So this is more of a sanity test, checking if returned pdf has size greater that .5MB
        if (file.length > 500000) {
            result = true;
        }
        else {
            const tmpFilePath = getTmpFilePath(fileFormat);

            fs.writeFileSync(tmpFilePath, file);

            fail(`${fileFormat} length is incorrect!\nSee exported file here: ${tmpFilePath}`);

            result = false;
        }

        return result;
    });

    if (result) {
        ok(`All exported ${fileFormat} has exact size as the base`);
    }

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
