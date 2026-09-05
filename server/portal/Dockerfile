# Portail client Mar'q — image de déploiement (zéro dépendance runtime)
FROM node:20-alpine

# Sécurité : exécute en utilisateur non-root
WORKDIR /app

# Le serveur n'a AUCUNE dépendance npm : on copie seulement les sources.
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY scripts ./scripts

# Dossier de données persistant (JSON + fichiers). À monter en volume.
ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]
USER node

EXPOSE 8787

# Petit healthcheck HTTP (utilise le endpoint /health du serveur)
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "server.js"]
