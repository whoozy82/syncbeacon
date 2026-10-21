#!/usr/bin/env bash
# Run tests/test_systemd.js on a private D-Bus that serves as both session and
# system bus, so systemd is not reachable on either. The bus has no service
# directories, so nothing is activated on it.
set -euo pipefail

cd "$(dirname "$0")/.."
config=$(mktemp)
trap 'rm -f "$config"' EXIT
cat >"$config" <<EOF
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>session</type>
  <listen>unix:tmpdir=${TMPDIR:-/tmp}</listen>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
  </policy>
</busconfig>
EOF
GIO_USE_VFS=local dbus-run-session --config-file="$config" -- bash -c \
  'DBUS_SYSTEM_BUS_ADDRESS=$DBUS_SESSION_BUS_ADDRESS exec gjs -m tests/test_systemd.js'
