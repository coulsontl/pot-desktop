#!/bin/bash

set -e

apt-get update
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    xz-utils \
    build-essential \
    pkg-config \
    libssl-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.0-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    libxdo-dev \
    libxcb1 \
    libxrandr2 \
    libdbus-1-3

# rustup is not in the image; the Dockerfile only pins the OS.
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
. "$HOME/.cargo/env"

wget -q https://nodejs.org/dist/v19.8.1/node-v19.8.1-linux-x64.tar.xz
tar -Jxf ./node-v19.8.1-linux-x64.tar.xz
export PATH=$(pwd)/node-v19.8.1-linux-x64/bin:$PATH
npm install pnpm -g

# Only x86_64 ships now; the multi-arch branches were removed with the matrix.
if [ "$INPUT_TARGET" != "x86_64-unknown-linux-gnu" ]; then
    echo "Unsupported target: $INPUT_TARGET" && exit 1
fi

rustup target add "$INPUT_TARGET"
rustup toolchain install --force-non-host "$INPUT_TOOLCHAIN"

bash .github/actions/build.sh
