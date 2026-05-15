/**
 * nftService.js
 * 서버 지갑(MINTER_PRIVATE_KEY)으로 각 NFT 컨트랙트에 온체인 호출
 *
 * 컨트랙트:
 *   FragmentNFT     — 파편(1~99) / 카드(100~) ERC-1155
 *   TicketNFT       — 티켓 ERC-721
 *   BoxNFT          — 랜덤박스 ERC-1155
 *   TicketMarketplace — 티켓 2차 거래 + 수수료
 */

const { ethers } = require('ethers');

const RPC_URL  = 'https://ethereum-hoodi-rpc.publicnode.com';
const PRIV_KEY = process.env.MINTER_PRIVATE_KEY;

// ─── nonce 순차 관리 ────────────────────────────────────────
// 동시 트랜잭션 시 nonce 충돌 방지용 큐
let _provider = null;
let _signer   = null;
let _nonce    = null;
let _nonceLock = Promise.resolve();

function getProvider() {
  if (!_provider) {
    // ENS를 지원하지 않는 네트워크 오류 방지 및 체인 ID 명시
    _provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { staticNetwork: true });
  }
  return _provider;
}

function getSigner() {
  if (!PRIV_KEY) throw new Error('MINTER_PRIVATE_KEY 가 설정되지 않았습니다');
  if (!_signer) _signer = new ethers.Wallet(PRIV_KEY, getProvider());
  return _signer;
}

async function getNextNonce() {
  // 이전 작업이 끝날 때까지 대기 후 순차 실행
  let resolve;
  const prev = _nonceLock;
  _nonceLock = new Promise(r => { resolve = r; });
  await prev;

  try {
    if (_nonce === null) {
      _nonce = await getProvider().getTransactionCount(getSigner().address, 'pending');
    }
    return _nonce++;
  } finally {
    resolve();
  }
}

// ─── FragmentNFT ABI (파편/카드) ────────────────────────────

const FRAGMENT_NFT_ABI = [
  'function mintFragment(address to, uint256 fragmentTypeId, uint256 amount) external',
  'function burnFragment(address from, uint256 fragmentTypeId, uint256 amount) external',
  'function mintCard(address to, uint256 cardTypeId) external',
];

function getFragmentContract() {
  const addr = process.env.FRAGMENT_NFT_ADDRESS;
  if (!addr) throw new Error('FRAGMENT_NFT_ADDRESS 가 설정되지 않았습니다');
  return new ethers.Contract(addr, FRAGMENT_NFT_ABI, getSigner());
}

async function mintFragmentOnChain(toAddress, onchainId) {
  const nonce   = await getNextNonce();
  const tx      = await getFragmentContract().mintFragment(toAddress, BigInt(onchainId), 1n, { nonce });
  const receipt = await tx.wait();
  return receipt.hash;
}

async function burnFragmentOnChain(ownerAddress, onchainId) {
  const nonce   = await getNextNonce();
  const tx      = await getFragmentContract().burnFragment(ownerAddress, BigInt(onchainId), 2n, { nonce });
  const receipt = await tx.wait();
  return receipt.hash;
}

async function mintCardOnChain(toAddress, cardTypeId) {
  const nonce   = await getNextNonce();
  const tx      = await getFragmentContract().mintCard(toAddress, BigInt(cardTypeId), { nonce });
  const receipt = await tx.wait();
  return receipt.hash;
}

// ─── TicketNFT ABI ──────────────────────────────────────────

const TICKET_NFT_ABI = [
  'function mint(address to, tuple(string gameId, string gameDate, string homeTeam, string awayTeam, string seatSection, uint256 originalPrice) p) external returns (uint256)',
  'function markUsed(uint256 tokenId) external',
  'function ownerOf(uint256 tokenId) external view returns (address)',
];

function getTicketContract() {
  const addr = process.env.TICKET_NFT_ADDRESS;
  if (!addr) throw new Error('TICKET_NFT_ADDRESS 가 설정되지 않았습니다');
  return new ethers.Contract(addr, TICKET_NFT_ABI, getSigner());
}

/**
 * 티켓 구매 시 NFT 민팅
 * @returns {{ txHash: string, tokenId: number }}
 */
