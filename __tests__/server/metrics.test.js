const { createMetrics } = require('../../src/server/metrics.js');

test('exposes the pdf_export metrics with zero values before any export', async () => {
    const queue = { jobs : [], workers : new Set() };
    const metrics = createMetrics({ queue, pendingRequests : new Set() });
    const text = await metrics.registry.metrics();
    expect(text).toMatch(/pdf_export_queue_depth 0/);
    expect(text).toMatch(/pdf_export_page_jobs 0/);
    expect(text).toMatch(/pdf_export_workers 0/);
    expect(text).toMatch(/# TYPE pdf_export_requests_total counter/);
    expect(text).toMatch(/# TYPE pdf_export_duration_seconds histogram/);
});

test('observe counts the result and records the duration', async () => {
    const metrics = createMetrics({
        queue           : { jobs : [1, 2, 3], workers : new Set([1]) },
        pendingRequests : new Set(['a', 'b'])
    });
    metrics.observe({ result : 'success', durationSeconds : 2.5 });
    metrics.observe({ result : 'failed', durationSeconds : 0.1 });
    const text = await metrics.registry.metrics();
    expect(text).toMatch(/pdf_export_requests_total\{result="success"\} 1/);
    expect(text).toMatch(/pdf_export_requests_total\{result="failed"\} 1/);
    expect(text).toMatch(/pdf_export_duration_seconds_count 2/);
    expect(text).toMatch(/pdf_export_queue_depth 2/);
    expect(text).toMatch(/pdf_export_page_jobs 3/);
    expect(text).toMatch(/pdf_export_workers 1/);
});

test('refused only increments the counter, not the duration histogram', async () => {
    const metrics = createMetrics({ queue : { jobs : [], workers : new Set() }, pendingRequests : new Set() });
    metrics.refused();
    const text = await metrics.registry.metrics();
    expect(text).toMatch(/pdf_export_requests_total\{result="refused"\} 1/);
    expect(text).toMatch(/pdf_export_duration_seconds_count 0/);
});
