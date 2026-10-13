FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S diffox && adduser -S diffox -G diffox
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/.next ./.next
COPY --from=deps /app/node_modules ./node_modules
# Worker + lib sources (worker runs as a separate process, same image)
COPY --from=build /app/worker ./worker
COPY --from=build /app/lib ./lib
USER diffox
EXPOSE 3000
CMD ["npm", "run", "start"]
