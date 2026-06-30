# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Production server ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Copy only what we need to run
COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js .
COPY mockCalendar.js .
COPY --from=builder /app/dist ./dist

# Cloud Run injects PORT at runtime
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
