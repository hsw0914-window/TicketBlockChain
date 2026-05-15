package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strings"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// ─── 데이터 구조체 ─────────────────────────────────────────

type TicketRecord struct {
	TicketId      string  `json:"ticketId"`
	TokenId       string  `json:"tokenId"`
	GameId        string  `json:"gameId"`
	SeatId        string  `json:"seatId"`
	UserDidHash   string  `json:"userDidHash"`
	WalletAddress string  `json:"walletAddress"`
	Status        string  `json:"status"` // ACTIVE, USED, REFUND_PROCESSING, REFUNDED
	PurchaseType  string  `json:"purchaseType"` // PRIMARY, TRANSFERRED
	Price         float64 `json:"price"`
	PointUsed     float64 `json:"pointUsed"`
	GameDate      string  `json:"gameDate"` // YYYY-MM-DD
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

type PointRecord struct {
	UserDidHash   string  `json:"userDidHash"`
	Balance       float64 `json:"balance"`
	TotalEarned   float64 `json:"totalEarned"`
	TotalUsed     float64 `json:"totalUsed"`
	LastUpdatedAt string  `json:"lastUpdatedAt"`
}

type MembershipRecord struct {
	UserDidHash                 string `json:"userDidHash"`
	Grade                       string `json:"grade"` // BASIC, BRONZE, SILVER, GOLD
	EntryCount                  int    `json:"entryCount"`
	MonthlyRaffleExchangeCount  int    `json:"monthlyRaffleExchangeCount"`
	MonthlyCardExchangeCount    int    `json:"monthlyCardExchangeCount"`
	LastResetMonth              string `json:"lastResetMonth"`
	UpdatedAt                   string `json:"updatedAt"`
}

type RefundRecord struct {
	RefundId      string  `json:"refundId"`
	TicketId      string  `json:"ticketId"`
	PurchaseType  string  `json:"purchaseType"`
	RefundRate    float64 `json:"refundRate"`
	OriginalPrice float64 `json:"originalPrice"`
	RefundReason  string  `json:"refundReason"`
	RefundAmount  float64 `json:"refundAmount"`
	RefundStatus  string  `json:"refundStatus"` // PROCESSING, COMPLETED, REJECTED
	RequestedAt   string  `json:"requestedAt"`
	CompletedAt   string  `json:"completedAt"`
}

type ExchangeRecord struct {
	ExchangeId  string  `json:"exchangeId"`
	UserDidHash string  `json:"userDidHash"`
	ItemType    string  `json:"itemType"` // RAFFLE_NFT, CARD_NFT
	PointUsed   float64 `json:"pointUsed"`
	Status      string  `json:"status"`
	RequestedAt string  `json:"requestedAt"`
}

type SettlementRecord struct {
	SettlementId     string  `json:"settlementId"`
	GameId           string  `json:"gameId"`
	TotalSales       float64 `json:"totalSales"`
	RefundAmount     float64 `json:"refundAmount"`
	PointUsedAmount  float64 `json:"pointUsedAmount"`
	PlatformFee      float64 `json:"platformFee"`
	ClubRevenue      float64 `json:"clubRevenue"`
	SettlementStatus string  `json:"settlementStatus"`
	CreatedAt        string  `json:"createdAt"`
}

type RaffleNFTRecord struct {
	RaffleNftId string `json:"raffleNftId"`
	UserDidHash string `json:"userDidHash"`
	GameId      string `json:"gameId"`
	Status      string `json:"status"` // ISSUED, ENTERED, WINNER, LOST, USED, EXPIRED
	DrawId      string `json:"drawId"`
	IssuedAt    string `json:"issuedAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type DrawRecord struct {
	DrawId       string `json:"drawId"`
	GameId       string `json:"gameId"`
	Status       string `json:"status"` // PENDING, COMPLETED
	WinnerCount  int    `json:"winnerCount"`
	TotalEntries int    `json:"totalEntries"`
	ExecutedAt   string `json:"executedAt"`
	CreatedAt    string `json:"createdAt"`
}

type ReservationRecord struct {
	ReservationId string `json:"reservationId"`
	UserDidHash   string `json:"userDidHash"`
	GameId        string `json:"gameId"`
	RaffleNftId   string `json:"raffleNftId"`
	IsPriority    bool   `json:"isPriority"`
	TicketId      string `json:"ticketId"`
	Status        string `json:"status"` // PENDING, CONFIRMED, CANCELLED, EXPIRED
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

// ─── 체인코드 구조체 ───────────────────────────────────────

type TicketChaincode struct {
	contractapi.Contract
}

// ─── 키 헬퍼 ──────────────────────────────────────────────

const (
	keyPrefixTicket      = "TICKET:"
	keyPrefixPoint       = "POINT:"
	keyPrefixMembership  = "MEMBERSHIP:"
	keyPrefixRefund      = "REFUND:"
	keyPrefixExchange    = "EXCHANGE:"
	keyPrefixSettlement  = "SETTLEMENT:"
	keyPrefixRaffleNFT   = "RAFFLE_NFT:"
	keyPrefixDraw        = "DRAW:"
	keyPrefixReservation = "RESERVATION:"
)

func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func currentMonth() string {
	return time.Now().UTC().Format("2006-01")
}

func hashDid(walletAddress string) string {
	h := sha256.Sum256([]byte(strings.ToLower(walletAddress)))
	return fmt.Sprintf("%x", h)
}

func calcGrade(entryCount int) string {
	if entryCount >= 10 { return "GOLD" }
	if entryCount >= 6  { return "SILVER" }
	if entryCount >= 3  { return "BRONZE" }
	return "BASIC"
}

func getEarnRate(grade string) float64 {
	rates := map[string]float64{"BASIC": 0.005, "BRONZE": 0.007, "SILVER": 0.010, "GOLD": 0.015}
	if r, ok := rates[grade]; ok { return r }
	return 0.005
}

func exchangeCost(itemType string) (float64, error) {
	costs := map[string]float64{"RAFFLE_NFT": 1500, "CARD_NFT": 5000}
	if c, ok := costs[itemType]; ok { return c, nil }
	return 0, fmt.Errorf("INVALID_ITEM_TYPE: %s", itemType)
}

func exchangeMonthlyLimit(grade, itemType string) int {
	limits := map[string]map[string]int{
		"BASIC":  {"RAFFLE_NFT": 1, "CARD_NFT": 1},
		"BRONZE": {"RAFFLE_NFT": 1, "CARD_NFT": 1},
		"SILVER": {"RAFFLE_NFT": 2, "CARD_NFT": 1},
		"GOLD":   {"RAFFLE_NFT": 2, "CARD_NFT": 2},
	}
	if m, ok := limits[grade]; ok {
		if v, ok2 := m[itemType]; ok2 { return v }
	}
	return 1
}

// ─── 원장 조회/저장 헬퍼 ─────────────────────────────────

func getTicketRecord(ctx contractapi.TransactionContextInterface, ticketId string) (*TicketRecord, error) {
	b, err := ctx.GetStub().GetState(keyPrefixTicket + ticketId)
	if err != nil { return nil, err }
	if b == nil   { return nil, nil }
	var r TicketRecord
	if err = json.Unmarshal(b, &r); err != nil { return nil, err }
	return &r, nil
}

func putTicketRecord(ctx contractapi.TransactionContextInterface, r *TicketRecord) error {
	r.UpdatedAt = nowISO()
	b, err := json.Marshal(r)
	if err != nil { return err }
	return ctx.GetStub().PutState(keyPrefixTicket+r.TicketId, b)
}

func getOrCreatePoint(ctx contractapi.TransactionContextInterface, userDidHash string) (*PointRecord, error) {
	b, err := ctx.GetStub().GetState(keyPrefixPoint + userDidHash)
	if err != nil { return nil, err }
	if b == nil {
		return &PointRecord{UserDidHash: userDidHash, LastUpdatedAt: nowISO()}, nil
	}
	var r PointRecord
	if err = json.Unmarshal(b, &r); err != nil { return nil, err }
	return &r, nil
}

func putPoint(ctx contractapi.TransactionContextInterface, r *PointRecord) error {
	r.LastUpdatedAt = nowISO()
	b, err := json.Marshal(r)
	if err != nil { return err }
	return ctx.GetStub().PutState(keyPrefixPoint+r.UserDidHash, b)
}

func getOrCreateMembership(ctx contractapi.TransactionContextInterface, userDidHash string) (*MembershipRecord, error) {
	b, err := ctx.GetStub().GetState(keyPrefixMembership + userDidHash)
	if err != nil { return nil, err }
	if b == nil {
		return &MembershipRecord{
			UserDidHash:    userDidHash,
			Grade:          "BASIC",
			LastResetMonth: currentMonth(),
			UpdatedAt:      nowISO(),
		}, nil
	}
	var r MembershipRecord
	if err = json.Unmarshal(b, &r); err != nil { return nil, err }
	return &r, nil
}

func putMembership(ctx contractapi.TransactionContextInterface, r *MembershipRecord) error {
	r.UpdatedAt = nowISO()
	b, err := json.Marshal(r)
	if err != nil { return err }
	return ctx.GetStub().PutState(keyPrefixMembership+r.UserDidHash, b)
}

// ─── 1. RegisterTicket ────────────────────────────────────

func (t *TicketChaincode) RegisterTicket(
	ctx contractapi.TransactionContextInterface,
	ticketId, tokenId, gameId, seatId, walletAddress, purchaseType, gameDate string,
	price float64,
) error {
	existing, err := getTicketRecord(ctx, ticketId)
	if err != nil { return err }
	if existing != nil { return fmt.Errorf("TICKET_ALREADY_EXISTS: %s", ticketId) }

	if purchaseType == "" { purchaseType = "PRIMARY" }

	r := &TicketRecord{
		TicketId:      ticketId,
		TokenId:       tokenId,
		GameId:        gameId,
		SeatId:        seatId,
		UserDidHash:   hashDid(walletAddress),
		WalletAddress: strings.ToLower(walletAddress),
		Status:        "ACTIVE",
		PurchaseType:  purchaseType,
		Price:         price,
		GameDate:      gameDate,
		CreatedAt:     nowISO(),
		UpdatedAt:     nowISO(),
	}
	return putTicketRecord(ctx, r)
}

// ─── 2. VerifyEntry ───────────────────────────────────────

type VerifyEntryResult struct {
	Allowed         bool    `json:"allowed"`
	Reason          string  `json:"reason"`
	EntryId         string  `json:"entryId"`
	EarnedPoint     float64 `json:"earnedPoint"`
	MembershipGrade string  `json:"membershipGrade"`
}

func (t *TicketChaincode) VerifyEntry(
	ctx contractapi.TransactionContextInterface,
	ticketId, gateId string,
) (string, error) {
	ticket, err := getTicketRecord(ctx, ticketId)
	if err != nil { return "", err }
	if ticket == nil {
		r, _ := json.Marshal(VerifyEntryResult{Allowed: false, Reason: "TICKET_NOT_FOUND"})
		return string(r), nil
	}
	if ticket.Status == "USED" {
		r, _ := json.Marshal(VerifyEntryResult{Allowed: false, Reason: "ALREADY_USED"})
		return string(r), nil
	}
	if ticket.Status != "ACTIVE" {
		r, _ := json.Marshal(VerifyEntryResult{Allowed: false, Reason: "INVALID_STATUS:" + ticket.Status})
		return string(r), nil
	}

	// 상태 변경
	ticket.Status = "USED"
	if err = putTicketRecord(ctx, ticket); err != nil { return "", err }

	// 포인트 적립
	point, err := getOrCreatePoint(ctx, ticket.UserDidHash)
	if err != nil { return "", err }
	membership, err := getOrCreateMembership(ctx, ticket.UserDidHash)
	if err != nil { return "", err }

	earnedPoint := math.Floor(ticket.Price * getEarnRate(membership.Grade))
	point.Balance      += earnedPoint
	point.TotalEarned  += earnedPoint
	if err = putPoint(ctx, point); err != nil { return "", err }

	// 멤버십 갱신
	membership.EntryCount += 1
	membership.Grade       = calcGrade(membership.EntryCount)
	if err = putMembership(ctx, membership); err != nil { return "", err }

	txId := ctx.GetStub().GetTxID()
	res := VerifyEntryResult{
		Allowed:         true,
		EntryId:         "entry-" + txId[:12],
		EarnedPoint:     earnedPoint,
		MembershipGrade: membership.Grade,
	}
	out, _ := json.Marshal(res)
	return string(out), nil
}

// ─── 3. UsePointForTicket ─────────────────────────────────

func (t *TicketChaincode) UsePointForTicket(
	ctx contractapi.TransactionContextInterface,
	userDidHash, ticketId string,
	pointAmount float64,
) error {
	if pointAmount < 1000 {
		return fmt.Errorf("MIN_POINT_1000: 최소 1,000P 이상 사용 가능")
	}
	point, err := getOrCreatePoint(ctx, userDidHash)
	if err != nil { return err }
	if point.Balance < pointAmount {
		return fmt.Errorf("INSUFFICIENT_POINT: 잔액 %.0f P, 요청 %.0f P", point.Balance, pointAmount)
	}

	point.Balance   -= pointAmount
	point.TotalUsed += pointAmount
	if err = putPoint(ctx, point); err != nil { return err }

	if ticketId != "" {
		ticket, err2 := getTicketRecord(ctx, ticketId)
		if err2 == nil && ticket != nil {
			ticket.PointUsed = pointAmount
			_ = putTicketRecord(ctx, ticket)
		}
	}
	return nil
}

// ─── 4. ExchangePointItem ────────────────────────────────

func (t *TicketChaincode) ExchangePointItem(
	ctx contractapi.TransactionContextInterface,
	userDidHash, itemType string,
) (string, error) {
	cost, err := exchangeCost(itemType)
	if err != nil { return "", err }

	point, err := getOrCreatePoint(ctx, userDidHash)
	if err != nil { return "", err }
	if point.Balance < cost {
		return "", fmt.Errorf("INSUFFICIENT_POINT: 잔액 %.0f P, 필요 %.0f P", point.Balance, cost)
	}

	membership, err := getOrCreateMembership(ctx, userDidHash)
	if err != nil { return "", err }

	// 월 초기화
	if membership.LastResetMonth != currentMonth() {
		membership.MonthlyRaffleExchangeCount = 0
		membership.MonthlyCardExchangeCount   = 0
		membership.LastResetMonth             = currentMonth()
	}

	limit := exchangeMonthlyLimit(membership.Grade, itemType)
	if itemType == "RAFFLE_NFT" && membership.MonthlyRaffleExchangeCount >= limit {
		return "", fmt.Errorf("EXCHANGE_LIMIT_EXCEEDED: 이번 달 응모권 NFT 교환 횟수 초과")
	}
	if itemType == "CARD_NFT" && membership.MonthlyCardExchangeCount >= limit {
		return "", fmt.Errorf("EXCHANGE_LIMIT_EXCEEDED: 이번 달 실물 NFT 카드 교환 횟수 초과")
	}

	point.Balance   -= cost
	point.TotalUsed += cost
	if err = putPoint(ctx, point); err != nil { return "", err }

	if itemType == "RAFFLE_NFT" { membership.MonthlyRaffleExchangeCount++ }
	if itemType == "CARD_NFT"   { membership.MonthlyCardExchangeCount++ }
	if err = putMembership(ctx, membership); err != nil { return "", err }

	exchangeId := "exchange-" + ctx.GetStub().GetTxID()[:12]
	rec := ExchangeRecord{
		ExchangeId:  exchangeId,
		UserDidHash: userDidHash,
		ItemType:    itemType,
		PointUsed:   cost,
		Status:      "MINT_REQUESTED",
		RequestedAt: nowISO(),
	}
	b, _ := json.Marshal(rec)
	if err = ctx.GetStub().PutState(keyPrefixExchange+exchangeId, b); err != nil { return "", err }

	out, _ := json.Marshal(map[string]interface{}{
		"exchangeId":       exchangeId,
		"itemType":         itemType,
		"pointUsed":        cost,
		"remainingBalance": point.Balance,
		"status":           "MINT_REQUESTED",
	})
	return string(out), nil
}

// ─── 환불율 계산 (날짜 기준) ─────────────────────────────
// TRANSFERRED: 항상 0%
// PRIMARY: 7일 이상=100%, 3일 이상=90%, 1일 이상=80%, 당일/이후=0%

func calcRefundRate(gameDateStr, purchaseType string) float64 {
	if purchaseType == "TRANSFERRED" { return 0 }
	if gameDateStr == "" { return 100 }
	now  := time.Now().UTC().Truncate(24 * time.Hour)
	game, err := time.Parse("2006-01-02", gameDateStr)
	if err != nil { return 100 }
	game = game.UTC().Truncate(24 * time.Hour)
	days := int(game.Sub(now).Hours() / 24)

	if days >= 7 { return 100 }
	if days >= 3 { return 90 }
	if days >= 1 { return 80 }
	return 0
}

// ─── 5. RequestRefund ────────────────────────────────────

func (t *TicketChaincode) RequestRefund(
	ctx contractapi.TransactionContextInterface,
	ticketId, refundReason string,
) (string, error) {
	ticket, err := getTicketRecord(ctx, ticketId)
	if err != nil { return "", err }
	if ticket == nil { return "", fmt.Errorf("TICKET_NOT_FOUND: %s", ticketId) }
	if ticket.Status == "USED"              { return "", fmt.Errorf("REFUND_DENIED: 입장 완료된 티켓 환불 불가") }
	if ticket.Status == "REFUNDED"          { return "", fmt.Errorf("ALREADY_REFUNDED") }
	if ticket.Status == "REFUND_PROCESSING" { return "", fmt.Errorf("REFUND_ALREADY_PROCESSING") }

	rate := calcRefundRate(ticket.GameDate, ticket.PurchaseType)
	if rate == 0 { return "", fmt.Errorf("REFUND_DENIED: 환불 불가 기간입니다") }

	baseAmount   := ticket.Price - ticket.PointUsed
	refundAmount := math.Floor(baseAmount * rate / 100)

	ticket.Status = "REFUND_PROCESSING"
	if err = putTicketRecord(ctx, ticket); err != nil { return "", err }

	refundId := "refund-" + ctx.GetStub().GetTxID()[:12]
	rec := RefundRecord{
		RefundId:      refundId,
		TicketId:      ticketId,
		PurchaseType:  ticket.PurchaseType,
		RefundRate:    rate,
		OriginalPrice: ticket.Price,
		RefundReason:  refundReason,
		RefundAmount:  refundAmount,
		RefundStatus:  "PROCESSING",
		RequestedAt:   nowISO(),
	}

	// 자동 완료 처리
	ticket.Status    = "REFUNDED"
	if err = putTicketRecord(ctx, ticket); err != nil { return "", err }
	rec.RefundStatus = "COMPLETED"
	rec.CompletedAt  = nowISO()

	b, _ := json.Marshal(rec)
	if err = ctx.GetStub().PutState(keyPrefixRefund+refundId, b); err != nil { return "", err }

	out, _ := json.Marshal(map[string]interface{}{
		"refundId":      refundId,
		"ticketId":      ticketId,
		"refundRate":    rate,
		"refundAmount":  refundAmount,
		"purchaseType":  ticket.PurchaseType,
		"status":        "COMPLETED",
	})
	return string(out), nil
}

// ─── 6. CancelGameRefundAll ──────────────────────────────

func (t *TicketChaincode) CancelGameRefundAll(
	ctx contractapi.TransactionContextInterface,
	gameId string,
) (string, error) {
	// 경기 취소: 해당 gameId의 ACTIVE 티켓 전부 100% 환불
	// Rich Query가 필요하므로 CouchDB 환경에서는 GetQueryResult 사용 권장
	// 여기서는 ticketId 목록을 인자로 받는 방식 대신 이벤트 기반으로 처리
	// Phase 2에서 CouchDB 연동 시 selector query로 교체 예정
	_ = gameId
	return `{"message":"CancelGameRefundAll: use individual RequestRefund per ticket"}`, nil
}

// ─── 7. EarnPointFromTrade ───────────────────────────────
// 판매자 포인트 적립: 티켓 양도 0.3%, 굿즈/파편 장터 0.1%

func (t *TicketChaincode) EarnPointFromTrade(
	ctx contractapi.TransactionContextInterface,
	userDidHash string,
	amount, rate float64,
) (string, error) {
	earnedPoint := math.Floor(amount * rate)
	if earnedPoint <= 0 {
		point, _ := getOrCreatePoint(ctx, userDidHash)
		out, _ := json.Marshal(map[string]interface{}{"earnedPoint": 0, "balance": point.Balance})
		return string(out), nil
	}

	point, err := getOrCreatePoint(ctx, userDidHash)
	if err != nil { return "", err }
	point.Balance     += earnedPoint
	point.TotalEarned += earnedPoint
	if err = putPoint(ctx, point); err != nil { return "", err }

	out, _ := json.Marshal(map[string]interface{}{
		"earnedPoint": earnedPoint,
		"balance":     point.Balance,
	})
	return string(out), nil
}

// ─── 9. CreateSettlement ────────────────────────────────

func (t *TicketChaincode) CreateSettlement(
	ctx contractapi.TransactionContextInterface,
	gameId string,
	totalSales, refundAmount, pointUsedAmount float64,
) (string, error) {
	platformFee  := math.Floor(totalSales * 0.03)
	clubRevenue  := totalSales - refundAmount - pointUsedAmount - platformFee
	settlementId := "settlement-" + ctx.GetStub().GetTxID()[:12]

	rec := SettlementRecord{
		SettlementId:     settlementId,
		GameId:           gameId,
		TotalSales:       totalSales,
		RefundAmount:     refundAmount,
		PointUsedAmount:  pointUsedAmount,
		PlatformFee:      platformFee,
		ClubRevenue:      clubRevenue,
		SettlementStatus: "DRAFT",
		CreatedAt:        nowISO(),
	}
	b, _ := json.Marshal(rec)
	if err := ctx.GetStub().PutState(keyPrefixSettlement+settlementId, b); err != nil { return "", err }

	out, _ := json.Marshal(rec)
	return string(out), nil
}

// ─── 10. 조회 함수 ───────────────────────────────────────

func (t *TicketChaincode) GetTicket(
	ctx contractapi.TransactionContextInterface,
	ticketId string,
) (string, error) {
	ticket, err := getTicketRecord(ctx, ticketId)
	if err != nil { return "", err }
	if ticket == nil { return "", fmt.Errorf("TICKET_NOT_FOUND: %s", ticketId) }
	out, _ := json.Marshal(ticket)
	return string(out), nil
}

func (t *TicketChaincode) GetPointBalance(
	ctx contractapi.TransactionContextInterface,
	userDidHash string,
) (string, error) {
	point, err := getOrCreatePoint(ctx, userDidHash)
	if err != nil { return "", err }
	out, _ := json.Marshal(point)
	return string(out), nil
}

func (t *TicketChaincode) GetMembership(
	ctx contractapi.TransactionContextInterface,
	userDidHash string,
) (string, error) {
	membership, err := getOrCreateMembership(ctx, userDidHash)
	if err != nil { return "", err }
	out, _ := json.Marshal(membership)
	return string(out), nil
}

// ─── 11. RegisterRaffleNFT ───────────────────────────────

func (t *TicketChaincode) RegisterRaffleNFT(
	ctx contractapi.TransactionContextInterface,
	raffleNftId, userDidHash, gameId string,
) error {
	b, err := ctx.GetStub().GetState(keyPrefixRaffleNFT + raffleNftId)
	if err != nil { return err }
	if b != nil { return fmt.Errorf("RAFFLE_NFT_ALREADY_EXISTS: %s", raffleNftId) }

	rec := RaffleNFTRecord{
		RaffleNftId: raffleNftId,
		UserDidHash: userDidHash,
		GameId:      gameId,
		Status:      "ISSUED",
		IssuedAt:    nowISO(),
		UpdatedAt:   nowISO(),
	}
	rb, _ := json.Marshal(rec)
	if err = ctx.GetStub().PutState(keyPrefixRaffleNFT+raffleNftId, rb); err != nil { return err }

	// composite key for user index
	ck, err := ctx.GetStub().CreateCompositeKey("RAFFLE_NFT_USER", []string{userDidHash, raffleNftId})
	if err != nil { return err }
	return ctx.GetStub().PutState(ck, []byte{0x00})
}

// ─── 12. EnterDraw ───────────────────────────────────────

func (t *TicketChaincode) EnterDraw(
	ctx contractapi.TransactionContextInterface,
	raffleNftId, userDidHash, drawId string,
) error {
	rb, err := ctx.GetStub().GetState(keyPrefixRaffleNFT + raffleNftId)
	if err != nil { return err }
	if rb == nil { return fmt.Errorf("RAFFLE_NFT_NOT_FOUND: %s", raffleNftId) }

	var raffle RaffleNFTRecord
	if err = json.Unmarshal(rb, &raffle); err != nil { return err }
	if raffle.UserDidHash != userDidHash { return fmt.Errorf("NOT_OWNER") }
	if raffle.Status != "ISSUED" { return fmt.Errorf("RAFFLE_NFT_ALREADY_USED: %s", raffle.Status) }

	raffle.Status    = "ENTERED"
	raffle.DrawId    = drawId
	raffle.UpdatedAt = nowISO()
	rb2, _ := json.Marshal(raffle)
	if err = ctx.GetStub().PutState(keyPrefixRaffleNFT+raffleNftId, rb2); err != nil { return err }

	// update draw entry count
	db, err := ctx.GetStub().GetState(keyPrefixDraw + drawId)
	if err != nil { return err }
	if db != nil {
		var draw DrawRecord
		if err = json.Unmarshal(db, &draw); err != nil { return err }
		draw.TotalEntries++
		db2, _ := json.Marshal(draw)
		_ = ctx.GetStub().PutState(keyPrefixDraw+drawId, db2)
	}
	return nil
}

// ─── 13. CreateDraw ──────────────────────────────────────

func (t *TicketChaincode) CreateDraw(
	ctx contractapi.TransactionContextInterface,
	drawId, gameId string,
	winnerCount int,
) error {
	rec := DrawRecord{
		DrawId:      drawId,
		GameId:      gameId,
		Status:      "PENDING",
		WinnerCount: winnerCount,
		CreatedAt:   nowISO(),
	}
	b, _ := json.Marshal(rec)
	return ctx.GetStub().PutState(keyPrefixDraw+drawId, b)
}

// ─── 14. ExecuteDraw ─────────────────────────────────────
// 결정론적 추첨: TxID 해시 기반으로 당첨자 선발

func (t *TicketChaincode) ExecuteDraw(
	ctx contractapi.TransactionContextInterface,
	drawId string,
	entryIdsJSON string,
) (string, error) {
	db, err := ctx.GetStub().GetState(keyPrefixDraw + drawId)
	if err != nil { return "", err }
	if db == nil { return "", fmt.Errorf("DRAW_NOT_FOUND: %s", drawId) }

	var draw DrawRecord
	if err = json.Unmarshal(db, &draw); err != nil { return "", err }
	if draw.Status == "COMPLETED" { return "", fmt.Errorf("DRAW_ALREADY_COMPLETED") }

	var entryIds []string
	if err = json.Unmarshal([]byte(entryIdsJSON), &entryIds); err != nil { return "", err }

	// 결정론적 선발: txId 해시 기반 인덱스
	txId := ctx.GetStub().GetTxID()
	h    := sha256.Sum256([]byte(txId))
	seed := int(h[0]) + int(h[1])<<8

	winnerCount := draw.WinnerCount
	if winnerCount > len(entryIds) { winnerCount = len(entryIds) }

	winners := make([]string, 0, winnerCount)
	used    := make(map[int]bool)
	for i := 0; i < winnerCount; i++ {
		idx := (seed + i*37) % len(entryIds)
		for used[idx] { idx = (idx + 1) % len(entryIds) }
		used[idx] = true
		winners = append(winners, entryIds[idx])
	}

	for _, raffleNftId := range entryIds {
		rb, err2 := ctx.GetStub().GetState(keyPrefixRaffleNFT + raffleNftId)
		if err2 != nil || rb == nil { continue }
		var raffle RaffleNFTRecord
		if err2 = json.Unmarshal(rb, &raffle); err2 != nil { continue }
		isWinner := false
		for _, w := range winners {
			if w == raffleNftId { isWinner = true; break }
		}
		if isWinner { raffle.Status = "WINNER" } else { raffle.Status = "LOST" }
		raffle.UpdatedAt = nowISO()
		rb2, _ := json.Marshal(raffle)
		_ = ctx.GetStub().PutState(keyPrefixRaffleNFT+raffleNftId, rb2)
	}

	draw.Status     = "COMPLETED"
	draw.ExecutedAt = nowISO()
	db2, _ := json.Marshal(draw)
	if err = ctx.GetStub().PutState(keyPrefixDraw+drawId, db2); err != nil { return "", err }

	out, _ := json.Marshal(map[string]interface{}{"drawId": drawId, "winners": winners})
	return string(out), nil
}

// ─── 15. UseRaffleNFT ────────────────────────────────────

func (t *TicketChaincode) UseRaffleNFT(
	ctx contractapi.TransactionContextInterface,
	raffleNftId, userDidHash, ticketId string,
) error {
	rb, err := ctx.GetStub().GetState(keyPrefixRaffleNFT + raffleNftId)
	if err != nil { return err }
	if rb == nil { return fmt.Errorf("RAFFLE_NFT_NOT_FOUND") }

	var raffle RaffleNFTRecord
	if err = json.Unmarshal(rb, &raffle); err != nil { return err }
	if raffle.UserDidHash != userDidHash { return fmt.Errorf("NOT_OWNER") }
	if raffle.Status != "WINNER" { return fmt.Errorf("NOT_WINNER: %s", raffle.Status) }

	raffle.Status    = "USED"
	raffle.UpdatedAt = nowISO()
	rb2, _ := json.Marshal(raffle)
	return ctx.GetStub().PutState(keyPrefixRaffleNFT+raffleNftId, rb2)
}

// ─── 16. CreateReservation ───────────────────────────────

func (t *TicketChaincode) CreateReservation(
	ctx contractapi.TransactionContextInterface,
	reservationId, userDidHash, gameId, raffleNftId string,
	isPriority bool,
) error {
	rec := ReservationRecord{
		ReservationId: reservationId,
		UserDidHash:   userDidHash,
		GameId:        gameId,
		RaffleNftId:   raffleNftId,
		IsPriority:    isPriority,
		Status:        "PENDING",
		CreatedAt:     nowISO(),
		UpdatedAt:     nowISO(),
	}
	b, _ := json.Marshal(rec)
	return ctx.GetStub().PutState(keyPrefixReservation+reservationId, b)
}

// ─── 17. ConfirmReservation ──────────────────────────────

func (t *TicketChaincode) ConfirmReservation(
	ctx contractapi.TransactionContextInterface,
	reservationId, ticketId string,
) error {
	rb, err := ctx.GetStub().GetState(keyPrefixReservation + reservationId)
	if err != nil { return err }
	if rb == nil { return fmt.Errorf("RESERVATION_NOT_FOUND: %s", reservationId) }

	var rec ReservationRecord
	if err = json.Unmarshal(rb, &rec); err != nil { return err }
	rec.TicketId   = ticketId
	rec.Status     = "CONFIRMED"
	rec.UpdatedAt  = nowISO()
	b, _ := json.Marshal(rec)
	return ctx.GetStub().PutState(keyPrefixReservation+reservationId, b)
}

// ─── 18. CancelReservation ───────────────────────────────

func (t *TicketChaincode) CancelReservation(
	ctx contractapi.TransactionContextInterface,
	reservationId string,
) error {
	rb, err := ctx.GetStub().GetState(keyPrefixReservation + reservationId)
	if err != nil { return err }
	if rb == nil { return fmt.Errorf("RESERVATION_NOT_FOUND: %s", reservationId) }

	var rec ReservationRecord
	if err = json.Unmarshal(rb, &rec); err != nil { return err }
	rec.Status    = "CANCELLED"
	rec.UpdatedAt = nowISO()
	b, _ := json.Marshal(rec)
	return ctx.GetStub().PutState(keyPrefixReservation+reservationId, b)
}

// ─── 19. MapTicketNFT ────────────────────────────────────

func (t *TicketChaincode) MapTicketNFT(
	ctx contractapi.TransactionContextInterface,
	ticketId, tokenId, walletAddress string,
) error {
	ticket, err := getTicketRecord(ctx, ticketId)
	if err != nil { return err }
	if ticket == nil { return fmt.Errorf("TICKET_NOT_FOUND: %s", ticketId) }
	ticket.TokenId       = tokenId
	ticket.WalletAddress = strings.ToLower(walletAddress)
	return putTicketRecord(ctx, ticket)
}

// ─── 20. 조회 함수 (Raffle / Draw / Reservation) ─────────

func (t *TicketChaincode) GetRaffleNFT(
	ctx contractapi.TransactionContextInterface,
	raffleNftId string,
) (string, error) {
	b, err := ctx.GetStub().GetState(keyPrefixRaffleNFT + raffleNftId)
	if err != nil { return "", err }
	if b == nil { return "", fmt.Errorf("RAFFLE_NFT_NOT_FOUND: %s", raffleNftId) }
	return string(b), nil
}

func (t *TicketChaincode) GetDraw(
	ctx contractapi.TransactionContextInterface,
	drawId string,
) (string, error) {
	b, err := ctx.GetStub().GetState(keyPrefixDraw + drawId)
	if err != nil { return "", err }
	if b == nil { return "", fmt.Errorf("DRAW_NOT_FOUND: %s", drawId) }
	return string(b), nil
}

func (t *TicketChaincode) GetReservation(
	ctx contractapi.TransactionContextInterface,
	reservationId string,
) (string, error) {
	b, err := ctx.GetStub().GetState(keyPrefixReservation + reservationId)
	if err != nil { return "", err }
	if b == nil { return "", fmt.Errorf("RESERVATION_NOT_FOUND: %s", reservationId) }
	return string(b), nil
}

// GetUserRaffleNFTs: composite key 인덱스로 사용자의 응모권 NFT 목록 조회
func (t *TicketChaincode) GetUserRaffleNFTs(
	ctx contractapi.TransactionContextInterface,
	userDidHash string,
) (string, error) {
	iter, err := ctx.GetStub().GetStateByPartialCompositeKey("RAFFLE_NFT_USER", []string{userDidHash})
	if err != nil { return "", err }
	defer iter.Close()

	records := make([]RaffleNFTRecord, 0)
	for iter.HasNext() {
		kv, err := iter.Next()
		if err != nil { continue }
		_, parts, err := ctx.GetStub().SplitCompositeKey(kv.Key)
		if err != nil || len(parts) < 2 { continue }
		raffleNftId := parts[1]

		rb, err := ctx.GetStub().GetState(keyPrefixRaffleNFT + raffleNftId)
		if err != nil || rb == nil { continue }
		var rec RaffleNFTRecord
		if err = json.Unmarshal(rb, &rec); err != nil { continue }
		records = append(records, rec)
	}
	out, _ := json.Marshal(records)
	return string(out), nil
}

// ─── 21. HashDid (쿼리용 유틸) ───────────────────────────

func (t *TicketChaincode) HashDid(
	ctx contractapi.TransactionContextInterface,
	walletAddress string,
) (string, error) {
	return hashDid(walletAddress), nil
}

// ─── 22. EarnPointByEntry ────────────────────────────────
// 입장 검증 후 포인트 적립 (VerifyEntry 내부에서 자동 호출되지만 외부 호출도 허용)

func (t *TicketChaincode) EarnPointByEntry(
	ctx contractapi.TransactionContextInterface,
	userDidHash string,
	price float64,
) (string, error) {
	membership, err := getOrCreateMembership(ctx, userDidHash)
	if err != nil { return "", err }

	rate        := getEarnRate(membership.Grade)
	earnedPoint := math.Floor(price * rate)

	point, err := getOrCreatePoint(ctx, userDidHash)
	if err != nil { return "", err }

	point.Balance     += earnedPoint
	point.TotalEarned += earnedPoint
	if err = putPoint(ctx, point); err != nil { return "", err }

	out, _ := json.Marshal(map[string]interface{}{
		"earnedPoint": earnedPoint,
		"balance":     point.Balance,
	})
	return string(out), nil
}

// ─── 24. UpdateMembershipGrade ───────────────────────────
// 입장 횟수 +1 후 등급 재계산

func (t *TicketChaincode) UpdateMembershipGrade(
	ctx contractapi.TransactionContextInterface,
	userDidHash string,
) (string, error) {
	membership, err := getOrCreateMembership(ctx, userDidHash)
	if err != nil { return "", err }

	// 월 초기화
	if membership.LastResetMonth != currentMonth() {
		membership.MonthlyRaffleExchangeCount = 0
		membership.MonthlyCardExchangeCount   = 0
		membership.LastResetMonth             = currentMonth()
	}

	membership.EntryCount++
	membership.Grade = calcGrade(membership.EntryCount)
	if err = putMembership(ctx, membership); err != nil { return "", err }

	out, _ := json.Marshal(map[string]interface{}{
		"grade":      membership.Grade,
		"entryCount": membership.EntryCount,
	})
	return string(out), nil
}

// ─── 25. GetAllDraws ─────────────────────────────────────
// 전체 추첨 목록 조회 (범위 쿼리: DRAW: 프리픽스)

func (t *TicketChaincode) GetAllDraws(
	ctx contractapi.TransactionContextInterface,
) (string, error) {
	iter, err := ctx.GetStub().GetStateByRange(keyPrefixDraw, keyPrefixDraw+"~")
	if err != nil { return "", err }
	defer iter.Close()

	draws := make([]DrawRecord, 0)
	for iter.HasNext() {
		kv, err := iter.Next()
		if err != nil { continue }
		var rec DrawRecord
		if err = json.Unmarshal(kv.Value, &rec); err != nil { continue }
		draws = append(draws, rec)
	}
	out, _ := json.Marshal(draws)
	return string(out), nil
}

// ─── main ─────────────────────────────────────────────────

func main() {
	cc, err := contractapi.NewChaincode(new(TicketChaincode))
	if err != nil {
		panic(err.Error())
	}

	if serverAddr := os.Getenv("CHAINCODE_SERVER_ADDRESS"); serverAddr != "" {
		server := &shim.ChaincodeServer{
			CCID:    os.Getenv("CHAINCODE_ID"),
			Address: serverAddr,
			CC:      cc,
			TLSProps: shim.TLSProperties{Disabled: true},
		}
		if err := server.Start(); err != nil {
			fmt.Printf("Error starting CCaaS server: %s\n", err)
		}
		return
	}

	if err := cc.Start(); err != nil {
		fmt.Printf("Error starting TicketChaincode: %s\n", err)
	}
}
