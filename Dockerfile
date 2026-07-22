FROM node:22.23.1-alpine3.24 AS build
WORKDIR /app
COPY package*.json ./
RUN test "$(node --version)" = "v22.23.1" \
    && test "$(npm --version)" = "10.9.8" \
    && npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.4-alpine3.24
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/includes /etc/nginx/includes
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

STOPSIGNAL SIGQUIT
