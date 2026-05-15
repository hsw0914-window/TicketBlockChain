#!/bin/bash
# 사용법: docker exec cli scripts/installCC.sh ticket

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <chaincode-name>"
  exit 1
fi

CC_NAME=$1

## 체인코드 빌드
echo "체인코드 빌드: $CC_NAME"
cd ./chaincode/${CC_NAME}/go/
go mod tidy
go build .

## 체인코드 패키지화
echo "체인코드 패키지화"
cd /opt/gopath/src/github.com/hyperledger/fabric/peer
peer lifecycle chaincode package ${CC_NAME}.tar.gz \
  --path ./chaincode/${CC_NAME}/go/ \
  --lang golang \
  --label ${CC_NAME}_1

## 설치
echo "Org1 peer0 체인코드 설치"
peer lifecycle chaincode install ${CC_NAME}.tar.gz

## PACKAGE_ID 추출
peer lifecycle chaincode queryinstalled >&log.txt
export PACKAGE_ID=$(sed -n '/Package/{s/^Package ID: //; s/, Label:.*$//; $p;}' log.txt)
echo "packageID=$PACKAGE_ID"

## 승인
echo "체인코드 승인"
peer lifecycle chaincode approveformyorg \
  -o orderer.example.com:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  --channelID channel1 \
  --name ${CC_NAME} \
  --version 1 \
  --package-id $PACKAGE_ID \
  --sequence 1

## 커밋
echo "체인코드 커밋"
peer lifecycle chaincode commit \
  -o orderer.example.com:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  --channelID channel1 \
  --name ${CC_NAME} \
  --peerAddresses peer0.org1.example.com:7051 \
  --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --version 1 \
  --sequence 1

echo "체인코드 배포 완료: $CC_NAME"
