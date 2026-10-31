FROM nginx:1.29-alpine
COPY deploy/nginx-static.conf /etc/nginx/conf.d/default.conf
RUN sed -i 's#SPA_FALLBACK#=404#' /etc/nginx/conf.d/default.conf
COPY apps/cv/site/ /usr/share/nginx/html/
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
