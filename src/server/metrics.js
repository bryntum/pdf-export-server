const client = require('prom-client');

/**
 * Prometheus metrics. `pdf_export_queue_depth` counts pending export REQUESTS (the same figure the max-queue
 * refusal uses), so an alert on it fires exactly when the server starts answering 503.
 */
function createMetrics({ queue, pendingRequests }) {
    const registry = new client.Registry();

    const requests = new client.Counter({
        name       : 'pdf_export_requests_total',
        help       : 'Export requests by result',
        labelNames : ['result'],
        registers  : [registry]
    });
    const duration = new client.Histogram({
        name      : 'pdf_export_duration_seconds',
        help      : 'Export duration from request to response',
        buckets   : [1, 5, 10, 30, 60, 120],
        registers : [registry]
    });
    new client.Gauge({
        name      : 'pdf_export_queue_depth',
        help      : 'Pending export requests',
        registers : [registry],
        collect() { this.set(pendingRequests.size); }
    });
    new client.Gauge({
        name      : 'pdf_export_page_jobs',
        help      : 'Page jobs waiting in the render queue',
        registers : [registry],
        collect() { this.set(queue.jobs.length); }
    });
    new client.Gauge({
        name      : 'pdf_export_workers',
        help      : 'Chromium workers alive',
        registers : [registry],
        collect() { this.set(queue.workers.size); }
    });

    return {
        registry,
        contentType : registry.contentType,
        observe({ result, durationSeconds }) {
            requests.inc({ result });
            duration.observe(durationSeconds);
        }
    };
}

module.exports = { createMetrics };
