Getopt = require('node-getopt');

module.exports = class Commands {

    constructor() {
        this.getopt = new Getopt([
            ['h',   'http=PORT'             , 'Start http server on port'],
            ['H',   'https=PORT'            , 'Start https server on port'],
            ['c',   'cors=HOST'             , 'CORS origin, default value "*". Set to "false" to disable CORS'],
            ['m',   'maximum=SIZE'          , 'Maximum upload size (default 50mb)'],
            ['r',   'resources=PATH'        , 'The absolute path to the resource directory. This path will be accessible via the webserver'],
            ['',    'max-workers=WORKERS'   , 'Maximum amount of workers (puppeteer instances)', 5],
            ['',    'level=LEVEL'           , 'Specify log level (error, warn, verbose). Default "error"'],
            ['',    'timeout=TIMEOUT'       , 'Request timeout time in seconds'],
            ['',    'quick'                 , 'Provide to only wait for page load event'],
            ['',    'no-sandbox'            , 'Provide to pass no-sandbox argument to chromium'],
            ['',    'no-config'             , 'Provide to ignore app.config.js'],
            ['',    'verbose'               , 'Alias for --level=verbose']
        ]);

        this.getopt.setHelp(
            'Usage: ./server [OPTION]\n' +
            '\n' +
            '[[OPTIONS]]\n'
        );
    }

    showHelp() {
        this.getopt.showHelp();
    }

    getOptions() {
        return this.getopt.parse(process.argv.slice(2));
    }
};
