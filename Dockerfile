# Based on https://pptr.dev/troubleshooting#running-puppeteer-in-docker

FROM node:24-slim

# Install system dependencies required for Chromium/Chrome to run
# Puppeteer will download its own browser during npm install
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    # Build tools for native modules
    build-essential python3 make gcc g++ \
    # Chromium dependencies
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
    libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
    libxss1 libxtst6 lsb-release xdg-utils wget \
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

COPY --parents --chown=pptruser:pptruser ["src", "__tests__", "/home/pptruser/"]
COPY --chown=pptruser:pptruser ["app.config.js", ".puppeteerrc.cjs", "babel.config.js", "/home/pptruser/"]

RUN npm run test

EXPOSE 8080 8081

ENTRYPOINT [ "node", "./src/server.js", "-H", "8081" ]
