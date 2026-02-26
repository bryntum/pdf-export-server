#!/usr/bin/env node

/**
 * Utility script to wrap HTML file into PDF export POST request and send it to the server.
 *
 * Usage:
 *   node scripts/wrap-html.js [input.html] [output.pdf] [port]
 *
 * Defaults:
 *   input:  tmp/test.html
 *   output: tmp/output.pdf
 *   port:   8080
 *
 * Examples:
 *   node scripts/wrap-html.js
 *   node scripts/wrap-html.js tmp/test.html
 *   node scripts/wrap-html.js tmp/test.html tmp/result.pdf
 *   node scripts/wrap-html.js tmp/test.html tmp/result.pdf 8081
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const args = process.argv.slice(2);
const inputPath = args[0] || 'tmp/test.html';
const outputPath = args[1] || 'tmp/output.pdf';
const port = parseInt(args[2], 10) || 8080;

// Resolve paths relative to project root
const projectRoot = path.join(__dirname, '..');
const absoluteInputPath = path.isAbsolute(inputPath)
    ? inputPath
    : path.join(projectRoot, inputPath);
const absoluteOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(projectRoot, outputPath);

// Check if input file exists
if (!fs.existsSync(absoluteInputPath)) {
    console.error(`Error: Input file not found: ${absoluteInputPath}`);
    process.exit(1);
}

// Read HTML content
const htmlContent = fs.readFileSync(absoluteInputPath, 'utf-8');

// Extract dimensions from HTML if possible (look for body width/height styles)
let format = 'A4';
const widthMatch = htmlContent.match(/width\s*:\s*(\d+)px/);
const heightMatch = htmlContent.match(/height\s*:\s*(\d+)px/);

if (widthMatch && heightMatch) {
    format = `${widthMatch[1]}*${heightMatch[1]}`;
}

// Build the POST request structure (matching testDataPDF in assertions.js)
const requestData = {
    orientation  : 'portrait',
    format       : format,
    fileName     : path.basename(inputPath, path.extname(inputPath)),
    sendAsBinary : true,
    html         : [{ html : htmlContent }],
    fileFormat   : 'pdf'
};

const jsonBody = JSON.stringify(requestData);

console.log(`Sending POST request to http://localhost:${port}/`);
console.log(`Input: ${absoluteInputPath}`);
console.log(`Output: ${absoluteOutputPath}`);
console.log(`Format: ${format}`);

const request = http.request({
    hostname : 'localhost',
    port     : port,
    path     : '/',
    method   : 'POST',
    headers  : {
        'Content-Type'   : 'application/json',
        'Content-Length' : Buffer.byteLength(jsonBody)
    }
}, response => {
    const chunks = [];

    response.on('data', chunk => {
        chunks.push(chunk);
    });

    response.on('end', () => {
        const result = Buffer.concat(chunks);

        if (response.statusCode === 200) {
            // Check if it's a PDF (starts with %PDF)
            if (result.slice(0, 4).toString() === '%PDF') {
                fs.writeFileSync(absoluteOutputPath, result);
                console.log(`Success! PDF saved to: ${absoluteOutputPath}`);
                console.log(`File size: ${result.length} bytes`);
            } else {
                // Might be JSON error response
                try {
                    const json = JSON.parse(result.toString());
                    console.error('Server returned JSON instead of PDF:', json);
                } catch {
                    console.error('Unexpected response:', result.toString().slice(0, 500));
                }
                process.exit(1);
            }
        } else {
            console.error(`Server returned status ${response.statusCode}`);
            try {
                const json = JSON.parse(result.toString());
                console.error('Error:', json.msg || json);
            } catch {
                console.error('Response:', result.toString().slice(0, 500));
            }
            process.exit(1);
        }
    });
});

request.on('error', err => {
    console.error(`Request failed: ${err.message}`);
    console.error(`Is the server running on port ${port}?`);
    process.exit(1);
});

request.write(jsonBody);
request.end();
