const config = {
    // HTTP server port
    "http"          : 8080,

    // HTTPS server port
    "https"         : null,

    // CORS headers are always set, this config defined value for Access-Control-Allow-Origin header
    "cors"          : "*",

    // Maximum size of the uploaded data
    "maximum"       : null,

    // Path to static resources to be served. See readme.md for details
    "resources"     : null,

    // True to pass `--no-sandbox` flag to the chromium
    "no-sandbox"    : true,

    // Maximum amount of parallel puppeteer instances to run
    "max-workers"   : 5,

    // Log level. Possible values: error, warn, info, verbose
    "level"         : "info",

    // Pass true to wait for page load only (fonts may be missing). Reduces page loading time by at least .5s
    "quick"          : false,

    // Request timeout time in seconds
    "timeout"       : 300,

    // Configuration options for logger
    // Set to false to output log to the console
    "logger"        : {
        "rotate"    : {
            "dirname"     : "log",
            "filename"    : "export-server-%DATE%.log",
            "datePattern" : "YYYY-MM-DD",
            "maxSize"     : "20mb",
            "maxFiles"    : "30d"
        }
    }
};

module.exports = { config };
