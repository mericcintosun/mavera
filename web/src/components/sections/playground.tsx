import { Simulator } from "@/components/playground/simulator";
import { Section } from "@/components/sections/section";

export function Playground() {
  return (
    <Section
      id="playground"
      title="Run the math yourself."
      description="The same integer math as Mavera.sol (M = 1e36), running in your browser. Pay, transfer, claim, and watch every holder's balance."
    >
      <Simulator />
    </Section>
  );
}
