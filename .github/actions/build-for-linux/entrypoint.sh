#!/bin/bash

set -e

# GitHub mounts its own HOME over the container's, so rustup sees /github/home
# while the process runs as root whose real home is /root. Point CARGO_HOME and
# RUSTUP_HOME somewhere explicit so neither the installer nor cargo complains
# about "$HOME differs from euid-obtained home directory".
export CARGO_HOME=/usr/local/cargo
export RUSTUP_HOME=/usr/local/rustup
mkdir -p "$CARGO_HOME" "$RUSTUP_HOME"

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
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    libxdo-dev \
    libxcb1 \
    libxrandr2 \
    libdbus-1-3

# Pin webkit2gtk to the version jammy shipped initially. wry 0.24 calls
# Settings::set_enable_webgl and friends, which newer webkit (2.44+, what
# jammy-updates now carries) removed, so an unpinned install fails to compile
# wry. 2.36.0 is the last API-compatible release in this distro.
WEBKIT_VERSION=2.36.0-2ubuntu1
apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.0-dev=$WEBKIT_VERSION \
    libwebkit2gtk-4.0-37=$WEBKIT_VERSION \
    libjavascriptcoregtk-4.0-dev=$WEBKIT_VERSION \
    libjavascriptcoregtk-4.0-18=$WEBKIT_VERSION \
    gir1.2-webkit2-4.0=$WEBKIT_VERSION \
    gir1.2-javascriptcoregtk-4.0=$WEBKIT_VERSION
apt-mark hold libwebkit2gtk-4.0-dev libwebkit2gtk-4.0-37 \
    libjavascriptcoregtk-4.0-dev libjavascriptcoregtk-4.0-18

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --no-modify-path
export PATH="$CARGO_HOME/bin:$PATH"

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
