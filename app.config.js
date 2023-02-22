const config = {
    // HTTP server port
    "http"          : 8080,

    // HTTPS server port
    "https"         : null,

    // CORS headers are always set, this config defined value for Access-Control-Allow-Origin header
    "cors"          : "*",

    // Maximum size of the uploaded data
    "maximum"       : '5000mb',

    // Path to static resources to be served. See readme.md for details
    "resources"     : "./src/resources",

    // True to pass `--no-sandbox` flag to the chromium
    "no-sandbox"    : true,

    // True to pass `--disable-web-security` flag to the chromium
    "disable-web-security": true,

    // Maximum amount of parallel puppeteer instances to run
    "max-workers"   : 5,

    // Log level. Possible values: error, warn, info, verbose
    "level"         : "verbose",

    // Pass true to wait for page load only (fonts may be missing). Reduces page loading time by at least .5s
    "quick"          : false,

    // Request timeout time in seconds
    "timeout"       : 300,

    // Configuration options for logger
    // Set to false to output log to the console
    "logger"        : false,

    // Upload file to GCP instead of temporary buffer
    "gcp"           : true,
};

module.exports = { config };
