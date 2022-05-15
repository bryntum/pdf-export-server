const puppeteer = require('puppeteer');
const path = require('path');
const Commands = require('./commands.js');
const WebServer = require('./server/WebServer.js');
let { config } = require('../app.config.js');

//Do a check if this is a Pkg executable or is executed from nodejs commandline
const isPkg = typeof process.pkg !== 'undefined';

//Local copies of chromium is delivered next to the executable, we need to correct path to the local copy instead of reference to node_modules

const chromiumExecutablePath = (isPkg
    ? puppeteer.executablePath().replace(
        /^.*?[/\\]node_modules[/\\]puppeteer[/\\]\.local-chromium/,
        path.join(path.dirname(process.execPath), 'chromium')
    )
    : puppeteer.executablePath()
);

//Read commandline options
const commands = new Commands();
const options = commands.getOptions().options;

if (options.verbose) {
    options.level = 'verbose';
}

config = Object.assign(options['no-config'] ? {} : config, options);

if (config.http === config.https) {
    config.http = false;
}

if (config.timeout) {
    // convert seconds to milliseconds
    config.timeout *= 1000;
}

if (config.level && config.logger) {
    config.logger.level = config.level;
}

let chromiumArgs = [];

if (config['no-sandbox']) {
    chromiumArgs.push('--no-sandbox');
}

if (config['disable-web-security']) {
    chromiumArgs.push('--disable-web-security');
}

config.chromiumArgs = chromiumArgs;
config.chromiumExecutablePath = chromiumExecutablePath;

if (config.help) {
    commands.showHelp();
    process.exit();
}
else if (config.http || config.https) {
    const webServer = new WebServer(config);

    webServer.start();
}
else {
    commands.showHelp();
    process.exit();
}
