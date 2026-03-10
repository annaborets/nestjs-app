# Stage 1: deps — install ALL dependencies
FROM node:22-alpine AS deps

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./

RUN npm ci

# Stage 2: dev — for hot-reload via compose.dev.yml
FROM deps AS dev

WORKDIR /usr/src/app

COPY . .

RUN chown -R node:node /usr/src/app

USER node

EXPOSE 3000

CMD ["npm", "run", "start:dev"]

# Stage 3: build — compile TypeScript
FROM deps AS build

WORKDIR /usr/src/app

COPY . .

RUN npm run build

# Stage 4: prod — minimal runtime with Alpine
FROM node:22-alpine AS prod

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev

COPY --from=build /usr/src/app/dist ./dist
COPY proto ./proto

RUN chown -R node:node /usr/src/app

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]

# Stage 5: prod-distroless — minimal runtime, no shell
FROM gcr.io/distroless/nodejs22-debian12 AS prod-distroless

WORKDIR /usr/src/app

COPY --from=prod /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

USER nonroot

EXPOSE 3000

CMD ["dist/main.js"]