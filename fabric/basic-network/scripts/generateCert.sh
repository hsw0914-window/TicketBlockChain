#!/bin/bash
# 프로젝트 루트 기준 실행: bash fabric/basic-network/scripts/generateCert.sh
# 바이너리는 fabric/bin/ 에 있어야 합니다 (setup.sh가 자동 다운로드)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$SCRIPT_DIR/.."          # fabric/basic-network
BIN_PATH="$BASE_DIR/../bin"        # fabric/bin

cd "$BASE_DIR"

echo "▶ Org1 인증서 생성..."
"$BIN_PATH/cryptogen" generate \
  --config=./organizations/cryptogen/crypto-config-org1.yaml \
  --output=organizations

echo "▶ Org2 인증서 생성..."
"$BIN_PATH/cryptogen" generate \
  --config=./organizations/cryptogen/crypto-config-org2.yaml \
  --output=organizations

echo "▶ Orderer 인증서 생성..."
"$BIN_PATH/cryptogen" generate \
  --config=./organizations/cryptogen/crypto-config-orderer.yaml \
  --output=organizations

echo "✅ 인증서 생성 완료"
