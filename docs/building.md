# Building the server

## Installation

To install the standalone export server, NodeJS, Python 2.7 and the NPM package manager are required.

Depending on your system you can download them here:

https://nodejs.org/en/
https://www.npmjs.com/get-npm

Python:

```
npm install --global --production windows-build-tools
```

Or download the 2.7.x package from https://www.python.org/


```bash
cd ./server
npm install node-pre-gyp -g
npm install
```
## Requirements

The solution main requirements are listed below. For the full list of required modules please check `package.json` file contents.

**NOTE:** Please read the required libraries licensing info on the projects web-sites.

### Puppeteer

The solution uses [puppeteer module](https://www.npmjs.com/package/puppeteer) to generate PDF and PNG files.

When building, puppeteer versions for Windows, Linux and Mac are downloaded and placed into the bin directory in the chromium folder.

### MuhammaraJS

PDF streams are concatenated with the [MuhammaraJS module](https://www.npmjs.com/package/muhammara). Muhammara replaces the previously used HummusJS module, which is no longer maintained. It means we now support newer Node versions, but minimal supported version is 14.

### Merge-img

PNG streams are concatenated with [merge-img module](https://www.npmjs.com/package/merge-img)

### SSL certificate (if you are running HTTPS)

If you want to run export server on HTTPS, you will need a certificate. A self-signed certificate is provided, it can be
regenerated like this:

    openssl genrsa -out cert/server.key 2048
    openssl req -new -x509 -key src/cert/server.key -out src/cert/server.crt -days 3650 -subj /CN=localhost

<a name="self-signed-certificate"></a>
#### Make browser accept a self-signed certificate

Browsers tend to complain about self-signed certificates and when you are trying to access export server via HTTPS
you might get errors like `NET::ERR_CERT_AUTHORITY_INVALID` in Chrome and CORS exception in Firefox.

##### Chrome
Enable this flag: `chrome://flags/#allow-insecure-localhost`.

##### Firefox
Navigate to `Options -> Certificates -> View Certificates...`, open tab `Servers` and add exception for export
server address

### Pkg

The solution is wrapped into an executable with [pkg module](https://www.npmjs.com/package/pkg).

On build the "pkg" module wraps the `./src/server.js` into an OS specific executable. The output is copied to:

    ./bin/{os}/

## Building the solution

When all requirements are met. Feel free to adjust the code to your needs and build the solution:

    node build.js

**NOTE**: This won't work on Windows out of the box, some additional
tweaking required. See [below](#windows)

The output is placed in the bin directory having the following structure:

    - {os}
        - cert
            - server.crt
            - server.key
        - chromium
            - {os}-{version}

In the `cert` folder you can place your security certificates when running the server as https.

## Known problems

1. PNG export doesn't work in WSL environment (see [details](#buildinginwsl) below).
2. WSL cannot properly build server for Windows (use Windows version of node to build it).

When encountering any problems on the build:

- Check the requirements based on the used packages, for example that `nodejs -v` is 16+.
- Delete the `node_modules` folder.
- Delete the `cert` and `chromium` folders in the `bin` folder.
- Delete the server executables in the `bin` folder.

## Starting the node server

The server can be executed as a node script:

    cd ./server
    node src/server.js

<a name="windows"></a>

## Windows

Since Microsoft introduced [WSL](https://docs.microsoft.com/en-us/windows/wsl/about)
developers can choose which NodeJS to use: Linux version in WSL or Windows version in host OS. Below we discuss both options.

### Building server with node for windows

There are two obstacles to build server using NodeJS:

1. Default group policy, which doesn't allow users to make symlinks.
2. Node cannot rename certain file.

#### Symlinks

Since build script relies on making symlinks, user should have this
privilege. You can either run build with administrator privilege or (better)
allow yourself to make symlinks.

To grant yourself right to create symlinks you need to adjust corresponding
group policy:

1. Press *Win + R* and type *gpedit.msc* If you are using Windows 10
   you might note, that `gpedit` is missing. See [below](#gpedit) for solution.
2. Navigate to *Computer Configuration\Windows Settings\Security Settings\Local Policies\User Rights Assignment*.
3. Add users whom you trust (like yourself) to make symlinks.
4. Logout from system and log back in for group policy to take effect.

#### Node cannot rename certain file

At some point during the build process you might see the following exception:

    Error: EPERM: operation not permitted, rename

There is a similar [issue on GitHub](https://github.com/react-community/create-react-native-app/issues/191)
which shows that multiple users experience this problem with antivirus software enabled. Windows
Defender might be enabled on your machine, and then disabling it fixes the issue. But disabling antivirus completely is not safe.
Instead we recommend adding *node.exe* to the list of exceptions for your antivirus software.
[Here](https://blog.johnnyreilly.com/2017/06/windows-defender-step-away-from-npm.html)
is a short sum-up of this issue and steps to fix Windows Defender.

<a name="gpedit"></a>

#### Enabling gpedit in Windows 10

You can find solution on the Internet in no time, but if you prefer not
to download executables or scripts from there, here is alternative
solution (doing basically the same thing, but you can actually see that
nothing criminal is going on)

1. Make new .bat file and paste this contents [source(russian language)](https://remontka.pro/cannot-find-gpedit-msc/)

   @echo off
   dir /b C:\Windows\servicing\Packages\Microsoft-Windows-GroupPolicy-ClientExtensions-Package~3*.mum >find-gpedit.txt
   dir /b C:\Windows\servicing\Packages\Microsoft-Windows-GroupPolicy-ClientTools-Package~3*.mum >>find-gpedit.txt
   echo Installing gpedit.msc
   for /f %%i in ('findstr /i . find-gpedit.txt 2^>nul') do dism /online /norestart /add-package:"C:\Windows\servicing\Packages\%%i"
   echo Gpedit installed
   pause

2. Now run this .bat file with administrator privileges


<a name="buildinginwsl"></a>

### Building server with NodeJS in WSL

WSL aims to work seamlessly, and it mostly does, but there are
rough edges still (like puppeteer support).

Server can be built/run in WSL, with few limitations. See compatibility table below:

| Built on |    Running on WSL    | Running on Windows | Running on Linux |
|----------|:--------------------:|:------------------:|:----------------:|
| WSL      | PDF only w/o sandbox |    Doesn't work    |     PDF/PNG      |
| Windows  | PDF only w/o sandbox |      PDF/PNG       |     PDF/PNG      |
| Linux    | PDF only w/o sandbox |      PDF/PNG       |     PDF/PNG      |

Run server inside WSL with no sandbox, e.g.:

    ./server -h 8080 --no-sandbox
