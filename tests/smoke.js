const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const testDataPDF = require('./samples/smoke/base_https.pdf.json');
const testDataPNG = require('./samples/smoke/base_https.png.json');
const { startServer, stopServer, getTmpFilePath, assertImage, ok, fail, certExists } = require('./utils.js');

// https://github.com/request/request/issues/418#issuecomment-274105600
// Allow self-signed certificates
https.globalAgent.options.rejectUnauthorized = false;

async function getFile(json, protocol, fileFormat, host, port, timeout) {
    return new Promise((resolve, reject) => {
        const request = (protocol === 'http' ? http : https).request({
            hostname : host,
            port     : port,
            method   : 'POST',
            headers  : {
                'Content-Type'   : 'application/json',
                'Content-Length' : Buffer.byteLength(json)
            },
            timeout : timeout != null ? timeout : undefined
        }, response => {
            const chunks = [];
            response.on('data', function(data) {
                chunks.push(data);
            });
            response.on('end', () => {
                const result = Buffer.concat(chunks);

                if (response.statusCode === 200) {
                    // fs.writeFileSync(path.join(__dirname, `test.${fileFormat}`), result);
                    resolve(result);
                }
                else if (/application\/json/.test(response.headers['content-type'])) {
                    reject(new Error(result.toString()));
                }
            });
        });

        request.on('timeout', () => {
            request.abort();

            reject(new Error('timeout'));
        });

        request.write(json);
        request.end();
    });
}

async function assertExportedFile({ protocol, host, port, fileFormat }) {
    const json = JSON.stringify(fileFormat === 'pdf' ? testDataPDF : testDataPNG);

    const exportedFile = await getFile(json, protocol, fileFormat, host, port);

    let result = false;

    if (fileFormat === 'png') {
        result = await assertImage(path.join(__dirname, 'samples', 'smoke', 'base_https.png'), exportedFile);
    }
    else {
        let baseSize = fs.statSync(path.join(__dirname, 'samples', 'smoke', `base_https.pdf`)).size;

        if (Math.abs(baseSize -  exportedFile.length) < baseSize * 0.05) {
            ok(`Exported ${fileFormat} has approximately ok size`);

            result = true;
        }
        else {
            const tmpFilePath = getTmpFilePath(fileFormat);

            fs.writeFileSync(tmpFilePath, exportedFile);

            fail(`${fileFormat} length differs very much from expected.\nSee exported file here: ${tmpFilePath}`);
        }
    }

    return result;
}

async function testWebServer({ protocol, fileFormat = 'pdf', workers = 1, host = '127.0.0.1', port = 8080 }) {
    console.log(`Testing exporting ${fileFormat} with ${protocol}://${host}:${port}`);

    let server = await startServer({ protocol, port, workers });

    const result = await assertExportedFile({ protocol, host, port, fileFormat });

    await stopServer(server);

    return result;
}

async function testConsequentRequests({ protocol, fileFormat = 'pdf', workers = 1, host = '127.0.0.1', port = 8080 }) {
    console.log(`Testing exporting ${fileFormat} with ${protocol}://${host}:${port}`);

    let server = await startServer({ protocol, port, workers });

    let result = await assertExportedFile({ protocol, host, port, fileFormat });

    console.log('Waiting for 30 seconds, export server should kill all idle workers');

    await new Promise(resolve => {
        setTimeout(() => resolve(), 30000);
    });

    const winner = await Promise.race([
        assertExportedFile({ protocol, host, port, fileFormat }),
        new Promise(resolve => {
            setTimeout(() => {
                resolve('timeout');
            }, 1000 * 60 * 2);
        })
    ]);

    if (winner === 'timeout') {
        fail('Server have not returned file in 2 minutes');
    }
    else {
        result &= winner;
    }

    await stopServer(server);

    return result;
}

async function run(options = {}) {
    let successful = true;

    console.log('Running smoke tests\n');

    successful &= await testWebServer(Object.assign({ protocol : 'http' }, options));
    successful &= await testWebServer(Object.assign({ protocol : 'http', fileFormat : 'png' }, options));

    if (certExists) {
        successful &= await testWebServer(Object.assign({ protocol : 'https' }, options));
        successful &= await testWebServer(Object.assign({ protocol : 'https', fileFormat : 'png' }, options));
    }

    successful &= await testConsequentRequests(Object.assign({ protocol : 'http', fileFormat : 'png' }, options));

    return successful;
}

module.exports = { run, getFile, getTmpFilePath };
