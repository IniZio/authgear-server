# syntax=docker/dockerfile:1

# Stage 0a: Build the static files
FROM node:20.9.0-bookworm AS stage0a
ARG GIT_HASH
WORKDIR /usr/src/app
COPY ./scripts/npm/package.json ./scripts/npm/package-lock.json ./scripts/npm/
RUN cd ./scripts/npm && npm ci
COPY ./authui/package.json ./authui/package-lock.json ./authui/
# See /authui/README.md for the reason why we need to copy tarballs.
COPY ./authui/tarballs/. ./authui/tarballs/.
RUN cd ./authui && npm ci
COPY . .
RUN make authui GIT_HASH=$GIT_HASH

# Stage 0b: Build the portal static files
FROM node:20.9.0-bookworm AS stage0b
ARG GIT_HASH
# If the working directory is /src, Parcel will have some problem with it.
WORKDIR /usr/src/app
COPY ./portal/package.json ./portal/package-lock.json ./
# Copy the scripts
COPY ./portal/scripts/. ./scripts/.
RUN npm ci
COPY ./portal .
RUN npm run build

# Stage 1: Build the Go binary
FROM quay.io/theauthgear/golang:1.23.5-noble AS stage1

# Install build time C dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  pkg-config \
  libicu-dev \
  libvips-dev \
  libmagic-dev \
  && rm -rf /var/lib/apt/lists/*

# In order to build a Go program that uses private modules in Docker,
# we need the following
#
# 1. Set GOPRIVATE
# 2. Set up ~/.gitconfig to make Go to use SSH instead HTTPS to fetch the private modules.
# 3. Set up ~/.ssh/known_hosts
# 4. use --mount=type=ssh to use the SSH agent from the host machine.
ENV GOPRIVATE github.com/authgear/iamsmart
RUN git config --global url."ssh://git@github.com/authgear/iamsmart".insteadOf https://github.com/authgear/iamsmart
RUN mkdir -p ~/.ssh \
  && ssh-keyscan github.com >> ~/.ssh/known_hosts

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
WORKDIR /src/custombuild
COPY ./custombuild/go.mod ./custombuild/go.sum ./
RUN --mount=type=ssh go mod download
WORKDIR /src
COPY . .
# Let //go:embed to embed the built static files
COPY --from=stage0a /usr/src/app/resources/authgear/ ./resources/authgear/
COPY --from=stage0b /usr/src/app/dist/ ./resources/portal/static/
ARG GIT_HASH
RUN make -C custombuild build BIN_NAME=authgear-portal TARGET=portalx GIT_HASH=$GIT_HASH

# We used to build static binary.
# But we have a transitive dependency on icu4c so this is no longer the case.
# RUN readelf -d ./authgear | grep 'There is no dynamic section in this file'

# Final Stage: Prepare the actual fs we use to run the program
FROM ubuntu:noble
ARG GIT_HASH
WORKDIR /app
# /etc/mime.types (media-types)
# /usr/share/ca-certificates/*/* (ca-certificates)
# /usr/share/zoneinfo/ (tzdata)
RUN apt-get update && apt-get install -y --no-install-recommends \
  libicu-dev \
  libvips-dev \
  libmagic-dev \
  libmagic-mgc \
  ca-certificates \
  media-types \
  tzdata \
  && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
RUN update-ca-certificates
COPY --from=stage1 /src/custombuild/authgear-portal /usr/local/bin/
COPY ./docker-entrypoint.sh /usr/local/bin/
ENTRYPOINT ["docker-entrypoint.sh"]
# update-ca-certificates requires root to run.
#USER nobody
EXPOSE 3003
CMD ["authgear-portal", "start"]
