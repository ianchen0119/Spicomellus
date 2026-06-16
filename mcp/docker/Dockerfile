# SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
# SPDX-License-Identifier: AGPL-3.0-only

FROM docker.io/node:24.14.0-alpine@sha256:7fddd9ddeae8196abf4a3ef2de34e11f7b1a722119f91f28ddf1e99dcafdf114

WORKDIR /usr/src/app/mcp

COPY mcp/package.json ./package.json
RUN npm install --omit=dev

COPY mcp/web-server.js ./web-server.js

EXPOSE 3002
CMD ["node", "web-server.js"]
