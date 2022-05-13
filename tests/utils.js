const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebServer = require('../src/server/WebServer.js');
const appConfig = require('../app.config.js').config;

// screenshot made on windows, differs a bit more from one on linux
// if threshold is not enough, feel free to increase according to the compare output
const FUZZ_THRESHOLD = os.platform() === 'win32' ? 1900 : 5280;

let START_PORT = 8081;

function getPort() {
    return START_PORT++;
}

function ok(message) {
    console.log(`\u001b[32mOK\u001b[0m: ${message}`);
}

const status = {
    failedAssertions : 0
};

function fail(message) {
    ++status.failedAssertions;

    console.error(`\u001b[31mFAIL\u001b[0m:${message}`);
}

function is(got, expected, desc) {
    if (got != expected) {
        fail(desc);
        fail(`Got: ${got}`);
        fail(`Expected: ${expected}`);
    }
    else {
        ok(desc);
    }
}

function isWSL() {
    try {
        return /microsoft/i.test(fs.readFileSync('/proc/version'));
    }
    catch (e) {
        return false;
    }
}

appConfig.logger.level = 'verbose';

async function startServer(config = {}) {
    const { protocol, port, workers = 1 } = config;

    const log = console.log;

    console.log = () => {};

    const server = new WebServer(Object.assign({
        logger        : appConfig.logger,
        [protocol]    : port,
        'max-workers' : workers,
        chromiumArgs  : isWSL() ? ['--no-sandbox'] : []
    }, config));

    await server.start();

    console.log = log;

    return server;
}

async function stopServer(server) {
    await new Promise(resolve => {
        if (server.httpServer) {
            server.httpServer.close(resolve);
        }
        else if (server.httpsServer) {
            server.httpsServer.close(resolve);
        }
    });
}

function getTmpFilePath(fileFormat) {
    function pad(value) {
        return String(value).padStart(2, '0');
    }

    const now = new Date();

    // cannot use \ / : * " < > | on windows
    const formattedDate = [
        now.getFullYear(),
        '-',
        pad(now.getMonth() + 1),
        '-',
        pad(now.getDate()),
        '__',
        pad(now.getHours()),
        '-',
        pad(now.getMinutes()),
        '-',
        pad(now.getSeconds())
    ].join('');

    const fileName = `${formattedDate}.${fileFormat}`;

    return path.join(__dirname, '..', 'tmp', fileName);
}

async function assertImage(pathToBase, buffer) {
    let result;

    if (!fs.existsSync(pathToBase)) {
        console.log(`Base image doesn't exist: ${pathToBase}`);
        result = false;
    }
    else {
        // working with files easier than trying to pass png to process stdin
        const tmpFileName = getTmpFilePath('png');
        fs.writeFileSync(tmpFileName, buffer);

        let platform;

        switch (os.platform()) {
            case 'win32':
                platform = 'windows';
                break;
            case 'darwin':
                platform = 'macos';
                break;
            default:
                platform = 'linux64';
                break;
        }

        result = await new Promise(resolve => {
            const compare = spawn(
                path.join(__dirname, 'binary', 'imagemagick', platform, 'compare'),
                ['-metric', 'fuzz', pathToBase, tmpFileName, 'NULL:']
            );

            let stderr = '', result;

            compare.stderr.on('data', data => {
                stderr += data.toString();
            });

            compare.on('exit', () => {
                if (compare.exitCode === 0) {
                    console.log(`\u001b[32mOK\u001b[0m: Exported PNG is identical to base`);
                    result = true;
                }
                else if (compare.exitCode === 1) {
                    const metric = parseInt(stderr);

                    if (metric > FUZZ_THRESHOLD) {
                        fail(`PNG differs from base.\nSee exported file here: ${tmpFileName}\nBase: ${pathToBase}\nMetric: ${metric}`);
                        result = false;
                    }
                    // if result is less than threshold - test is passed
                    else {
                        ok(`Exported PNG looks similar to expected`);
                        result = true;
                    }
                }
                else {
                    fail('compare process quit with code 2');
                    console.log(stderr);
                    result = false;
                }

                if (result) {
                    fs.unlink(tmpFileName, () => {});
                }

                resolve(result);
            });
        });
    }

    return result;
}

function checkServerKey() {
    return fs.existsSync(path.join(__dirname, '..', 'cert', 'server.key'));
}

function getLoggerConfig(filename) {
    return { file : { level : 'verbose', filename : `log/tests/${filename}.txt` } };
}

module.exports = {
    isWSL,
    startServer,
    stopServer,
    getTmpFilePath,
    assertImage,
    ok,
    fail,
    status,
    is,
    getPort,
    getLoggerConfig,
    certExists : checkServerKey()
};
