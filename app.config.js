const path = require('path');

const logPath = process.pkg
    ? path.join(process.execPath, '..', 'log')
    : path.join(__dirname, 'log');

const config = {
    // HTTP server port
    "http"          : 8080,

    // HTTPS server port
    "https"         : null,

    "websocket"     : true,

    // CORS headers are always set, this config defined value for Access-Control-Allow-Origin header
    "cors"          : "*",

    // Maximum size of the uploaded data (aligned with nginx client_max_body_size)
    "maximum"       : "100mb",

    // Path to static resources to be served. See readme.md for details
    "resources"     : null,

    // True to pass `--no-sandbox` flag to the chromium
    "no-sandbox"    : true,

    // True to disable web security (CORS, CSP, etc)
    "disable-web-security" : false,

    // Maximum amount of parallel puppeteer instances to run (2 per vCPU is the rule of thumb)
    "max-workers"   : 4,

    // Log level. Possible values: error, warn, info, verbose
    "level"         : "info",

    // Pass true to wait for page load only (fonts may be missing). Reduces page loading time by at least .5s
    "quick"          : false,

    // Request timeout time in seconds (page.setContent and page.pdf use it too)
    "timeout"       : 120,

    // Requests with more html fragments (pages) than this are refused with 413
    "max-pages"     : 500,

    // Requests queued while this many are already pending are refused with 503
    "max-queue"     : 20,

    // "json" switches the console transport to one JSON object per line
    "log-format"    : null,

    // Configuration options for logger
    // Set `false` to output log to the console
    "logger"        : {
        "rotate"    : {
            "dirname"     : logPath,
            "filename"    : "export-server-%DATE%.log",
            "datePattern" : "YYYY-MM-DD",
            "maxSize"     : "20mb",
            "maxFiles"    : "30d"
        }
    }
};

module.exports = { config };
