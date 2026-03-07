FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache git
RUN npm install -g rector@latest
RUN mkdir rector
CMD ["rector", "gateway", "--port", "18789"]
