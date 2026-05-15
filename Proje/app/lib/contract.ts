import { BrowserProvider, Contract, getAddress, parseEther } from "ethers";

export const HOODI_CHAIN_ID = "0x88BB0"; // 560048 in hex

// ─── 컨트랙트 주소 ─────────────────────────────────────────
export const TICKET_NFT_ADDRESS    = "0x7f5Ecb01153DcF9E6E0bB0d644B4CD8a6a142856";
export const TICKET_MARKETPLACE_ADDRESS = "0x277124B8AB865AD9b1E0E7c7E6BE3Cc8Db8d5F60";

export const HOODI_NETWORK = {
  chainId: HOODI_CHAIN_ID,
  chainName: "Hoodi Testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://ethereum-hoodi-rpc.publicnode.com"],
  blockExplorerUrls: ["https://hoodi.ethpandaops.io"],
};

const TICKET_NFT_ABI = [
  {
    inputs: [
      { internalType: "string", name: "gameId", type: "string" },
      { internalType: "string", name: "stadium", type: "string" },
      { internalType: "string", name: "grade", type: "string" },
      { internalType: "string", name: "blockLabel", type: "string" },
      { internalType: "uint256", name: "row", type: "uint256" },
      { internalType: "uint256", name: "seatNumber", type: "uint256" },
      { internalType: "string", name: "tokenURI", type: "string" },
    ],
    name: "purchaseTicket",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "useTicket",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "gameId", type: "string" },
      { internalType: "string", name: "blockLabel", type: "string" },
      { internalType: "uint256", name: "row", type: "uint256" },
      { internalType: "uint256", name: "seatNumber", type: "uint256" },
    ],
    name: "isSeatTaken",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "buyer", type: "address" },
      { indexed: false, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: false, internalType: "string", name: "gameId", type: "string" },
      { indexed: false, internalType: "string", name: "seatInfo", type: "string" },
    ],
    name: "TicketMinted",
    type: "event",
  },
] as const;

export async function checkSeatTakenOnChain(
  gameId: string,
  blockLabel: string,
  row: number,
  seatNumber: number,
): Promise<boolean> {
  const provider = new BrowserProvider(window.ethereum!);
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS as string;
  const contract = new Contract(contractAddress, TICKET_NFT_ABI, provider);
  return await contract.isSeatTaken(gameId, blockLabel, BigInt(row), BigInt(seatNumber));
}

export async function switchToHoodi(): Promise<void> {
  if (!window.ethereum) throw new Error("MetaMask가 설치되어 있지 않습니다.");

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HOODI_CHAIN_ID }],
    });
  } catch (err: unknown) {
    const switchErr = err as { code?: number };
    if (switchErr.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [HOODI_NETWORK],
      });
    } else {
      throw err;
    }
  }
}

export interface TicketListingSignatureParams {
  ticketId: string;
  gameLabel: string;
  seatSection: string;
  listedPrice: number;
}

/**
 * NFT가 아직 온체인 발급되지 않은 티켓도 판매 등록 의사를 지갑 서명으로 남긴다.
 */
export async function signTicketListingAuthorization(params: TicketListingSignatureParams): Promise<{
  sellerWalletAddress: string;
  listingMessage: string;
  listingSignature: string;
}> {
  if (!window.ethereum) throw new Error("MetaMask가 설치되어 있지 않습니다.");
  await switchToHoodi();

  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const sellerWalletAddress = await signer.getAddress();
  const issuedAt = new Date().toISOString();
  const listingMessage = [
    "BASE CHAIN 티켓 양도 등록 승인",
    "",
    `지갑: ${sellerWalletAddress}`,
    `티켓 ID: ${params.ticketId}`,
    `경기: ${params.gameLabel}`,
    `좌석: ${params.seatSection}`,
    `판매 희망가: ${Math.round(params.listedPrice).toLocaleString("ko-KR")}원`,
    `요청 시각: ${issuedAt}`,
    "",
    "이 서명은 해당 티켓을 BASE CHAIN 공식 재판매 장터에 등록하는 것에 대한 확인입니다.",
  ].join("\n");

  const listingSignature = await signer.signMessage(listingMessage);
  return { sellerWalletAddress, listingMessage, listingSignature };
}

export interface PurchaseTicketParams {
  gameId: string;
  stadium: string;
  grade: string;
  blockLabel: string;
  row: number;
  seatNumber: number;
  priceKrw: number;
}

export function krwToEth(_krw: number): string {
  return "0.01";
}

// ─── KRW ↔ Wei 변환 (1 KRW = 10^9 wei = 1 Gwei) ─────────────
export function krwToWei(krw: number): bigint {
  return BigInt(krw) * BigInt(10 ** 9);
}

