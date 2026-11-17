# Under the hood

## Concept

General idea of the PDF Export Server is to receive page HTML markup from the client, put this HTML to a puppeteer
page running in headless mode and covert page to the PDF file.

Why not take a library to render PDF on the client, one might wonder? For a number of reasons:

1. There are libraries which allow building PDF from JS, but one has to actually build the pdf block by block
which is complicated. Also, not all styles are supported. Another option is to take library which already does
that by using canvas. But canvas has its limits therefore large pages cannot be exported reliably.
2. Browser already knows how to print HTML to PDF, we only need a way to do this automatically (and we have).
3. Less code on the client and page uses less resources which is crucial when exporting large pages.

For reasons above we picked puppeteer as a way to reliably export HTML to PDF.

## Problem

But having a server isn't a magic trick that solves all our problems. We have to pay for reliable API with more
complicated architecture. Thankfully not too complicated, what you need to do is:
1. Find a place for the server where it would be accessible to your application.
2. Allow server to load resources used by the exported page.

It often happens that you start your PDF export server on some remote host but when you try to export your Grid
you only see some text which doesn't even remotely resemble the Grid. What happened? Server couldn't load page
resources (styles, images, fonts) and did its best. So, how to fix it?

## Solution

Let's start with a simplest configuration possible - we're developing app on a local machine and run server
also locally.

### Local web server, local pdf export server

Assume our app is an HTML page loading single style:
```html
<html>
    <head>
        <link rel="stylesheet" href="app.css">
    </head>
    <body>
    </body>
</html>
```

and style loads custom font:
```css
@font-face {
    font-family: "MyFont";
    font-style: normal;
    font-weight: 900;
    font-display: block;
    src: url(fonts/myfont.woff2) format("woff2")
}
```

When we open this page in the browser we would see first CSS loaded from localhost and then CSS would load
the font:

```
browser                             web server (localhost)
   │ GET http://localhost/index.html         │
   │────────────────────────────────────────>│
   │                              index.html │
   │<────────────────────────────────────────│
   │ GET http://localhost/app.css            │
   │────────────────────────────────────────>│
   │                                 app.css │
   │<────────────────────────────────────────│
   │ GET http://localhost/fonts/myfont.woff2 │
   │────────────────────────────────────────>│
   │                      fonts/myfont.woff2 │
   │<────────────────────────────────────────│
```

