// Environment schema for the Mavera web app (configuration only).
// Server-only variables must never be imported from client components.
// Documented values: ../../../.env.example
import { z } from "zod";

const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected a 0x-prefixed 20-byte hex address");

const hexBytes32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected a 0x-prefixed 32-byte hex value");

const hexPrivateKey = z
  .string()
  .regex(
    /^0x[0-9a-fA-F]{64}$/,
    "expected a 0x-prefixed 32-byte hex private key",
  );

export const serverEnvSchema = z
  .object({
    MONAD_CHAIN_ID: z.coerce.number().int().positive().default(10143),
    MONAD_RPC_URL: z.string().url(),
    X402_FACILITATOR_URL: z.string().url(),
    X402_NETWORK: z
      .string()
      .regex(/^eip155:\d+$/)
      .default("eip155:10143"),
    USDC_ADDRESS: hexAddress,
    MAVERA_ADDRESS: hexAddress,
    PAY_TO: hexAddress,
    // Price of one paid call in USDC atomic units (6 decimals); 10000 = $0.01.
    X402_PRICE_ATOMIC: z.coerce.number().int().positive().default(10_000),
    X402_MAX_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(300),
    RELAYER_PRIVATE_KEY: hexPrivateKey.optional().or(z.literal("")),
    // Data served by the paid route: oracle (Pyth + Stork MON/USD) or heartbeat (chain stats only).
    DATA_MODE: z.enum(["oracle", "heartbeat"]).default("oracle"),
    PYTH_ADDRESS: hexAddress.default(
      "0xFC6bd9F9f0c6481c6Af3A7Eb46b296A5B85ed379",
    ),
    PYTH_MON_USD_FEED_ID: hexBytes32.default(
      "0x31491744e2dbf6df7fcf4ac0820d18a609b49076d45066d3568424e62f686cd1",
    ),
    STORK_ADDRESS: hexAddress.default(
      "0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62",
    ),
    MULTICALL3_ADDRESS: hexAddress.default(
      "0xcA11bde05977b3631167028862bE2a173976CA11",
    ),
  })
  .refine(
    (env) => env.PAY_TO.toLowerCase() === env.MAVERA_ADDRESS.toLowerCase(),
    {
      message: "route lock: PAY_TO must equal MAVERA_ADDRESS",
      path: ["PAY_TO"],
    },
  );

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_MONAD_CHAIN_ID: z.coerce.number().int().positive().default(10143),
  NEXT_PUBLIC_MONAD_RPC_URL: z.string().url(),
  NEXT_PUBLIC_MAVERA_ADDRESS: hexAddress,
  NEXT_PUBLIC_USDC_ADDRESS: hexAddress,
  NEXT_PUBLIC_EXPLORER_URL: z.string().url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
