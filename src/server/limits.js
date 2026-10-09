function checkLimits({ pages, pending, maxPages, maxQueue }) {
    if (maxPages && pages > maxPages) {
        return {
            status : 413,
            body   : { success : false, code : 'TOO_MANY_PAGES', msg : `Export has ${pages} pages, the limit is ${maxPages}` }
        };
    }
    if (maxQueue && pending >= maxQueue) {
        return {
            status  : 503,
            headers : { 'Retry-After' : '10' },
            body    : { success : false, code : 'QUEUE_FULL', msg : `${pending} exports are already pending, retry later` }
        };
    }
    return null;
}

module.exports = { checkLimits };
