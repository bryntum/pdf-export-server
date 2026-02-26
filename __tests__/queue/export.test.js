const fs = require('fs');
const path = require('path');
const { createExportServer, stopExportServer, streamToBuffer, getLoggerConfig, getTmpFilePath, loadTestHTML, RESOURCES_PORT } = require('../utils.js');

jest.setTimeout(60 * 1000);

const samplesDir = path.join(__dirname, '../samples/smoke');
const testPageHTML = loadTestHTML(path.join(samplesDir, 'base.html'));
const baselinePDF = path.join(samplesDir, 'base_https.pdf');
const baselinePNG = path.join(samplesDir, 'base_https.png');

// URL to navigate before setting content - establishes same-origin context for loading resources
const clientURL = `http://localhost:${RESOURCES_PORT}/resources/build/grid.css`;

// Allow 5% size difference from baseline
const SIZE_THRESHOLD = 0.05;

/**
 * Assert that buffer size is within threshold of baseline file.
 * If not, save the output to tmp directory for inspection.
 */
function assertSizeMatchesBaseline(buffer, baselinePath, fileFormat) {
    const baseSize = fs.statSync(baselinePath).size;
    const sizeDelta = Math.abs(baseSize - buffer.length);
    const threshold = baseSize * SIZE_THRESHOLD;

    if (sizeDelta > threshold) {
        const tmpFilePath = getTmpFilePath(fileFormat);
        fs.writeFileSync(tmpFilePath, buffer);
        throw new Error(
            `${fileFormat.toUpperCase()} size differs from baseline.\n` +
            `Expected: ~${baseSize} bytes, Got: ${buffer.length} bytes\n` +
            `Delta: ${sizeDelta} (threshold: ${Math.round(threshold)})\n` +
            `Exported file saved to: ${tmpFilePath}`
        );
    }

    expect(sizeDelta).toBeLessThanOrEqual(threshold);
}

let exportServer;

afterEach(() => {
    if (exportServer) {
        stopExportServer(exportServer);
        exportServer = null;
    }
});

describe('Queue Export - PDF', () => {
    test('Should export single page to PDF matching baseline', async () => {
        exportServer = createExportServer({
            workers : 1,
            logger  : getLoggerConfig('queue_export_pdf')
        });

        const requestData = {
            html        : [{ html : testPageHTML }],
            orientation : 'portrait',
            format      : '1120*2389',
            fileFormat  : 'pdf',
            clientURL
        };

        const result = await exportServer.exportRequestHandler(requestData, 'test-pdf-1');
        const buffer = await streamToBuffer(result);

        // Verify we got a valid PDF
        expect(buffer.slice(0, 4).toString('utf8')).toBe('%PDF');

        // Compare with baseline
        assertSizeMatchesBaseline(buffer, baselinePDF, 'pdf');
    });

    test('Should export multiple pages to PDF', async () => {
        exportServer = createExportServer({
            workers : 2,
            logger  : getLoggerConfig('queue_export_pdf_multi')
        });

        const requestData = {
            html        : [
                { html : testPageHTML },
                { html : testPageHTML },
                { html : testPageHTML }
            ],
            orientation : 'portrait',
            format      : 'A4',
            fileFormat  : 'pdf',
            clientURL
        };

        const result = await exportServer.exportRequestHandler(requestData, 'test-pdf-multi');
        const buffer = await streamToBuffer(result);

        // Verify we got a valid PDF
        expect(buffer.slice(0, 4).toString('utf8')).toBe('%PDF');

        // Multi-page PDF should be larger than single-page baseline
        const baseSize = fs.statSync(baselinePDF).size;
        expect(buffer.length).toBeGreaterThan(baseSize);
    });
});

describe('Queue Export - PNG', () => {
    test('Should export single page to PNG matching baseline', async () => {
        exportServer = createExportServer({
            workers : 1,
            logger  : getLoggerConfig('queue_export_png')
        });

        const requestData = {
            html        : [{ html : testPageHTML }],
            orientation : 'portrait',
            format      : '1120*2389',
            fileFormat  : 'png',
            clientURL
        };

        const result = await exportServer.exportRequestHandler(requestData, 'test-png-1');
        const buffer = await streamToBuffer(result);

        // Verify we got a valid PNG (magic bytes: 89 50 4E 47)
        expect(buffer[0]).toBe(0x89);
        expect(buffer.slice(1, 4).toString('utf8')).toBe('PNG');

        // Compare with baseline
        assertSizeMatchesBaseline(buffer, baselinePNG, 'png');
    });

    test('Should export multiple pages to PNG (combined vertically)', async () => {
        exportServer = createExportServer({
            workers : 2,
            logger  : getLoggerConfig('queue_export_png_multi')
        });

        const requestData = {
            html        : [
                { html : testPageHTML },
                { html : testPageHTML }
            ],
            orientation : 'portrait',
            format      : 'A4',
            fileFormat  : 'png',
            clientURL
        };

        const result = await exportServer.exportRequestHandler(requestData, 'test-png-multi');
        const buffer = await streamToBuffer(result);

        // Verify we got a valid PNG
        expect(buffer[0]).toBe(0x89);
        expect(buffer.slice(1, 4).toString('utf8')).toBe('PNG');

        // Multi-page PNG should be larger than single-page baseline
        const baseSize = fs.statSync(baselinePNG).size;
        expect(buffer.length).toBeGreaterThan(baseSize);
    });
});

describe('Queue Export - Error Handling', () => {
    test('Should throw error when html is missing', async () => {
        exportServer = createExportServer({
            workers : 1,
            logger  : getLoggerConfig('queue_export_error')
        });

        const requestData = {
            orientation : 'portrait',
            format      : 'A4',
            fileFormat  : 'pdf'
        };

        await expect(
            exportServer.exportRequestHandler(requestData, 'test-error-1')
        ).rejects.toThrow('No html fragments found');
    });
});
