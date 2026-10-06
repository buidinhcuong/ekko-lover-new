# Ekko · Giáo dục tài chính — Node 22, không có dependency ngoài.
# Dữ liệu (SQLite + ảnh hoá đơn) nằm ở /data: PHẢI gắn volume để không mất khi
# dựng lại container. Xem DEPLOY.md.
FROM node:22-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    EKKO_DATA_DIR=/data \
    EKKO_TZ=Asia/Ho_Chi_Minh

WORKDIR /srv/app
COPY package.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /data && chown -R node:node /data /srv/app
USER node
VOLUME ["/data"]
EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
