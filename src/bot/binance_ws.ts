import WebSocket from 'ws';

export type BinanceTicker = { tsMs: number; price: number };

// Binance spot BTCUSDT trade stream (fast enough for paper)
export function startBinanceBtcPrice(onTick: (t: BinanceTicker) => void) {
  const url = 'wss://stream.binance.com:9443/ws/btcusdt@trade';
  let ws: WebSocket | null = new WebSocket(url);

  const connect = () => {
    ws = new WebSocket(url);
    ws.on('message', (d) => {
      try {
        const msg: any = JSON.parse(d.toString());
        const p = Number(msg?.p);
        if (Number.isFinite(p)) onTick({ tsMs: Date.now(), price: p });
      } catch {}
    });
    ws.on('close', () => setTimeout(connect, 1000));
    ws.on('error', () => {
      try { ws?.close(); } catch {}
    });
  };

  ws.on('close', () => setTimeout(connect, 1000));
  ws.on('error', () => {
    try { ws?.close(); } catch {}
  });

  return {
    stop() {
      try { ws?.close(); } catch {}
      ws = null;
    }
  };
}
