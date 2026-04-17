FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

RUN addgroup -g 1001 -S nestjs && adduser -S -u 1001 nestjs
RUN chown -R nestjs:nestjs /app
USER nestjs

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --spider -q http://localhost:3002/health || exit 1

EXPOSE 3002
CMD ["npm", "run", "start:prod"]
