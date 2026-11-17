## PDF Export server protocol

### Root URL - "/"

Request to export server should have `Content-Type: application/json` header and stringified JSON in the body.
Request JSON payload is expected to have the following structure:
```
{
    // Paper format as supported by Puppeteer. Alternatively it can be a string of a format "width*height"
    // in inches, e.g. "10in*7in".
    format: "A4",
    
    // File format, "pdf" and "png" are supported               
    fileFormat: "pdf",
    
    // Array of HTML strings - markup for pages to export. They will be assembled to a sngle PDF (or PNG) file
    html: ['<html>...</html>'],
    
    // Page orientation, "portrait" or "landscape"
    orientation: "portrait",
    
    // Url to navigate before loading HTML. Required for secured pages. Leave empty if you use local resources
    // or your server doesn't use CSP/CORS policies
    clientURL: "",
    
    // If false server will return JSON response with a link to a file which will be available for a short
    // period of time to be downloaded.
    // If true server will return response with `Content-Type: application/octet-stream` and actual PDF/PNG
    // attached.
    sendAsBinary: true
}
```

### File URL - "/file/%file-hash%"

If `sendAsBinary` is false client will receive the following JSON response:

```
{
    success: true,
    url: "http://export-server-url/file/file-hash"
}
```

Using this url you can download file from the server. Keep in mind file is removed in about 10 seconds.