When we try to export this page, export feature will replace link href with absolute path by default (see this
[config](https://bryntum.com/docs/gantt/api/Grid/feature/export/PdfExport#config-translateURLsToAbsolute)), so HTML
arriving to the export server will look like this:
```html
<html>
    <head>
        <link rel="stylesheet" href="http://localhost/app.css">
    </head>
    <body>
    </body>
</html>
```

```
browser   web server (localhost)            PDF export server (localhost:8081)                    puppeteer page
   │           │                                            │                                            │
   │ POST request with index.html                           │                                            │
   │───────────│───────────────────────────────────────────>│                                            │
   │           │                                            │ Server creates page and puts index.html    │
   │           │                                            │───────────────────────────────────────────>│
   │           │                                            │               GET http://localhost/app.css │
   │           │<───────────────────────────────────────────│────────────────────────────────────────────│
   │           │ app.css                                    │                                            │
   │           │ ───────────────────────────────────────────│───────────────────────────────────────────>│
   │           │                                            │    GET http://localhost/fonts/myfont.woff2 │
   │           │<───────────────────────────────────────────│────────────────────────────────────────────│
   │           │ fonts/myfont.woff2                         │                                            │
   │           │────────────────────────────────────────────│───────────────────────────────────────────>│
   │           │                                            │  (PDF passed from puppeteer to the server) │ 
   │           │                                            │<───────────────────────────────────────────│
   │ POST response with generated PDF as payload            │                                            │
   │<──────────│────────────────────────────────────────────│                                            │
```

### Local web server, remote PDF export server

Assume we still use same page:
```html
<html>
    <head>
        <link rel="stylesheet" href="app.css">
    </head>
    <body>
    </body>
</html>
```
and same config, which sends this HTML to the server:
```html
<html>
    <head>
        <link rel="stylesheet" href="http://localhost/app.css">
    </head>
    <body>
    </body>
</html>
```

But now our server runs different host:

```
─────────── localhost ───────────────┐    ┌──────────────────── example.com ──────────────────────────────────────────
                                     │    │
browser   web server (localhost)     │    │ PDF export server (example.com:8081)                    puppeteer page
   │           │                     │    │                   │                                            │
   │ POST request with index.html    │    │                   │                                            │
   │───────────│─────────────────────│─//─│──────────────────>│                                            │
   │           │                     │    │                   │ Server creates page and puts index.html    │
   │           │                     │    │                   │───────────────────────────────────────────>│
   │           │                     │    │                   │               GET http://localhost/app.css │
   │           │                     │    │            <──────│────────────────────────────────────────────│
   │           │                     │    │                   │  (PDF passed from puppeteer to the server) │ 
   │           │                     │    │                   │<───────────────────────────────────────────│
   │ POST response with generated PDF│ as │payload            │                                            │
   │<──────────│─────────────────────│─//─│───────────────────│                                            │
─────────────────────────────────────┘    └───────────────────────────────────────────────────────────────────────────
```

Server running on `example.com` created a puppeteer page and put there HTML to convert to PDF. Page referred to the
resource from `localhost` which is different from our localhost. Request fails and style is not loaded but page is
still exported to PDF. It just doesn't look like we expect.

#### To generate PDF successfully we need to make sure resources requested by the page are accessible to the page

There are two ways to do it:
1. Make resources available on the `example.com`.
2. Expose our development server to the network, so it is accessible from `example.com` (this is similar to running app
in production, and we will cover this topic below).

We will not cover first option here because it is not really related to the PDF export server configuration, but
second option is. PDF export server can host resources specifically to make them accessible to the puppeteer page.
To host them we need to start server with a special flag pointing to the directory where resources are stored:
```shell
~/server$ ls -l ~/app-resources
total 512
drwxr-xr-x 1 user user 512 May 15 00:00 ./
drwxr-xr-x 1 user user 512 May 15 00:00 ../
-rw-r--r-- 1 user user 512 May 15 00:00 app.css
drwxr-xr-x 1 user user 512 May 15 00:00 fonts/

~/server$ node src/server.js -r ~/app-resources
Access-Control-Allow-Origin: *
Http server started on port 8081
```
Now we need to replace origin in the HTML passed to the server. We can do that by setting
[translateURLsToAbsolute](https://bryntum.com/docs/gantt/api/Grid/feature/export/PdfExport#config-translateURLsToAbsolute)
to our server address:
```javascript
new Grid({
    features : {
        pdfExport : {
            exportServer : 'http://example.com:8081',
            translateURLsToAbsolute : 'http://example.com:8081/resources'
        }
    }
})
```

With this config HTML will have urls replaced:
```html
<html>
    <head>
        <link rel="stylesheet" href="http://example.com:8081/resources/app.css">
    </head>
    <body>
    </body>
</html>
```

Given page uses address available from `example.com`, style would be loaded correctly:

```
─────────── localhost ───────────────┐    ┌──────────────────── example.com ──────────────────────────────────────────
                                     │    │
browser   web server (localhost)     │    │ PDF export server (example.com:8081)                                puppeteer page
   │           │                     │    │                   │                                                          │
   │ POST request with index.html    │    │                   │                                                          │
   │───────────│─────────────────────│─//─│──────────────────>│                                                          │
   │           │                     │    │                   │ Server creates page and puts index.html                  │
   │           │                     │    │                   │─────────────────────────────────────────────────────────>│
   │           │                     │    │                   │            GET http://example.com:8081/resources/app.css │
   │           │                     │    │                   │<─────────────────────────────────────────────────────────│
   │           │                     │    │                   │  app.css                                                 │
   │           │                     │    │                   │─────────────────────────────────────────────────────────>│
   │           │                     │    │                   │ GET http://example.com:8081/resources/fonts/myfont.woff2 │
   │           │                     │    │                   │<─────────────────────────────────────────────────────────│
   │           │                     │    │                   │  myfont.woff2                                            │
   │           │                     │    │                   │─────────────────────────────────────────────────────────>│
   │           │                     │    │                   │                (PDF passed from puppeteer to the server) │ 
   │           │                     │    │                   │<─────────────────────────────────────────────────────────│
   │ POST response with generated PDF│ as │payload            │                                                          │
   │<──────────│─────────────────────│─//─│───────────────────│                                                          │
─────────────────────────────────────┘    └───────────────────────────────────────────────────────────────────────────
```

Now we only need to make sure resources available to the PDF export server are up-to-date.

### Remote web server, remote export server

Assume we have deployed our app to the `production.org` and don't want to host resources from the PDF export server too.
App is in accessible globally, there are active users and everything works like  charm. If users can see them, PDF
export server should see them too, right? Wrong. Because our production server is safe and secure, it uses CORS and CSP
headers which effectively block export server from using them. Let's dive into details.

Assume we've configured web server to be strict and set these headers:
```
Content-Security-Policy: default-src 'self'
Access-Control-ALlow-Origin: http://production.org
```

In our production app we used this config for the Grid:
```javascript
new Grid({
    features : {
        pdfExport : {
            exportServer : 'http://example.com:8081',
            translateURLsToAbsolute : 'http://production.org/app'
        }
    }
})
```

So when we export we send the following HTML to the server:
```html
<html>
    <head>
        <link rel="stylesheet" href="http://production.org/app/app.css">
    </head>
    <body>
    </body>
</html>
```

Let's see requests
```
                                         ┌──────────────────── example.com ──────────────────────────────────────────
                                         │
browser  web server (production.org)     │ PDF export server (example.com:8081)                                puppeteer page
   │           │                         │                   │                                                          │
   │ POST request with index.html        │                   │                                                          │
   │───────────│─────────────────────────│──────────────────>│                                                          │
   │           │                         │                   │ Server creates page and puts index.html                  │
   │           │                         │                   │─────────────────────────────────────────────────────────>│
   │           │                         │                   │                    GET http://production.org/app/app.css │
   │           │<────────────────────────│───────────────────│──────────────────────────────────────────────────────────│
   │           │  app.css                │                   │                                                          │
   │           │ ────────────────────────│───────────────────│─────────────────────────────────────────────────────────>│
   │           │                         │                   │         GET http://production.org/app/fonts/myfont.woff2 │
   │           │<────────────────────────│───────────────────│──────────────────────────────────────────────────────────│
   │           │  myfont.woff2           │                   │                                                          │
   │           │ ────────────────────────│───────────────────│─────────────────────────────────────────────────────────>│
   │           │                         │                   │                (PDF passed from puppeteer to the server) │ 
   │           │                         │                   │<─────────────────────────────────────────────────────────│
   │ POST response with generated PDF as │payload            │                                                          │
   │<──────────│─────────────────────────│───────────────────│                                                          │
                                         └───────────────────────────────────────────────────────────────────────────
```

But our PDF looks incorrect again, no styles and fonts are applied. Why? Because puppeteer page does not have origin. 
That's right, server creates page with no address (origin) and puts HTML content directly to it. So when browser checks
security headers it realizes page is not allowed to use those resources.

We need to set page origin. We can do it by providing
[clientUrl](https://bryntum.com/docs/gantt/api/Grid/feature/export/PdfExport#config-clientURL). It is a URL that
puppeteer navigates to before replacing page content with our `index.html`. From server's point of view page is not a
regular client which is browsing `http://production.org/app`

Of course, we can let PDF export server to have a local copy of resources like in the scenario with local web server and
remove export server.
