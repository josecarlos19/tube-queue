FROM node:22.17.1-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
RUN mkdir -p /data && chown node:node /data
ENV HOST=0.0.0.0 PORT=8070 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8070
USER node
CMD ["node", "server/index.mjs"]
