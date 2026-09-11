# Simulcast relay: Node control API + MediaMTX (WHEP client) + ffmpeg.
# MediaMTX pulls the browser broadcast from Cloudflare over WebRTC and re-serves
# it on localhost RTSP; ffmpeg pushes that to YouTube/Facebook/Twitch over RTMP.
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# MediaMTX (static Go binary).
ARG MEDIAMTX_VERSION=v1.21.0
RUN curl -sL "https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin mediamtx \
  && chmod +x /usr/local/bin/mediamtx

WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY mediamtx.yml ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
