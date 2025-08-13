#!/usr/bin/env node
const { exec } = require('@yao-pkg/pkg');
const path = require('path');
const fs = require('fs');
const { mkdirSync } = require('fs');
const rimraf = require('rimraf');
const copy = require('recursive-copy');
const puppeteerBrowsers = require('@puppeteer/browsers');
const { PUPPETEER_REVISIONS } = require('puppeteer-core/lib/cjs/puppeteer/revisions.js');

// Parse command line arguments
const args = process.argv.slice(2);
const targetPlatformArg = args.find(arg => arg.startsWith('--platform='));
const targetPlatform = targetPlatformArg
    ? targetPlatformArg.split('=')[1]
    : process.platform; // Default to current platform if not specified

const outputDir = path.join(__dirname, 'dist');

// Clean up and prepare directories
async function prepareDirectories() {
  console.log('Cleaning build directories...');
  
  if (fs.existsSync(outputDir)) {
    rimraf.sync(outputDir);
  }

  mkdirSync(path.join(outputDir, 'log'), { recursive: true });
}

// Download Chromium for Puppeteer
async function downloadChrome() {
  console.log('Downloading Chrome for Puppeteer...');
  
  const revision = PUPPETEER_REVISIONS.chrome;

  // Use the target platform for Puppeteer browser detection or fallback to detected platform
  let platform;

  if (targetPlatform === 'win32' || targetPlatform === 'windows') {
    platform = 'win64';
  }
  else if (targetPlatform === 'darwin' || targetPlatform === 'macos') {
    platform = 'mac';
  }
  else if (targetPlatform === 'linux') {
    platform = 'linux';
  }
  else {
    // Default to auto-detection if platform not recognized
    platform = puppeteerBrowsers.detectBrowserPlatform();
  }


  console.log(`Downloading Chromium revision ${revision} for ${platform}...`);
  
  const installedBrowser = await puppeteerBrowsers.install({
    unpack: true,
    browser: puppeteerBrowsers.Browser.CHROME,
    platform: platform,
    buildId: revision,
    cacheDir: outputDir
  });
  
  console.log(`Chrome downloaded to: ${installedBrowser.executablePath}`);
  
  const path = installedBrowser.executablePath.replace(outputDir, '.');

  return path.replace(/\\/g, '\\\\');
}

// Copy certificates if they exist
async function copyCertificates() {
  const certDir = path.join(__dirname, 'src', 'cert');
  const targetCertDir = path.join(outputDir, 'cert');
  
  if (fs.existsSync(certDir)) {
    console.log('Copying HTTPS certificates...');
    mkdirSync(targetCertDir, { recursive: true });
    
    await copy(certDir, targetCertDir)
      .catch(error => {
        console.error('Certificate copy failed:', error);
      });
  } else {
    console.log('No certificates found, skipping...');
  }
}

// Build executable with pkg
async function buildExecutable(entryFilePath) {
  console.log('Building executable...');
  
  // Get platform-specific output name
  const platform = process.platform;

  // Get platform-specific output name based on target platform
  let outputName;
  let pkgPlatform;

  switch (targetPlatform) {
    case 'win32':
    case 'windows':
      outputName = 'pdf-export-server-win.exe';
      pkgPlatform = 'win';
      break;
    case 'darwin':
    case 'macos':
      outputName = 'pdf-export-server-macos';
      pkgPlatform = 'macos';
      break;
    case 'linux':
      outputName = 'pdf-export-server-linux';
      pkgPlatform = 'linux';
      break;
    default:
      console.log(`Unrecognized platform: ${targetPlatform}, defaulting to current platform`);
      return buildExecutable(entryFilePath); // Fall back to current platform
  }

  const outputPath = path.join(outputDir, outputName);
  const nodeVersion = process.versions.node.split('.')[0];

  // Build with pkg using the specified platform
  const targets = `node${nodeVersion}-${pkgPlatform}`;

  console.log(`Building for target: ${targets}`);
  
  await exec([
    entryFilePath,
    '--targets', targets,
    '--output', outputPath,
    '--compress', 'GZip',
    '--config', 'package.json'
  ]);
  
  console.log(`Executable created at: ${outputPath}`);
  return outputPath;
}

// put path to local chrome to server.js
async function patchEntryFile(chromeExecutablePath) {
  const entryFile = path.join(__dirname, 'src', 'server.js');
  const entryDestination = path.join(__dirname, 'src', 'server-entry.js');

  if (fs.existsSync(entryFile)) {
    console.log('Copying ./src/server.js to dist directory...');
    const entrySource = fs.readFileSync(entryFile, 'utf-8');

    // Replace chromeExecutablePath in the server.js content
    const patchedSource = entrySource.replace(/CHROME_EXECUTABLE_PATH_PLACEHOLDER/g, chromeExecutablePath);

    fs.writeFileSync(entryDestination, patchedSource, 'utf-8');
    console.log('server.js copied and chromeExecutablePath replaced successfully.');
  }
  else {
    console.error('Error: ./src/server.js does not exist.');
  }

  return entryDestination;
}

async function clearEntryFile(entryDestination) {
  try {
    if (fs.existsSync(entryDestination)) {
      console.log('Removing entry destination...');
      fs.unlinkSync(entryDestination);
      console.log('Entry destination removed successfully.');
    }
    else {
      console.log('No entry destination to remove.');
    }
  }
  catch (error) {
    console.error('Failed to remove entry destination:', error);
  }
}

// Main build function
async function build() {
  try {
    console.log('Starting build process...');
    
    await prepareDirectories();
    const chromeExecutablePath = await downloadChrome();
    await copyCertificates();
    const entryFilePath = await patchEntryFile(chromeExecutablePath);
    const executablePath = await buildExecutable(entryFilePath);
    await clearEntryFile(entryFilePath);

    console.log(`\nBuild completed successfully!`);
    console.log(`Executable: ${executablePath}`);
  }
  catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run the build
build();