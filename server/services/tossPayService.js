const axios = require('axios');

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
const TOSS_API_BASE = 'https://api.tosspayments.com/v1';

// Basic Auth 헤더 생성 (시크릿 키 + ":" + Base64)
function getAuthHeader() {
  const encoded = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
  return `Basic ${encoded}`;
}

// 결제 승인
async function confirmPayment({ paymentKey, orderId, amount }) {
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
