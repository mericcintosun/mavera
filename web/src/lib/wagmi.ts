// wagmi 3 config: one injected connector (EIP-6963 discovery on by default), ssr: true.
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadChain } from "./chain";

export const wagmiConfig = createConfig({
  chains: [monadChain],
  connectors: [injected()],
  transports: {
    [monadChain.id]: http(monadChain.rpcUrls.default.http[0]),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
