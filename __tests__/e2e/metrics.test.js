const { startServer, stopServer, getLoggerConfig, getPort } = require('../utils.js');
const { assertExportedFile } = require('../assertions.js');

jest.setTimeout(60 * 1000);

test('/metrics reports one successful export', async () => {
    const server = await startServer({ protocol : 'http', port : getPort(), workers : 1, logger : getLoggerConfig('e2e_metrics') });
    await assertExportedFile({ fileFormat : 'pdf', host : 'localhost', protocol : 'http', port : server.httpPort });
    const text = await (await fetch(`http://localhost:${server.httpPort}/metrics`)).text();
    expect(text).toMatch(/pdf_export_requests_total\{result="success"\} 1/);
    expect(text).toMatch(/pdf_export_duration_seconds_count 1/);
    await stopServer(server);
});
