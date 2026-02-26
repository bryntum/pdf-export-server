const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const mkdirp = require('mkdirp');
const WebServer = require('../src/server/WebServer.js');
const appConfig = require('../app.config.js').config;

/**
 * Port allocator that uses JEST_WORKER_ID to assign non-conflicting port ranges.
 * Each Jest worker gets a range of 100 ports, ensuring parallel tests don't conflict.
 *
 * Worker 1: ports 8100-8199
 * Worker 2: ports 8200-8299
 * etc.
 */
class PortAllocator {
    constructor() {
        // JEST_WORKER_ID is 1-based, defaults to 1 if not running in Jest
        const workerId = parseInt(process.env.JEST_WORKER_ID, 10) || 1;
        this.basePort = 8000 + (workerId * 100);
        this.currentOffset = 0;
    }

    /**
     * Get the next available port for this worker
     * @returns {number}
     */
    getPort() {
        const port = this.basePort + this.currentOffset;
        this.currentOffset++;
        return port;
    }

    /**
     * Reset the port counter (useful for test cleanup)
     */
    reset() {
        this.currentOffset = 0;
    }
}

// Singleton instance for the current Jest worker
const portAllocator = new PortAllocator();

/**
 * Get a unique port for this test worker
 * @returns {number}
 */
function getPort() {
    return portAllocator.getPort();
}

/**
 * Reset port allocator (call in beforeAll/afterAll if needed)
 */
function resetPorts() {
    portAllocator.reset();
}


// screenshot made on windows, differs a bit more from one on linux
// if threshold is not enough, feel free to increase according to the compare output
const FUZZ_THRESHOLD = os.platform() === 'win32' ? 1900 : 5280;

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

    config = Object.assign({
        logger           : appConfig.logger,
        [protocol]       : port,
        'max-workers'    : workers,
        findNextHttpPort : true,
        // Host resources locally to maintain stability
        resources        : path.join('__tests__', 'samples', 'resources'),
        chromiumArgs     : [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    }, config);

    const server = new WebServer(config);

    await server.start();

    console.log = log;

    return server;
}

async function stopServer(server) {
    // Stop the queue and close all browser instances first
    if (server.taskQueue) {
        server.taskQueue.stop();
    }

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
    const tmpDir = path.join(process.cwd(), 'tmp');

    mkdirp.sync(tmpDir);

    const date = new Date().toISOString().replace(/[T:]/g, '_').split('.')[0];

    return path.join(tmpDir, `${date}.${fileFormat}`);
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
    return fs.existsSync(path.join(process.cwd(), 'cert', 'server.key'));
}

function getLoggerConfig(filename) {
    return { file : { level : 'verbose', filename : `log/tests/${filename}.txt` } };
}

module.exports = {
    getPort,
    resetPorts,
    startServer,
    stopServer,
    getTmpFilePath,
    assertImage,
    getLoggerConfig,
    certExists : checkServerKey()
};
