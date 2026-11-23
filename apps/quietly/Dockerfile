FROM node:24-alpine

WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY --chown=node:node server.mjs ./
COPY --chown=node:node public ./public
USER node

EXPOSE 8080
CMD ["node", "server.mjs"]
