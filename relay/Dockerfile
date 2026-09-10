# Simulcast relay: Node + ffmpeg. ffmpeg does a stream copy (no re-encode),
# so this runs comfortably on the smallest instance any host offers.
FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package.json ./
# No npm install needed - the server uses only Node built-ins.
COPY server.js ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
