#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local name="$1"
  local value="${!name:-}"

  if [ -z "$value" ] || [[ "$value" == \$\(* ]]; then
    echo "Missing required environment variable: $name"
    exit 1
  fi
}

validate_env_name() {
  local name="$1"
  if [[ ! "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "Invalid environment variable name: $name"
    exit 1
  fi
}

write_env_line() {
  local name="$1"
  local value="$2"

  if [[ "$value" == *$'\n'* ]]; then
    echo "Environment variable $name contains a newline and cannot be written to a .env file."
    exit 1
  fi

  printf '%s=%s\n' "$name" "$value"
}

rewrite_base_url_host() {
  local value="$1"
  local host="$2"
  local scheme=""
  local rest=""
  local authority=""
  local suffix=""
  local port=""

  if [[ ! "$value" =~ ^https?:// ]]; then
    printf '%s\n' "$value"
    return 0
  fi

  scheme="${value%%://*}://"
  rest="${value#*://}"
  authority="${rest%%/*}"
  if [[ "$rest" == */* ]]; then
    suffix="/${rest#*/}"
  fi
  if [[ "$authority" == *:* ]]; then
    port=":${authority##*:}"
  fi

  printf '%s%s%s%s\n' "$scheme" "$host" "$port" "$suffix"
}

resolve_ssh_key() {
  local primary="$1"
  local fallback="${2:-}"

  if [ -f "$primary" ]; then
    printf '%s\n' "$primary"
    return 0
  fi

  if [ -n "$fallback" ] && [ -f "$fallback" ]; then
    printf '%s\n' "$fallback"
    return 0
  fi

  echo "SSH key not found. Tried: $primary ${fallback:-}" >&2
  return 1
}

for name in \
  CONTAINER_REGISTRY \
  IMAGE_REPOSITORY \
  TAG \
  SSH_HOST \
  SSH_USER \
  SSH_KEY_PATH \
  REMOTE_GATEWAY_PATH \
  COMPOSE_FILE \
  COMPOSE_SOURCE_FILE \
  SERVICE_NAME \
  ENV_VARIABLE_NAMES \
  ENV_BASE_URL_HOST \
  GRPC_PORT \
  DEPLOY_ENVIRONMENT_NAME; do
  require_env "$name"
done

for name in $ENV_VARIABLE_NAMES; do
  validate_env_name "$name"
  require_env "$name"
done

if [ ! -f "$COMPOSE_SOURCE_FILE" ]; then
  echo "Missing compose source file: $COMPOSE_SOURCE_FILE"
  exit 1
fi

SSH_KEY="$(resolve_ssh_key "$SSH_KEY_PATH" "${SSH_KEY_FALLBACK:-}")"
chmod 600 "$SSH_KEY"

IMAGE="${CONTAINER_REGISTRY}/${IMAGE_REPOSITORY}:${TAG}"
REMOTE="${SSH_USER}@${SSH_HOST}"
ENV_FILE_LOCAL="$(mktemp)"

cleanup() {
  rm -f "$ENV_FILE_LOCAL"
}
trap cleanup EXIT

SSH_OPTS=(
  -i "$SSH_KEY"
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=accept-new
)

DOCKER_CONFIG_FILE="${DOCKER_CONFIG:-$HOME/.docker}/config.json"
if [ ! -f "$DOCKER_CONFIG_FILE" ]; then
  echo "Missing Docker config after ACR login: $DOCKER_CONFIG_FILE"
  exit 1
fi

umask 077
{
  for name in $ENV_VARIABLE_NAMES; do
    value="${!name}"
    if [[ "$name" == *_BASE_URL ]]; then
      value="$(rewrite_base_url_host "$value" "$ENV_BASE_URL_HOST")"
    fi
    write_env_line "$name" "$value"
  done
  write_env_line GATEWAY_IMAGE "$IMAGE"
} > "$ENV_FILE_LOCAL"

echo "Copying ACR Docker login to ${DEPLOY_ENVIRONMENT_NAME} server..."
ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p ~/.docker && umask 077 && cat > ~/.docker/config.json" < "$DOCKER_CONFIG_FILE"

echo "Updating ${DEPLOY_ENVIRONMENT_NAME} .env and compose file..."
ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p '$REMOTE_GATEWAY_PATH' && umask 077 && cat > '$REMOTE_GATEWAY_PATH/.env.pipeline'" < "$ENV_FILE_LOCAL"
ssh "${SSH_OPTS[@]}" "$REMOTE" "mv '$REMOTE_GATEWAY_PATH/.env.pipeline' '$REMOTE_GATEWAY_PATH/.env' && chmod 600 '$REMOTE_GATEWAY_PATH/.env'"
ssh "${SSH_OPTS[@]}" "$REMOTE" "cat > '$REMOTE_GATEWAY_PATH/$COMPOSE_FILE'" < "$COMPOSE_SOURCE_FILE"

echo "Deploying ${DEPLOY_ENVIRONMENT_NAME} gateway container..."
ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "REMOTE_GATEWAY_PATH='$REMOTE_GATEWAY_PATH' COMPOSE_FILE='$COMPOSE_FILE' SERVICE_NAME='$SERVICE_NAME' CONTAINER_NAME='${CONTAINER_NAME:-$SERVICE_NAME}' GATEWAY_GRPC_PORT='$GRPC_PORT' DEPLOY_ENVIRONMENT_NAME='$DEPLOY_ENVIRONMENT_NAME' bash -se" << 'REMOTE_SCRIPT'
set -euo pipefail

cd "$REMOTE_GATEWAY_PATH"

wait_for_service() {
  local service="$1"
  local attempts=24
  local container_id=""
  local status=""

  for attempt in $(seq 1 "$attempts"); do
    container_id="$(docker compose --env-file .env -f "$COMPOSE_FILE" ps -q "$service" || true)"
    if [ -n "$container_id" ]; then
      status="$(docker inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null || true)"
      if [ "$status" = "running" ]; then
        printf '%s\n' "$container_id"
        return 0
      fi
    fi
    sleep 5
  done

  echo "Service $service did not stay running." >&2
  docker compose --env-file .env -f "$COMPOSE_FILE" ps >&2 || true
  docker compose --env-file .env -f "$COMPOSE_FILE" logs --tail=200 "$service" >&2 || true
  exit 1
}

wait_for_host_port() {
  local service="$1"
  local port="$2"
  local attempts=24

  for attempt in $(seq 1 "$attempts"); do
    if command -v nc >/dev/null 2>&1; then
      if nc -z 127.0.0.1 "$port"; then
        return 0
      fi
    elif timeout 5 bash -c "cat < /dev/null > /dev/tcp/127.0.0.1/${port}"; then
      return 0
    fi

    sleep 5
  done

  echo "Gateway is not listening on host gRPC port ${port}." >&2
  docker compose --env-file .env -f "$COMPOSE_FILE" ps >&2 || true
  docker compose --env-file .env -f "$COMPOSE_FILE" logs --tail=200 "$service" >&2 || true
  exit 1
}

remove_name_conflict() {
  local container_name="${1:-}"
  local container_id=""

  if [ -z "$container_name" ]; then
    return 0
  fi

  container_id="$(docker ps -aq --filter "name=^/${container_name}$" | head -n 1 || true)"
  if [ -z "$container_id" ]; then
    return 0
  fi

  echo "Removing Docker container that blocks compose name ${container_name}: ${container_id}"
  docker rm -f "$container_id"
}

echo "Validating compose configuration..."
docker compose --env-file .env -f "$COMPOSE_FILE" config >/dev/null

echo "Stopping previous gateway container..."
docker compose --env-file .env -f "$COMPOSE_FILE" down --remove-orphans || true
remove_name_conflict "${CONTAINER_NAME:-$SERVICE_NAME}"

echo "Pulling gateway image..."
docker compose --env-file .env -f "$COMPOSE_FILE" pull "$SERVICE_NAME"

echo "Starting gateway service..."
docker compose --env-file .env -f "$COMPOSE_FILE" up -d --remove-orphans --no-build "$SERVICE_NAME"

echo "Verifying gateway service..."
container_id="$(wait_for_service "$SERVICE_NAME")"
network_mode="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$container_id")"
if [ "$network_mode" != "host" ]; then
  echo "Gateway container must use host networking, got: $network_mode"
  exit 1
fi
if docker port "$container_id" 2>/dev/null | grep -q .; then
  echo "Host-networked gateway must not publish Docker ports."
  docker port "$container_id" || true
  exit 1
fi
wait_for_host_port "$SERVICE_NAME" "$GATEWAY_GRPC_PORT"
echo "Gateway is listening on host gRPC port ${GATEWAY_GRPC_PORT}."

docker compose --env-file .env -f "$COMPOSE_FILE" ps
docker image prune -f

echo "${DEPLOY_ENVIRONMENT_NAME} deployment completed."
REMOTE_SCRIPT

if [ -z "${PUBLIC_GRPC_HOST:-}" ]; then
  echo "PUBLIC_GRPC_HOST is not set; skipping public descriptor check."
elif command -v grpcurl >/dev/null 2>&1; then
  echo "Checking gRPC descriptor on ${DEPLOY_ENVIRONMENT_NAME} endpoint..."
  for attempt in $(seq 1 12); do
    if grpcurl -plaintext "${PUBLIC_GRPC_HOST}:${GRPC_PORT}" describe auth.v1.AuthService 2>/tmp/gateway-grpcurl.err | grep -q 'ResetPassword'; then
      echo "ResetPassword is available through ${DEPLOY_ENVIRONMENT_NAME} gateway."
      exit 0
    fi
    sleep 5
  done
  cat /tmp/gateway-grpcurl.err || true
  echo "ResetPassword was not found on ${DEPLOY_ENVIRONMENT_NAME} gateway."
  exit 1
else
  echo "grpcurl is not installed on the deploy agent; skipping descriptor check."
fi
