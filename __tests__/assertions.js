const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { getTmpFilePath, assertImage } = require('./utils.js');

const testPageHTML = fs.readFileSync(path.join(__dirname, 'samples/smoke/base.html'), 'utf-8');
const commonTestData = {
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
    fileFormat : 'pdf'
}

// https://github.com/request/request/issues/418#issuecomment-274105600
// Allow self-signed certificates
https.globalAgent.options.rejectUnauthorized = false;

/**
 * @param {Object} json
 * @param {'http'|'https'} protocol
 * @param {'pdf'|'png'} fileFormat
 * @param {String} host
 * @param {Number} port
 * @param {Number} timeout
 * @returns {Promise<Buffer>}
 */
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
                    resolve(result);
                }
                else if (/application\/json/.test(response.headers['content-type'])) {
                    reject(new Error(result.toString()));
                }
                else {
                    reject('Request ended unexpectedly');
                }
            });
        });

        request.on('timeout', () => {
            request.destroy();

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
        result = await assertImage(path.join(process.cwd(), '__tests__', 'samples', 'smoke', 'base_https.png'), exportedFile);
    }
    else {
        let baseSize = fs.statSync(path.join(process.cwd(), '__tests__', 'samples', 'smoke', `base_https.pdf`)).size;

        const gotSize = Math.abs(baseSize -  exportedFile.length);
        const expectedSize = baseSize * 0.05;

        if (gotSize > expectedSize) {
            const tmpFilePath = getTmpFilePath(fileFormat);

            fs.writeFileSync(tmpFilePath, exportedFile);

            fail(`${fileFormat} length differs very much from expected.\nCheck exported file here: ${tmpFilePath}`);
        }

        expect(gotSize).toBeLessThanOrEqual(expectedSize);
    }

    return result;
}

module.exports = {
    getFile,
    assertExportedFile
};
