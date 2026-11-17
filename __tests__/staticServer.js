/**
 * Static file server for serving test resources.
 * Used by Jest globalSetup/globalTeardown to make resources available during tests.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

const RESOURCES_PORT = 9999;
const RESOURCES_DIR = path.join(__dirname, 'samples', 'resources');

// MIME types for common file types
const MIME_TYPES = {
    '.html' : 'text/html',
    '.css'  : 'text/css',
    '.js'   : 'application/javascript',
    '.json' : 'application/json',
    '.png'  : 'image/png',
    '.jpg'  : 'image/jpeg',
    '.jpeg' : 'image/jpeg',
    '.gif'  : 'image/gif',
    '.svg'  : 'image/svg+xml',
    '.woff' : 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf'  : 'font/ttf',
    '.eot'  : 'application/vnd.ms-fontobject'
};

let server = null;

/**
 * Start the static file server
 * @returns {Promise<http.Server>}
 */
function startStaticServer() {
    return new Promise((resolve, reject) => {
        server = http.createServer((req, res) => {
            // Remove /resources prefix from URL
            let urlPath = req.url.split('?')[0];
            if (urlPath.startsWith('/resources')) {
                urlPath = urlPath.slice('/resources'.length);
            }

            const filePath = path.join(RESOURCES_DIR, urlPath);

            // Log request for debugging
            if (process.env.DEBUG_STATIC_SERVER) {
                console.log(`[StaticServer] ${req.method} ${req.url} -> ${filePath}`);
            }

            // Security: ensure we're still within RESOURCES_DIR
            if (!filePath.startsWith(RESOURCES_DIR)) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            fs.stat(filePath, (err, stats) => {
                if (err || !stats.isFile()) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }

                const ext = path.extname(filePath).toLowerCase();
                const contentType = MIME_TYPES[ext] || 'application/octet-stream';

                res.writeHead(200, { 'Content-Type': contentType });
                fs.createReadStream(filePath).pipe(res);
            });
        });

        server.on('error', reject);

        server.listen(RESOURCES_PORT, () => {
            console.log(`Static resource server started on port ${RESOURCES_PORT}`);
            resolve(server);
        });
    });
}

/**
 * Stop the static file server
 * @returns {Promise<void>}
 */
function stopStaticServer() {
    return new Promise((resolve) => {
        if (server) {
            server.close(() => {
                console.log('Static resource server stopped');
                server = null;
                resolve();
            });
        }
        else {
            resolve();
        }
    });
}

module.exports = {
    startStaticServer,
    stopStaticServer,
    RESOURCES_PORT
};
