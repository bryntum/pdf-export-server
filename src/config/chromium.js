// --disable-dev-shm-usage: containers mount a 64 MB /dev/shm by default and Chromium
// crashes on large pages without it. --font-render-hinting=none: identical text
// metrics on every host, so the pagination the client computed stays valid.
function buildChromiumArgs(config) {
    const args = ['--disable-dev-shm-usage', '--font-render-hinting=none'];
    if (config['no-sandbox']) {
        args.push('--no-sandbox');
    }
    if (config['disable-web-security']) {
        args.push('--disable-web-security');
    }
    return args;
}

module.exports = { buildChromiumArgs };
