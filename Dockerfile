FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Runtime state (data/devices.json) should be mounted as a volume so it
# survives container recreation - see docker-compose.yml / README.
# Ownership must be set here: Docker seeds a fresh named volume from the
# image's existing directory content/permissions on first mount, and the
# process below runs as the non-root "node" user.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]

USER node

CMD ["node", "src/server.js"]
