FROM nginx:1.29-alpine
COPY deploy/nginx-static.conf /etc/nginx/conf.d/default.conf
RUN sed -i 's#SPA_FALLBACK#=404#' /etc/nginx/conf.d/default.conf
COPY apps/cv/site/ /usr/share/nginx/html/
# 원본은 mlnl.site 기준으로 적고, 이미지를 만들 때 실제 도메인으로 바꿉니다
ARG SITE_DOMAIN=mlnl.site
RUN find /usr/share/nginx/html -type f \( -name "*.html" -o -name "*.txt" -o -name "*.xml" \) \
      -exec sed -i "s#mlnl\.site#${SITE_DOMAIN}#g" {} +
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
