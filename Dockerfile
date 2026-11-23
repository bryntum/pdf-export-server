# Based on https://pptr.dev/troubleshooting#running-puppeteer-in-docker

FROM node:24.22.3-trixie-slim

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
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst-one fonts-freefont-ttf \
    # Upgrade all packages to get security patches (fixes chromium and libpng CVEs)
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

# Upgrade npm to get latest secure version
# No npm release depends on glob 14 / minimatch 11 yet (npm 12 still wants glob ^13, minimatch ^10), so
# they are swapped in manually. Both are ESM-only and npm loads them with require(), which needs
# Node >= 22.12 - fine for this image. They need extra packages npm does not bundle:
#  - glob 14 needs path-scurry 3
#  - minimatch 11 needs @isaacs/nonrecursive-glob-match
# Side effect: `npm ls -g --all` reports glob and minimatch as "invalid"
# @sigstore/verify, @sigstore/bundle and @sigstore/protobuf-specs are in-range patch updates for npm 12
RUN npm install -g npm@12.2.2 \
    && curl -sfL https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.13.tgz -o /tmp/brace-expansion.tgz \
    && curl -sfL https://registry.npmjs.org/glob/-/glob-14.0.2.tgz -o /tmp/glob.tgz \
    && curl -sfL https://registry.npmjs.org/path-scurry/-/path-scurry-3.0.0.tgz -o /tmp/path-scurry.tgz \
    && curl -sfL https://registry.npmjs.org/minimatch/-/minimatch-11.0.1.tgz -o /tmp/minimatch.tgz \
    && curl -sfL https://registry.npmjs.org/@isaacs/nonrecursive-glob-match/-/nonrecursive-glob-match-1.1.0.tgz -o /tmp/nonrecursive-glob-match.tgz \
    && curl -sfL https://registry.npmjs.org/@sigstore/verify/-/verify-4.1.3.tgz -o /tmp/sigstore-verify.tgz \
    && curl -sfL https://registry.npmjs.org/@sigstore/bundle/-/bundle-5.0.1.tgz -o /tmp/sigstore-bundle.tgz \
    && curl -sfL https://registry.npmjs.org/@sigstore/protobuf-specs/-/protobuf-specs-0.5.2.tgz -o /tmp/sigstore-protobuf-specs.tgz \
    && cd /usr/local/lib/node_modules/npm/node_modules \
    && rm -rf brace-expansion && tar -xzf /tmp/brace-expansion.tgz && mv package brace-expansion \
    && rm -rf glob && tar -xzf /tmp/glob.tgz && mv package glob \
    && rm -rf path-scurry && tar -xzf /tmp/path-scurry.tgz && mv package path-scurry \
    && rm -rf minimatch && tar -xzf /tmp/minimatch.tgz && mv package minimatch \
    && rm -rf @isaacs/nonrecursive-glob-match && mkdir -p @isaacs \
    && tar -xzf /tmp/nonrecursive-glob-match.tgz && mv package @isaacs/nonrecursive-glob-match \
    && rm -rf @sigstore/verify && tar -xzf /tmp/sigstore-verify.tgz && mv package @sigstore/verify \
    && rm -rf @sigstore/bundle && tar -xzf /tmp/sigstore-bundle.tgz && mv package @sigstore/bundle \
    && rm -rf @sigstore/protobuf-specs && tar -xzf /tmp/sigstore-protobuf-specs.tgz && mv package @sigstore/protobuf-specs \
    && rm /tmp/*.tgz \
    # Smoke test: fail the build if patched npm cannot load the swapped packages
    && node -e "process.chdir('/usr/local/lib/node_modules/npm'); for (const p of ['glob', 'minimatch', '@sigstore/verify', 'sigstore']) require(require.resolve(p, { paths: [process.cwd()] }))" \
    && npm --version

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

# npm 12 blocks install scripts of dependencies by default. @muhammara/native downloads its prebuilt binary
# in an install script, it is allowed by `allowScripts` in package.json
# Clear npm cache at end to prevent stale version info in Docker Scout SBOM
RUN npm i \
    && npm cache clean --force \
    && rm -rf /home/pptruser/.npm/_logs

COPY --chown=pptruser:pptruser src /home/pptruser/src
COPY --chown=pptruser:pptruser __tests__ /home/pptruser/__tests__
COPY --chown=pptruser:pptruser ["app.config.js", "babel.config.js", "/home/pptruser/"]

RUN npm run test

EXPOSE 8080 8081

ENTRYPOINT [ "node", "./src/server.js", "-H", "8081" ]
