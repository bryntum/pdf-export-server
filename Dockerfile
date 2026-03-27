# Based on https://pptr.dev/troubleshooting#running-puppeteer-in-docker

FROM node:24-slim

# Skip Puppeteer's Chrome download - use system Chromium instead
# Required for arm64 Linux since Chrome for Testing lacks arm64 Linux builds
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install system Chromium and dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    # Build tools for native modules
    build-essential python3 make gcc g++ \
    # System Chromium (includes all required dependencies, has arm64 builds)
    chromium \
    # OpenSSL for certificate generation
    openssl \
    # Fonts for international character support
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*

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

# MuhammaraJS installs fixed dependency to tar 7.5.7 which fails security audit. Can be simplified to `npm i` after
# this issue is fixed: https://github.com/julianhille/MuhammaraJS/issues/500
# Run install to get muhammara
RUN npm i
# Install packages to muhammara submodule to get updated tar package
RUN (cd node_modules/muhammara && rm -rf node_modules package-lock.json && npm i)
# Run install again to update lock file
RUN npm i

COPY --chown=pptruser:pptruser src /home/pptruser/src
COPY --chown=pptruser:pptruser __tests__ /home/pptruser/__tests__
COPY --chown=pptruser:pptruser ["app.config.js", "babel.config.js", "/home/pptruser/"]

RUN npm run test

EXPOSE 8080 8081

ENTRYPOINT [ "node", "./src/server.js", "-H", "8081" ]
