#!/usr/bin/env sh
# Generate the original synthetic MP4 used by the clearly labeled demo.
# Requires ffmpeg with libx264; ordinary app startup does not require ffmpeg.
set -eu
cd "$(dirname "$0")/.."
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i 'testsrc2=size=640x360:rate=24:duration=18' \
  -f lavfi -i 'sine=frequency=440:sample_rate=44100:duration=18' \
  -vf 'hue=s=0.45' -af 'volume=0.025' \
  -c:v libx264 -preset veryslow -crf 34 -pix_fmt yuv420p \
  -c:a aac -b:a 48k -movflags +faststart -shortest public/demo-sample.mp4
mkdir -p test/fixtures/hls
ffmpeg -hide_banner -loglevel error -y -i public/demo-sample.mp4 \
  -codec copy -hls_time 4 -hls_list_size 0 \
  -hls_segment_filename 'test/fixtures/hls/segment%02d.ts' test/fixtures/hls/index.m3u8
