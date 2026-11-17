const commandLineArgs = require('command-line-args');
const getUsage = require('command-line-usage');

module.exports = class Commands {

    constructor() {
        this.optionDefinitions = [
            { name: 'http', alias: 'h', type: Number, description: 'Start http server on port' },
            { name: 'https', alias: 'H', type: Number, description: 'Start https server on port' },
            { name: 'websocket', alias: 'w', type: Boolean, description: 'Start websocket server' },
            { name: 'cors', alias: 'c', type: String, description: 'CORS origin, default value "*". Set to "false" to disable CORS' },
            { name: 'maximum', alias: 'm', type: String, description: 'Maximum upload size (default 50mb)' },
            { name: 'resources', alias: 'r', type: String, description: 'The absolute path to the resource directory. This path will be accessible via the webserver' },
            { name: 'max-workers', type: Number, defaultValue: 5, description: 'Maximum amount of workers (puppeteer instances)' },
            { name: 'level', type: String, description: 'Specify log level (error, warn, verbose). Default "error"' },
            { name: 'timeout', type: Number, description: 'Request timeout time in seconds' },
            { name: 'quick', type: Boolean, description: 'Provide to only wait for page load event' },
            { name: 'no-sandbox', type: Boolean, description: 'Provide to pass no-sandbox argument to chromium' },
            { name: 'disable-web-security', type: Boolean, description: 'Provide to pass disable-web-security argument to chromium' },
            { name: 'no-config', type: Boolean, description: 'Provide to ignore app.config.js' },
            { name: 'verbose', type: Boolean, description: 'Alias for --level=verbose' },
            { name: 'help', type: Boolean, description: 'Show help message' }
        ];
    }

    showHelp() {
        const sections = [
            {
                header: 'Usage',
                content: './server [OPTION]'
            },
            {
                header: 'Options',
                optionList: this.optionDefinitions
            }
        ];
        console.log(getUsage(sections));
    }

    getOptions() {
        return commandLineArgs(this.optionDefinitions);
    }
};