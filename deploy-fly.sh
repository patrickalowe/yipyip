#!/bin/sh
# Deploy this fork to Fly.io in two steps:
#   1. Build the app image FROM SOURCE on Fly's remote builder and push it to
#      the app registry as :base (this is what ships fork-local changes).
#   2. Deploy fly.Dockerfile, which layers the single-volume /data symlink
#      setup on top of :base (see fly.Dockerfile for why).
set -e
APP=yipyip-patricklowe

echo "==> [1/2] Building yipyip from source -> registry.fly.io/$APP:base"
# fly.build.toml (not fly.toml) so the root Dockerfile wins — a --dockerfile
# CLI flag is ignored when the config file sets one.
fly deploy -c fly.build.toml --build-only --push --image-label base --remote-only

echo "==> [2/2] Deploying volume wrapper"
fly deploy -a "$APP" --ha=false

echo "==> Done: https://$APP.fly.dev"
