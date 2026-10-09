const { createExportServer, stopExportServer, loadTestHTML } = require('../utils.js');
const path = require('path');

jest.setTimeout(60 * 1000);

const html = loadTestHTML(path.join(__dirname, '../samples/smoke/base.html'));

test('page.setContent honours the configured timeout', async () => {
    const server = createExportServer({ workers : 1, timeout : 1 }); // 1 ms: setContent must time out

    await expect(server.exportRequestHandler({
        html        : [{ html }],
        format      : 'A4',
        fileFormat  : 'pdf',
        orientation : 'portrait',
        range       : 'complete'
    }, 'timeout-request')).rejects.toThrow(/timeout|Timed out|exceeded/i);

    stopExportServer(server);
});