export function weiToKrw(wei: bigint): number {
  return Number(wei / BigInt(10 ** 9));
}

// ─── TicketNFT ABI (approve) ──────────────────────────────────
const TICKET_NFT_APPROVE_ABI = [
  "function approve(address to, uint256 tokenId) external",
  "function getApproved(uint256 tokenId) external view returns (address)",
];

// ─── TicketMarketplace ABI ────────────────────────────────────
const MARKETPLACE_ABI_STRINGS = [
  "function listTicket(uint256 tokenId, uint256 priceWei) external",
  "function buyTicket(uint256 tokenId) external payable",
  "function cancelListing(uint256 tokenId) external",
  "function getListing(uint256 tokenId) external view returns (tuple(address seller, uint256 priceWei, bool active) listing)",
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs = 90_000,
  intervalMs = 2_000,
): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return true;
    await delay(intervalMs);
  }
  return false;
}

async function getMarketplaceSigner() {
  if (!window.ethereum) throw new Error("MetaMask가 설치되어 있지 않습니다.");
  await switchToHoodi();
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new Contract(TICKET_MARKETPLACE_ADDRESS, MARKETPLACE_ABI_STRINGS, signer);
}

/**
 * 판매 등록 step 1: 판매자가 Marketplace 에 NFT approve
 */
export async function approveTicketForMarketplace(tokenId: number): Promise<string> {
  if (!window.ethereum) throw new Error("MetaMask가 설치되어 있지 않습니다.");
  await switchToHoodi();
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new Contract(TICKET_NFT_ADDRESS, TICKET_NFT_APPROVE_ABI, signer);
  const token = BigInt(tokenId);
  const isApproved = async () => {
    const approved = await contract.getApproved(token);
    return String(approved).toLowerCase() === TICKET_MARKETPLACE_ADDRESS.toLowerCase();
  };

  if (await isApproved()) {
    return "already-approved";
  }

  const tx = await contract.approve(TICKET_MARKETPLACE_ADDRESS, token);
  const confirmed = await Promise.race([
    tx.wait().then(() => true).catch(() => waitUntil(isApproved)),
    waitUntil(isApproved),
  ]);

  if (!confirmed && !(await isApproved())) {
    throw new Error("MetaMask 승인 트랜잭션 확인 시간이 초과되었습니다. 잠시 후 새로고침해서 다시 시도해주세요.");
  }

  return tx.hash;
}

/**
 * 판매 등록 step 2: listTicket 호출 (NFT → 에스크로)
 */
export async function listTicketOnMarketplace(tokenId: number, priceWei: bigint): Promise<string> {
  const contract = await getMarketplaceSigner();
  const token = BigInt(tokenId);
  const isListed = async () => {
    try {
      const listing = await contract.getListing(token);
      return Boolean(listing?.active);
    } catch {
      return false;
    }
  };

  if (await isListed()) {
    return "already-listed";
  }

  const tx = await contract.listTicket(token, priceWei);
  const confirmed = await Promise.race([
    tx.wait().then(() => true).catch(() => waitUntil(isListed)),
    waitUntil(isListed),
  ]);

  if (!confirmed && !(await isListed())) {
    throw new Error("장터 등록 트랜잭션 확인 시간이 초과되었습니다. MetaMask 활동에서 완료 여부를 확인한 뒤 다시 시도해주세요.");
  }

  return tx.hash;
}

/**
 * 구매: buyTicket 호출 (ETH 전송)
 */
export async function buyTicketFromMarketplace(tokenId: number, priceWei: bigint): Promise<string> {
  const contract = await getMarketplaceSigner();
  const tx = await contract.buyTicket(BigInt(tokenId), { value: priceWei });
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * NFT가 없는 레거시 매물은 Marketplace 컨트랙트가 소유권/정산을 처리할 수 없으므로
 * 구매자가 판매자 지갑으로 직접 결제한 뒤 서버가 트랜잭션을 검증한다.
 */
export async function payLegacyTicketSeller(sellerWalletAddress: string, priceWei: bigint): Promise<string> {
  if (!window.ethereum) throw new Error("MetaMask가 설치되어 있지 않습니다.");
  await switchToHoodi();

  const sellerAddress = getAddress(sellerWalletAddress);
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const tx = await signer.sendTransaction({
    to: sellerAddress,
    value: priceWei,
  });
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("판매자 지갑 결제 트랜잭션이 실패했습니다.");
  }
  return tx.hash;
}

