const { buildChromiumArgs } = require('../../src/config/chromium.js');

describe('buildChromiumArgs', () => {
    test('always passes the container-safe flags', () => {
        expect(buildChromiumArgs({})).toEqual(['--disable-dev-shm-usage', '--font-render-hinting=none']);
    });

    test('adds the optional flags from config', () => {
        expect(buildChromiumArgs({ 'no-sandbox' : true, 'disable-web-security' : true })).toEqual([
            '--disable-dev-shm-usage', '--font-render-hinting=none', '--no-sandbox', '--disable-web-security'
        ]);
    });
});
