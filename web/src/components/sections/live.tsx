import { FountainPanel } from "@/components/live/fountain-panel";
import { Section } from "@/components/sections/section";

export function Live() {
  return (
    <Section
      id="live"
      title="Live on Monad testnet."
      description="Every paid call lands in the contract and is split among holders in the same block. These numbers come from the chain every two seconds."
    >
      <FountainPanel variant="device" />
    </Section>
  );
}
