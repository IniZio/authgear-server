#!/bin/sh

set -eu
# Make the certificates in /usr/local/share/ca-certificates take effect.
update-ca-certificates

# apt update && apt install -y iptables
# echo 1 > /proc/sys/net/ipv4/ip_forward
# # Redirect HTTP traffic to Martian proxy
# iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination host.docker.internal:8080
# # Redirect HTTPS traffic to Martian proxy
# iptables -t nat -A PREROUTING -p tcp --dport 443 -j DNAT --to-destination host.docker.internal:8080
# # Run the CMD specified in Dockerfile, or the CMD specified by the user.
exec "$@"
