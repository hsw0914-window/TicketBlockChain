const axios = require('axios');

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
const TOSS_MODE = (process.env.TOSS_MODE || '').trim().toLowerCase();
const TOSS_API_BASE = 'https://api.tosspayments.com/v1';

function shouldUseMockPayment(paymentKey) {
  return TOSS_MODE === 'mock' || !TOSS_SECRET_KEY || String(paymentKey || '').startsWith('tgen_');
}

function buildMockPayment({ paymentKey, orderId, amount, status = 'DONE' }) {
  return {
    paymentKey,
    orderId,
    totalAmount: Number(amount || 0),
    status,
    method: 'LOCAL_MOCK',
    approvedAt: new Date().toISOString(),
    isMock: true,
  };
}

// Basic Auth 헤더 생성 (시크릿 키 + ":" + Base64)
function getAuthHeader() {
  const encoded = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
  return `Basic ${encoded}`;
}

// 결제 승인
async function confirmPayment({ paymentKey, orderId, amount }) {
  if (shouldUseMockPayment(paymentKey)) {
    console.log(`[TossMock] 결제 승인 mock 처리: orderId=${orderId}, amount=${amount}`);
    return {
      success: true,
      data: buildMockPayment({ paymentKey, orderId, amount }),
      mock: true,
    };
  }

  try {
    const response = await axios.post(
      `${TOSS_API_BASE}/payments/confirm`,
      { paymentKey, orderId, amount },
      {
        headers: {
          Authorization: getAuthHeader(),
          'Content-Type': 'application/json',
        },
      }
    );
    return { success: true, data: response.data };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    const code = err.response?.data?.code || 'UNKNOWN';
    return { success: false, code, message: msg };
  }
}

// 결제 취소 (환불)
async function cancelPayment({ paymentKey, cancelReason, cancelAmount }) {
  if (shouldUseMockPayment(paymentKey)) {
    console.log(`[TossMock] 결제 취소 mock 처리: paymentKey=${paymentKey}, amount=${cancelAmount ?? 'ALL'}, reason=${cancelReason}`);
    return {
      success: true,
      data: buildMockPayment({
        paymentKey,
        orderId: `mock-cancel-${Date.now()}`,
        amount: cancelAmount ?? 0,
        status: 'CANCELED',
      }),
      mock: true,
    };
  }

  try {
    const body = { cancelReason };
    // cancelAmount가 있으면 부분 취소, 없으면 전체 취소
    if (cancelAmount !== undefined && cancelAmount !== null) {
      body.cancelAmount = cancelAmount;
    }
    const response = await axios.post(
      `${TOSS_API_BASE}/payments/${paymentKey}/cancel`,
      body,
      {
        headers: {
          Authorization: getAuthHeader(),
          'Content-Type': 'application/json',
        },
      }
    );
    return { success: true, data: response.data };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    const code = err.response?.data?.code || 'UNKNOWN';
    return { success: false, code, message: msg };
  }
}

// 결제 조회
async function getPayment({ paymentKey }) {
  if (shouldUseMockPayment(paymentKey)) {
    return {
      success: true,
      data: buildMockPayment({
        paymentKey,
        orderId: `mock-query-${Date.now()}`,
        amount: 0,
      }),
      mock: true,
    };
  }

  try {
    const response = await axios.get(
      `${TOSS_API_BASE}/payments/${paymentKey}`,
      {
        headers: { Authorization: getAuthHeader() },
      }
    );
    return { success: true, data: response.data };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    return { success: false, message: msg };
  }
}

module.exports = { confirmPayment, cancelPayment, getPayment };
