# 构建前端
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
COPY . .
RUN npx vite build

# 运行
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY server ./server
ENV DATA_DIR=/data
ENV PORT=3001
EXPOSE 3001
VOLUME ["/data"]
CMD ["node", "server/index.mjs", "--prod"]
