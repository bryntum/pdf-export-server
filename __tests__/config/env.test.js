const { applyEnv } = require('../../src/config/env.js');

describe('applyEnv', () => {
    test('overrides numeric options from PDF_EXPORT_* variables', () => {
        const config = applyEnv({ 'max-workers' : 5, timeout : 300, 'max-pages' : 500, 'max-queue' : 20 }, {
            PDF_EXPORT_MAX_WORKERS : '4',
            PDF_EXPORT_TIMEOUT     : '120',
            PDF_EXPORT_MAX_PAGES   : '300',
            PDF_EXPORT_MAX_QUEUE   : '10'
        });
        expect(config).toMatchObject({ 'max-workers' : 4, timeout : 120, 'max-pages' : 300, 'max-queue' : 10 });
    });

    test('keeps defaults when a variable is missing, empty, zero or not a number', () => {
        const config = applyEnv({ 'max-workers' : 5, timeout : 120, 'max-pages' : 500, 'max-queue' : 20 }, {
            PDF_EXPORT_MAX_WORKERS : '',
            PDF_EXPORT_TIMEOUT     : '0',
            PDF_EXPORT_MAX_PAGES   : 'lots'
        });
        expect(config).toMatchObject({ 'max-workers' : 5, timeout : 120, 'max-pages' : 500, 'max-queue' : 20 });
    });

    test('copies string options verbatim', () => {
        const config = applyEnv({}, { PDF_EXPORT_MAXIMUM : '100mb', PDF_EXPORT_CORS : 'https://app.offolio.com', PDF_EXPORT_LOG_FORMAT : 'json' });
        expect(config).toMatchObject({ maximum : '100mb', cors : 'https://app.offolio.com', 'log-format' : 'json' });
    });
});
