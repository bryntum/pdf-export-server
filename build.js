const { exec } = require('pkg');
const Downloader = require('./downloader.js');
const path = require('path');
const copy = require('recursive-copy');
const rimraf = require('rimraf');
const mkdirp = require('mkdirp');
const moveFile = require('move-file');
const fs = require('fs');

const downloadPath = path.join(__dirname, './build/server/chromium');
const buildPath = path.join(__dirname, './build/server');
const binDir = path.join(__dirname, './bin');

async function build() {

    console.log('Start build');

    let downloader = new Downloader(downloadPath);
    let revision = Downloader.defaultRevision();
    let platforms = downloader.supportedPlatforms();

    await mkDir(downloadPath);

    for (let i = 0; i < platforms.length; i++) {
        let canDownload = await downloader.canDownloadRevision(platforms[i], revision);
        if (canDownload) {
            let targetBinDir = path.join(binDir,  platforms[i].includes('win') ? 'win' : platforms[i]);

            console.log('Download puppeteer for ' + platforms[i]);
            await downloader.downloadRevision(platforms[i], revision);
            console.log('Download puppeteer for ' + platforms[i] + ' completed');
            await mkDir(path.join(targetBinDir, '/chromium'));

            let chromiumTarget = path.join(targetBinDir, 'chromium', platforms[i] + '-' + revision);
            await rmDir(chromiumTarget);

            console.log('Move puppeteer executable to os target');
            await moveFile(path.join(downloadPath, platforms[i] + '-' + revision), chromiumTarget);

            await rmDir(path.join(targetBinDir, 'cert'));

            console.log('Copy https certificates to os target destination');
            await copy(path.join(__dirname, 'src', 'cert'), path.join(targetBinDir, 'cert'))
                .catch(function(error) {
                    console.error('Copy failed: ' + error);
                });
        }
    }

    console.log('Clean up download path');
    await rmDir(downloadPath);

    await createExecutables();

    await new Promise((resolve, reject) => {
        fs.readdir(buildPath, function(err, files) {
            if (err) {
                reject(err);
            }
            else {
                resolve(files);
            }
        });
    }).then(files => {
        return Promise.all(files.map(file => {

            let target = '';
            if (file.includes('linux')) {
                target = 'linux';
            }

            if (file.includes('macos')) {
                target = 'mac';
            }

            if (file.includes('win')) {
                target = 'win';
            }

            if (target) {
                console.log('Move server executable to os target destination (' + target + ')');
                return moveFile(path.join(buildPath, file), path.join(binDir, target + '/server' + (target === 'win' ? '.exe' : '')));
            }
        }));
    });

    await rmDir(path.join(buildPath, '..'));
}

async function createExecutables() {
    console.log('Create server executables');
    await exec(['./src/server.js', '--out-path', buildPath]);
}

function mkDir(dir) {
    return new Promise((resolve, reject) => {
        mkdirp(dir, function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
}

function rmDir(dir) {
    return new Promise((resolve, reject) => {
        rimraf(dir, resolve);
    });
}

build().then(() => console.log('Build finished successfully!'));
