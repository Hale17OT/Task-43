FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npx ng build --configuration production

FROM builder AS test
RUN apk add --no-cache chromium
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROMIUM_FLAGS="--no-sandbox --headless --disable-gpu --disable-dev-shm-usage"
CMD ["npx", "ng", "test", "--watch=false", "--browsers=ChromeHeadlessNoSandbox"]

FROM nginx:alpine
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
