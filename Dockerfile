# Based on https://pptr.dev/troubleshooting#running-puppeteer-in-docker

FROM node:24-slim

# Skip Puppeteer's Chrome download - use system Chromium instead
# Required for arm64 Linux since Chrome for Testing lacks arm64 Linux builds
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install system Chromium and dependencies, then upgrade all packages to fix CVEs
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    # Build tools for native modules
    build-essential python3 make gcc g++ \
    # System Chromium (includes all required dependencies, has arm64 builds)
    chromium \
    # OpenSSL for certificate generation
    openssl \
    # curl for downloading npm security patches
    curl ca-certificates \
    # Fonts for international character support
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    # Upgrade all packages to get security patches (fixes chromium and libpng CVEs)
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

# Upgrade npm to get fixed tar (7.5.11) bundled with npm, fixing CVE-2026-31802 and CVE-2026-29786
# Then patch npm's bundled dependencies to fix remaining CVEs:
# - picomatch 4.0.3 -> 4.0.4 (CVE-2026-33671, CVE-2026-33672)
# - brace-expansion 5.0.4 -> 5.0.5 (CVE-2026-33750)
RUN npm install -g npm@11.12.1 \
    && curl -sL https://registry.npmjs.org/picomatch/-/picomatch-4.0.4.tgz -o /tmp/picomatch.tgz \
    && curl -sL https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.5.tgz -o /tmp/brace-expansion.tgz \
    && cd /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules \
    && rm -rf picomatch && tar -xzf /tmp/picomatch.tgz && mv package picomatch \
    && cd /usr/local/lib/node_modules/npm/node_modules \
    && rm -rf brace-expansion && tar -xzf /tmp/brace-expansion.tgz && mv package brace-expansion \
    && rm /tmp/picomatch.tgz /tmp/brace-expansion.tgz

# Add user so we don't need --no-sandbox
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/log \
    && mkdir /home/pptruser/cert \
    && mkdir /home/pptruser/src \
    && openssl rand -out /root/.rnd 1024 \
    && openssl genrsa -out /home/pptruser/cert/server.key 2048 \
    && openssl req -new -x509 -key /home/pptruser/cert/server.key -out /home/pptruser/cert/server.crt -days 3650 -subj /CN=localhost \
    && chown -R pptruser:pptruser /home/pptruser

# Run everything after as non-privileged user.
USER pptruser

COPY --chown=pptruser:pptruser ["package.json", "/home/pptruser/"]

WORKDIR /home/pptruser

# MuhammaraJS installs fixed dependency to tar which fails security audit. Can be simplified to `npm i` after
# this issue is fixed: https://github.com/julianhille/MuhammaraJS/issues/500
# Combined install step: install, patch muhammara's dependencies, reinstall to update lock file
# All in one RUN to avoid intermediate layers with vulnerable packages being detected by Docker Scout
# Clear npm cache at end to prevent stale version info in Docker Scout SBOM
RUN npm i \
    && cd node_modules/muhammara && rm -rf node_modules package-lock.json \
    && node -e "const p=require('./package.json'); p.overrides={tar:'7.5.11',minimatch:'10.2.3',picomatch:'4.0.4'}; require('fs').writeFileSync('./package.json',JSON.stringify(p,null,2));" \
    && npm i \
    && cd /home/pptruser && npm i \
    && npm cache clean --force \
    && rm -rf /home/pptruser/.npm/_logs

COPY --chown=pptruser:pptruser src /home/pptruser/src
COPY --chown=pptruser:pptruser __tests__ /home/pptruser/__tests__
COPY --chown=pptruser:pptruser ["app.config.js", "babel.config.js", "/home/pptruser/"]

RUN npm run test

EXPOSE 8080 8081

ENTRYPOINT [ "node", "./src/server.js", "-H", "8081" ]
