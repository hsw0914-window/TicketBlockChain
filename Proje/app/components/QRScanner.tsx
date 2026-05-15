import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface QRScannerProps {
  onScan: (result: string) => void;
  onError?: (error: string) => void;
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const onScanRef  = useRef(onScan);
  const onErrorRef = useRef(onError);

  // 항상 최신 콜백을 ref에 유지 (stale closure 방지)
  useEffect(() => { onScanRef.current  = onScan;  }, [onScan]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    const id = "qr-scanner-container";
    const scanner = new Html5Qrcode(id);

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => onScanRef.current(String(decodedText)),
        (err) => onErrorRef.current?.(String(err)),
      )
      .catch((err) => console.error("[QRScanner] start failed:", err));

    return () => {
      scanner.isScanning && scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div
      id="qr-scanner-container"
      style={{ width: "100%", maxWidth: 360, margin: "0 auto" }}
    />
  );
}