/**
 * 기존 시드/레거시 매물처럼 NFT tokenId가 없는 티켓은 0원 트랜잭션 대신 서명으로 구매 의사를 남긴다.
 * MetaMask의 위험해 보이는 data transaction 경고를 피하고, 서버에서 지갑 서명을 검증한다.
 */
export async function signLegacyTicketPurchase(params: {
  listingId: string;
  gameLabel: string;
  seatSection: string;
  priceKrw: number;
}): Promise<{
  buyerWalletAddress: string;
  legacyBuyMessage: string;
  legacyBuySignature: string;
}> {
  if (!window.ethereum) throw new Error("MetaMask가 설치되어 있지 않습니다.");
  await switchToHoodi();

  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const buyerWalletAddress = await signer.getAddress();
  const legacyBuyMessage = [
    "BASE CHAIN 레거시 티켓 구매 승인",
    "",
    `구매자 지갑: ${buyerWalletAddress}`,
    `매물 ID: ${params.listingId}`,
    `경기: ${params.gameLabel}`,
    `좌석: ${params.seatSection}`,
    `결제 금액: ${Math.round(params.priceKrw).toLocaleString("ko-KR")}원`,
    `요청 시각: ${new Date().toISOString()}`,
    "",
    "이 서명은 NFT 발급 전 레거시 티켓 매물을 BASE CHAIN 장터에서 구매하는 것에 대한 확인입니다.",
  ].join("\n");

  const legacyBuySignature = await signer.signMessage(legacyBuyMessage);
  return { buyerWalletAddress, legacyBuyMessage, legacyBuySignature };
}

/**
 * 취소: cancelListing 호출 (NFT → 판매자 반환)
 */
export async function cancelTicketListingOnChain(tokenId: number): Promise<string | "already-not-listed"> {
  const contract = await getMarketplaceSigner();
  const token = BigInt(tokenId);
  const listing = await contract.getListing(token);
  if (!listing?.active) {
    return "already-not-listed";
  }

  try {
    const tx = await contract.cancelListing(token);
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Marketplace: not listed")) {
      return "already-not-listed";
    }
    throw err;
  }
}

// 트랜잭션 전송만 하고 즉시 반환 (블록 확정 대기 없음)
export async function sendTicketNFT(
  params: PurchaseTicketParams,
  nonce?: number,
): Promise<{ txHash: string; waitForConfirm: () => Promise<number | undefined> }> {
  await switchToHoodi();

  const provider = new BrowserProvider(window.ethereum!);
  const signer = await provider.getSigner();

  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS as string;
  const contract = new Contract(contractAddress, TICKET_NFT_ABI, signer);

  const tokenURI = JSON.stringify({
    name: `KBO Ticket - ${params.gameId}`,
    description: `${params.stadium} ${params.grade} ${params.blockLabel}블록 ${params.row}열 ${params.seatNumber}번`,
    attributes: [
      { trait_type: "Game ID", value: params.gameId },
      { trait_type: "Stadium", value: params.stadium },
      { trait_type: "Grade", value: params.grade },
      { trait_type: "Block", value: params.blockLabel },
      { trait_type: "Row", value: params.row },
      { trait_type: "Seat", value: params.seatNumber },
      { trait_type: "Price (KRW)", value: params.priceKrw },
    ],
  });

  const ethAmount = krwToEth(params.priceKrw);
  const value = parseEther(ethAmount);

  // 외부에서 nonce를 넘기지 않으면 네트워크에서 조회
  const resolvedNonce = nonce ?? await provider.getTransactionCount(await signer.getAddress(), "pending");

  const tx = await contract.purchaseTicket(
    params.gameId,
    params.stadium,
    params.grade,
    params.blockLabel,
    BigInt(params.row),
    BigInt(params.seatNumber),
    tokenURI,
    { value, nonce: resolvedNonce },
  );

  const txHash: string = tx.hash;

  // 블록 확정 대기는 호출자가 원할 때 실행
  const waitForConfirm = async (): Promise<number | undefined> => {
    const receipt = await tx.wait();
    let tokenId: number | undefined;
    if (receipt?.logs) {
      const iface = contract.interface;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
          if (parsed?.name === "TicketMinted") {
            tokenId = Number(parsed.args.tokenId);
          }
        } catch { /* 다른 컨트랙트 이벤트 무시 */ }
      }
    }
    return tokenId;
  };

  return { txHash, waitForConfirm };
}

export async function mintTicketNFT(
  params: PurchaseTicketParams,
): Promise<{ txHash: string; tokenId?: number }> {
  const { txHash, waitForConfirm } = await sendTicketNFT(params);
  const tokenId = await waitForConfirm();
  return { txHash, tokenId };
}
