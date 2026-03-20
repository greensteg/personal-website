FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html /srv/
COPY thoughts.html /srv/
COPY post.html /srv/
COPY contact.html /srv/
COPY content/ /srv/content/
COPY shared/ /srv/shared/
