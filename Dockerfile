# syntax=docker/dockerfile:1

# ---------- Build-Stage ----------
FROM node:20-alpine AS build

# Build-Tools für native Node-Module (z. B. reanimated/worklets Metadaten)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Optional: Backend-URL zur Build-Zeit überschreiben (wird von Expo inline gebacken)
ARG EXPO_PUBLIC_CHAT_API_URL
ENV EXPO_PUBLIC_CHAT_API_URL=${EXPO_PUBLIC_CHAT_API_URL}

# Abhängigkeiten zuerst kopieren, um den Layer-Cache zu nutzen
COPY package.json package-lock.json ./
RUN npm ci

# Restlichen Quellcode kopieren
COPY . .

# Statischen Web-Export erzeugen (Ausgabe standardmäßig in /app/dist)
RUN npx expo export -p web

# ---------- Runtime-Stage ----------
FROM nginx:alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
