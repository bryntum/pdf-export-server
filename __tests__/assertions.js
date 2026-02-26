const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { getTmpFilePath } = require('./utils.js');

const testPageHTML = fs.readFileSync(path.join(__dirname, 'samples/smoke/base.html'), 'utf-8');
const commonTestData = {
    // Navigate to this URL to fix web security issues
    clientURL    : 'http://localhost:{port}/resources/build/grid.css',
    orientation  : 'portrait',
    // This is calculated canvas size for the HTML being rendered
    format       : '1120*2389',
    fileName     : 'base_https',
    sendAsBinary : true
}
const testDataPDF = {
    ...commonTestData,
    html       : [{ html : testPageHTML }],
    fileFormat : 'pdf'
}
const testDataPNG = {
    ...commonTestData,
    html       : [{ html : testPageHTML }],
    fileFormat : 'png'
}

// https://github.com/request/request/issues/418#issuecomment-274105600
// Allow self-signed certificates
https.globalAgent.options.rejectUnauthorized = false;

/**
 * @param {String} json
 * @param {'http'|'https'} protocol
 * @param {'pdf'|'png'} fileFormat
 * @param {String} host
 * @param {Number} port
 * @param {Number} timeout
 * @returns {Promise<Buffer>}
 */
async function getFile(json, protocol, fileFormat, host, port, timeout) {
    json = json.replace(/{port}/g, String(port));

    // Default timeout: 30 seconds for CI environments
    const requestTimeout = timeout != null ? timeout : 30000;

    return new Promise((resolve, reject) => {
        let settled = false;

        const settle = (fn, value) => {
            if (!settled) {
                settled = true;
                fn(value);
            }
        };

        const request = (protocol === 'http' ? http : https).request({
            hostname : host,
            port     : port,
            method   : 'POST',
            headers  : {
                'Content-Type'   : 'application/json',
                'Content-Length' : Buffer.byteLength(json)
            },
            timeout : requestTimeout
        }, response => {
            const chunks = [];
            response.on('data', function(data) {
                chunks.push(data);
            });
            response.on('end', () => {
                const result = Buffer.concat(chunks);

                if (response.statusCode === 200) {
                    settle(resolve, result);
                }
                else if (/application\/json/.test(response.headers['content-type'])) {
                    settle(reject, new Error(result.toString()));
                }
                else {
                    settle(reject, new Error('Request ended unexpectedly'));
                }
            });
        });

        request.on('timeout', () => {
            request.destroy();
            settle(reject, new Error('timeout'));
        });

        // Handle errors to prevent unhandled 'error' events after timeout/destroy
        request.on('error', (error) => {
            settle(reject, error);
        });

        request.write(json);
        request.end();
    });
}

async function assertExportedFile({ protocol, host, port, fileFormat, timeout }) {
    const json = JSON.stringify(fileFormat === 'pdf' ? testDataPDF : testDataPNG);

    const exportedFile = await getFile(json, protocol, fileFormat, host, port, timeout);

    let baseSize = fs.statSync(path.join(process.cwd(), '__tests__', 'samples', 'smoke', `base_https.${fileFormat}`)).size;

    const gotSize = Math.abs(baseSize -  exportedFile.length);
    const expectedSize = baseSize * 0.05;

    if (gotSize > expectedSize) {
        const tmpFilePath = getTmpFilePath(fileFormat);

        fs.writeFileSync(tmpFilePath, exportedFile);

        fail(`${fileFormat} length differs very much from expected.\nCheck exported file here: ${tmpFilePath}`);
    }

    expect(gotSize).toBeLessThanOrEqual(expectedSize);
}

async function waitForWithTimeout(promise, timeout) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Promise timed out after ${timeout}ms.`));
            }, timeout);
        })
    ]);
}

module.exports = {
    getFile,
    assertExportedFile,
    waitForWithTimeout
};
