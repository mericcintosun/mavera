// scripts/customer.ts — a single paid call from the demo customer wallet:
// GET -> 402 -> sign USDC authorization (EIP-3009) -> retry -> 200 + PAYMENT-RESPONSE header.
// Verifies the route lock (402 `payTo` must equal MAVERA_ADDRESS) before signing.
//
// Spec: docs/03-X402-FLOW.md. Env: see ../.env.example.
//
// TODO (event hours, 24 Oct 2026): implement with @x402/fetch + @x402/evm + viem.
export {};
