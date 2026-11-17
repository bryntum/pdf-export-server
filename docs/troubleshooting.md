# Troubleshooting

### Check logs

It is difficult to see what's going on in the export server - it is remote, it uses headless
browser. Before diving into debugging actual server we may try using extensive logging:

```shell
$ node src/server.js --verbose
```

This config will log page errors and if there were problems loading resources you can see similar message
in the log file:

```
2022-05-13T14:58:47.745Z error: [Worker@3qj8yt1k45egung7cd13n] Page 3/50 reports: Access to font at 
'http://localhost/grid/resources/fonts/Lato-Regular.woff2' from origin 'null' has been blocked by CORS policy: No 
'Access-Control-Allow-Origin' header is present on the requested resource.
location: about:blank
```

### Inspect outgoing request

Sometimes paths to resources might be generated incorrectly. If your PDF does not look correct, this is recommended
first step to take.

1. Open network tab
2. Run export
3. Find outgoing request
4. Open `Payload` tab
5. Expand object, copy HTML string
6. Create file on a local filesystem, paste HTML string
7. Save file with `.html` extension
8. Open this file in a browser, preferably via a web server (there are a number of simple web server for static files,
e.g. [serve](https://www.npmjs.com/package/serve) package on the NPM)

The page you will be looking at in a browser is similar to what a headless browser on the server will. You can see which
resource were not loaded and why, inspect paths etc. It can take several iterations to configure your JS app to generate
correct HTML at that point export server should handle it too.