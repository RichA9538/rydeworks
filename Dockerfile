FROM node:22-alpine

RUN npm install -g pnpm@9

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/rydeworks/package.json ./artifacts/rydeworks/

RUN pnpm install --no-frozen-lockfile

COPY . .

RUN BASE_PATH=/ PORT=3000 NODE_ENV=production pnpm --filter @workspace/rydeworks run build

RUN pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "artifacts/api-server/dist/index.cjs"]
