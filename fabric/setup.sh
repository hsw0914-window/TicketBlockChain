#!/bin/bash
# =============================================================
# TicketBlockChain — Hyperledger Fabric 원클릭 초기화 스크립트
# Ubuntu 22.04 LTS 기준
#
# 사용법:
#   cd /path/to/TicketBlockChain
#   bash fabric/setup.sh [--reset]
#
#   --reset : 기존 네트워크/인증서/원장 완전 초기화 후 재시작
# =============================================================

set -e

RESET=false
for arg in "$@"; do
  [ "$arg" = "--reset" ] && RESET=true
done

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FABRIC_DIR="$PROJECT_ROOT/fabric"
BASIC_NET="$FABRIC_DIR/basic-network"
BIN_DIR="$FABRIC_DIR/bin"
SCRIPTS="$BASIC_NET/scripts"
DOCKER_DIR="$BASIC_NET/docker"
APP_DIR="$FABRIC_DIR/application"

IMAGE_TAG="2.5.4"
CA_IMAGE_TAG="1.5.7"
export IMAGE_TAG CA_IMAGE_TAG
export COMPOSE_PROJECT_NAME=fabric
export FABRIC_CFG_PATH="$BASIC_NET/configtx"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   TicketBlockChain  Fabric Setup                ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── 0. 의존성 확인 ────────────────────────────────────────
echo "[ 0/7 ] 의존성 확인..."
for cmd in docker docker-compose go node; do
  if ! command -v $cmd &>/dev/null; then
    echo "❌ '$cmd' 이 설치되어 있지 않습니다."
    echo "   sudo apt-get install -y docker.io docker-compose golang-go nodejs npm"
    exit 1
  fi
done
echo "✅ docker, go, node 확인됨"

# ─── 1. Fabric 바이너리 다운로드 ──────────────────────────
echo ""
echo "[ 1/7 ] Fabric 바이너리 확인..."
if [ ! -f "$BIN_DIR/peer" ]; then
  echo "▶ fabric-samples 바이너리 다운로드 (v${IMAGE_TAG})..."
  mkdir -p "$BIN_DIR"
  TMPDIR=$(mktemp -d)
  curl -sSL https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh \
    | bash -s -- --fabric-version "$IMAGE_TAG" --ca-version "$CA_IMAGE_TAG" binary
  mv bin/* "$BIN_DIR/" 2>/dev/null || true
  rm -rf "$TMPDIR"
  echo "✅ 바이너리 다운로드 완료"
else
  echo "✅ 바이너리 이미 존재 ($BIN_DIR/peer)"
fi
export PATH="$BIN_DIR:$PATH"

# ─── 2. 기존 네트워크 정리 (--reset 또는 최초) ─────────────
if $RESET || [ ! -d "$BASIC_NET/organizations/peerOrganizations" ]; then
  echo ""
  echo "[ 2/7 ] 기존 네트워크 정리..."
  cd "$DOCKER_DIR"
  docker-compose -f docker-compose-test-net.yaml down --volumes --remove-orphans 2>/dev/null || true
  rm -rf "$BASIC_NET/organizations/peerOrganizations"
  rm -rf "$BASIC_NET/organizations/ordererOrganizations"
  rm -rf "$BASIC_NET/system-genesis-block"
  rm -rf "$BASIC_NET/channel-artifacts"
  rm -rf "$APP_DIR/wallet"
  echo "✅ 정리 완료"
fi

# ─── 3. 인증서 생성 ────────────────────────────────────────
echo ""
echo "[ 3/7 ] 인증서 생성 (cryptogen)..."
bash "$SCRIPTS/generateCert.sh"

# ─── 4. 채널 아티팩트 생성 ────────────────────────────────
echo ""
echo "[ 4/7 ] 제네시스 블록 + 채널 트랜잭션 생성..."
bash "$SCRIPTS/createConfigtxgen.sh"

# ─── 5. Docker 컨테이너 기동 ──────────────────────────────
echo ""
echo "[ 5/7 ] Docker 컨테이너 기동 (orderer, peer, ca, cli)..."
cd "$DOCKER_DIR"
docker-compose -f docker-compose-test-net.yaml up -d
echo "▶ 컨테이너 안정화 대기 (5초)..."
sleep 5
docker ps --format "table {{.Names}}\t{{.Status}}"

# ─── 6. 채널 생성 + 조인 + 체인코드 배포 ──────────────────
echo ""
echo "[ 6/7 ] 채널 생성 / 조인 / 앵커피어 업데이트..."
docker exec cli bash scripts/joinChannel.sh createChannel
docker exec cli bash scripts/joinChannel.sh joinChannel
docker exec cli bash scripts/joinChannel.sh updateAnchor

echo ""
echo "▶ 체인코드 배포 (ticket)..."
docker exec cli bash scripts/installCC.sh ticket

# ─── 7. SDK 등록 (enrollAdmin + registerUser) ─────────────
echo ""
echo "[ 7/7 ] Fabric CA 사용자 등록..."
bash "$SCRIPTS/updateConnection.sh"
cd "$APP_DIR"
npm install --silent 2>/dev/null || true
node sdk/enrollAdmin.js
node sdk/registUser.js

# ─── 완료 ─────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ Fabric 네트워크 초기화 완료!                ║"
echo "║                                                  ║"
echo "║  서버 실행 전 .env 수정:                        ║"
echo "║    FABRIC_MODE=real                              ║"
echo "║                                                  ║"
echo "║  서버 재시작:                                    ║"
echo "║    cd server && node index.js                   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
