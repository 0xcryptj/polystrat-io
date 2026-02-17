import WebSocket from 'ws';

export type CbTicker = { tsMs: number; price: number };

export function startCoinbaseBtcPrice(onTick: (t: CbTicker) => void) {
  const url = 'wss://ws-feed.exchange.coinbase.com';
  let ws: WebSocket | null = null;

  const connect = () => {
    ws = new WebSocket(url);
    ws.on('open', () => {
      ws?.send(
        JSON.stringify({
          type: 'subscribe',
          channels: [{ name: 'ticker', product_ids: ['BTC-USD'] }]
        })
      );
    });

    ws.on('message', (d) => {
      try {
        const msg: any = JSON.parse(d.toString());
        if (msg.type !== 'ticker') return;
        const p = Number(msg.price);
        if (Number.isFinite(p)) onTick({ tsMs: Date.now(), price: p });
      } catch {}
    });

    ws.on('close', () => setTimeout(connect, 1000));
    ws.on('error', () => {
      try { ws?.close(); } catch {}
    });
  };

  connect();

  return {
    stop() {
      try { ws?.close(); } catch {}
      ws = null;
    }
  };
}
