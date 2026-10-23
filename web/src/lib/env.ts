// Environment schema for the Mavera web app (configuration only).
// Server-only variables must never be imported from client components.
// See ../../../.env.example for the documented values.
import { z } from "zod";

const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected a 0x-prefixed 20-byte hex address");

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
    API_PRICE_USD: z.coerce.number().positive(),
    RELAYER_PRIVATE_KEY: hexPrivateKey.optional().or(z.literal("")),
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
