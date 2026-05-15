import { BrowserProvider, Contract, isAddress, parseEther } from "ethers";

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

function getTicketNftAddress(): string {
  const contractAddress = (import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined) || TICKET_NFT_ADDRESS;
  if (!isAddress(contractAddress)) {
    throw new Error("티켓 NFT 컨트랙트 주소가 올바르지 않습니다. VITE_CONTRACT_ADDRESS 설정을 확인해 주세요.");
  }
  return contractAddress;
}

async function assertContractDeployed(provider: BrowserProvider, contractAddress: string): Promise<void> {
  const code = await provider.getCode(contractAddress);
  if (code === "0x") {
    throw new Error("현재 네트워크에서 티켓 NFT 컨트랙트를 찾을 수 없습니다. MetaMask 네트워크를 Hoodi Testnet으로 전환한 뒤 다시 시도해 주세요.");
  }
}

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
  await switchToHoodi();
  const provider = new BrowserProvider(window.ethereum!);
  const contractAddress = getTicketNftAddress();
  await assertContractDeployed(provider, contractAddress);
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
  const tx = await contract.approve(TICKET_MARKETPLACE_ADDRESS, BigInt(tokenId));
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * 판매 등록 step 2: listTicket 호출 (NFT → 에스크로)
 */
export async function listTicketOnMarketplace(tokenId: number, priceWei: bigint): Promise<string> {
  const contract = await getMarketplaceSigner();
  const tx = await contract.listTicket(BigInt(tokenId), priceWei);
  const receipt = await tx.wait();
  return receipt.hash;
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
 * 취소: cancelListing 호출 (NFT → 판매자 반환)
 */
export async function cancelTicketListingOnChain(tokenId: number): Promise<string> {
  const contract = await getMarketplaceSigner();
  const tx = await contract.cancelListing(BigInt(tokenId));
  const receipt = await tx.wait();
  return receipt.hash;
}

// 트랜잭션 전송만 하고 즉시 반환 (블록 확정 대기 없음)
export async function sendTicketNFT(
  params: PurchaseTicketParams,
  nonce?: number,
): Promise<{ txHash: string; waitForConfirm: () => Promise<number | undefined> }> {
  await switchToHoodi();

  const provider = new BrowserProvider(window.ethereum!);
  const signer = await provider.getSigner();

  const contractAddress = getTicketNftAddress();
  await assertContractDeployed(provider, contractAddress);
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