async function mintTicketOnChain(toAddress, { gameId, gameDate, homeTeam, awayTeam, seatSection, originalPrice }) {
  const contract = getTicketContract();
  const tx = await contract.mint(toAddress, {
    gameId,
    gameDate,
    homeTeam,
    awayTeam,
    seatSection,
    originalPrice: BigInt(Math.round(originalPrice)),
  });
  const receipt = await tx.wait();

  // 이벤트에서 tokenId 추출
  const iface  = new ethers.Interface(['event TicketMinted(address indexed to, uint256 tokenId, string gameId, string seatSection)']);
  let tokenId  = null;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === 'TicketMinted') {
        tokenId = Number(parsed.args.tokenId);
        break;
      }
    } catch { /* 다른 이벤트 무시 */ }
  }

  return { txHash: receipt.hash, tokenId };
}

/**
 * 입장 처리 (QR 확인 후 호출)
 */
async function markTicketUsedOnChain(tokenId) {
  const tx      = await getTicketContract().markUsed(BigInt(tokenId));
  const receipt = await tx.wait();
  return receipt.hash;
}

// ─── BoxNFT ABI ─────────────────────────────────────────────

const BOX_NFT_ABI = [
  'function mint(address to, uint256 boxType, uint256 amount) external',
  'function burn(address from, uint256 boxType, uint256 amount) external',
  'function boxBalance(address account, uint256 boxType) external view returns (uint256)',
];

const SEASON_BOX = 1n;

function getBoxContract() {
  const addr = process.env.BOX_NFT_ADDRESS;
  if (!addr) throw new Error('BOX_NFT_ADDRESS 가 설정되지 않았습니다');
  return new ethers.Contract(addr, BOX_NFT_ABI, getSigner());
}

/**
 * 티켓 구매 보상: 박스 NFT 민팅
 */
async function mintBoxOnChain(toAddress) {
  const nonce   = await getNextNonce();
  const tx      = await getBoxContract().mint(toAddress, SEASON_BOX, 1n, { nonce });
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * 박스 오픈: 박스 NFT 소각
 */
async function burnBoxOnChain(ownerAddress) {
  const nonce   = await getNextNonce();
  const tx      = await getBoxContract().burn(ownerAddress, SEASON_BOX, 1n, { nonce });
  const receipt = await tx.wait();
  return receipt.hash;
}

// ─── TicketMarketplace ABI ───────────────────────────────────

const MARKETPLACE_ABI = [
  'function listTicket(uint256 tokenId, uint256 priceWei) external',
  'function buyTicket(uint256 tokenId) external payable',
  'function cancelListing(uint256 tokenId) external',
  'function getListing(uint256 tokenId) external view returns (tuple(address seller, uint256 priceWei, bool active))',
  'function feeBps() external view returns (uint256)',
];

function getMarketplaceContract() {
  const addr = process.env.TICKET_MARKETPLACE_ADDRESS;
  if (!addr) throw new Error('TICKET_MARKETPLACE_ADDRESS 가 설정되지 않았습니다');
  return new ethers.Contract(addr, MARKETPLACE_ABI, getSigner());
}

/**
 * 티켓 양도 등록 (서버 지갑이 판매자를 대신해 호출 — 단순화)
 * 실제로는 판매자가 MetaMask로 직접 호출해야 하지만,
 * 서버 지갑에게 approve 받은 후 서버가 대신 listTicket 호출하는 방식
 */
async function listTicketOnChain(tokenId, priceWei) {
  const tx      = await getMarketplaceContract().listTicket(BigInt(tokenId), BigInt(priceWei));
  const receipt = await tx.wait();
  return receipt.hash;
}

async function cancelListingOnChain(tokenId) {
  const tx      = await getMarketplaceContract().cancelListing(BigInt(tokenId));
  const receipt = await tx.wait();
  return receipt.hash;
}

module.exports = {
  // Fragment
  mintFragmentOnChain,
  burnFragmentOnChain,
  mintCardOnChain,
  // Ticket
  mintTicketOnChain,
  markTicketUsedOnChain,
  // Box
  mintBoxOnChain,
  burnBoxOnChain,
  // Marketplace
  listTicketOnChain,
  cancelListingOnChain,
  getMarketplaceContract,
};
