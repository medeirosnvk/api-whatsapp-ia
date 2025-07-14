FROM node:18-alpine

# 1. Instala as dependências de sistema necessárias para o Puppeteer (Chromium) no Alpine Linux.
# Ref: https://pptr.dev/troubleshooting#running-puppeteer-on-alpine
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont \
    fontconfig \
    dbus

# 2. Cria um usuário e grupo não-root para a aplicação por segurança.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 3. Define variáveis de ambiente.
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production

# 4. Define o diretório de trabalho.
WORKDIR /app

# 5. Copia os arquivos de definição de pacotes.
COPY package*.json ./

# 6. Instala apenas as dependências de produção usando npm ci para builds mais rápidos e consistentes.
RUN npm ci --omit=dev

# 7. Copia o restante do código da aplicação.
COPY . .

# 8. Altera a propriedade dos arquivos para o usuário da aplicação.
RUN chown -R appuser:appgroup /app

# 9. Muda para o usuário não-root.
USER appuser

# 10. Expõe a porta da aplicação.
EXPOSE 3000

# 11. Define o comando para iniciar a aplicação.
CMD [ "node", "src/server.js" ]
