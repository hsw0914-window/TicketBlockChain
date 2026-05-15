require('dotenv').config();
const { mintFragmentOnChain } = require('./services/nftService');

async function testMint() {
  // 1. 테스트할 지갑 주소를 입력하세요 (본인의 메타마스크 주소)
  const targetAddress = "0x90300d4c4C270B265AF482df32660Bd95a93A580"; 
  
  // 2. 응모권 NFT의 온체인 ID (init.js에서 99로 설정됨)
  const onchainId = 99; 

  console.log(`[Test] NFT 발급 시도 중...`);
  console.log(`- 대상 주소: ${targetAddress}`);
  console.log(`- NFT ID: ${onchainId}`);

  try {
    const txHash = await mintFragmentOnChain(targetAddress, onchainId);
    
    console.log(`\n✅ 발급 성공!`);
    console.log(`🔗 트랜잭션 해시: ${txHash}`);
    console.log(`🔍 확인 주소: https://explorer.hoodi.ethpandaops.io/tx/${txHash}`);
  } catch (error) {
    console.error(`\n❌ 발급 실패!`);
    console.error(`에러 내용:`, error.message);
  }
}

if (require.main === module) {
  testMint();
}