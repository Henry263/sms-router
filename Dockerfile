FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

# node:slim ships a non-root "node" user.
USER node

CMD ["node", "src/index.js"]
