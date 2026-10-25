# Ubuntu 22.04 rather than Debian bullseye: bullseye's security pool now
# returns 404 for its deb11u* packages, so apt-get install fails before the
# build starts. Bookworm is not an option either — it only ships webkit2gtk 4.1
# (libsoup3), while wry 0.24 links against 4.0 (libsoup2). 22.04 has 4.0 and is
# the environment Tauri documents for Linux builds.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

COPY entrypoint.sh /entrypoint.sh
RUN chmod a+x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
