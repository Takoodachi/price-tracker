# One image for both processes: the API (which also serves the built web app)
# and the background worker (same image, different command).

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
RUN npx turbo run build --filter=@pricetracker/api --filter=@pricetracker/web

FROM node:22-alpine
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace=@pricetracker/api && npm cache clean --force
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/migrations apps/api/migrations
COPY --from=build /repo/apps/web/dist apps/web/dist
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
