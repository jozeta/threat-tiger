FROM nginx:alpine

RUN apk add --no-cache git

RUN rm -rf /usr/share/nginx/html/* && \
    git clone https://github.com/jozeta/threat-tiger.git /usr/share/nginx/html