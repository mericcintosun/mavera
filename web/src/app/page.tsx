// One page, told like a story: hero (the bear answers with the real 402),
// beats, how it works (scroll-driven device on live data), live fountain,
// the contract-math playground, try it (wallet actions), why Monad, FAQ.
import { Beats } from "@/components/sections/beats";
import { Faq } from "@/components/sections/faq";
import { Footer } from "@/components/sections/footer";
import { Hero } from "@/components/sections/hero";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Live } from "@/components/sections/live";
import { Nav } from "@/components/sections/nav";
import { Playground } from "@/components/sections/playground";
import { TryIt } from "@/components/sections/try-it";
import { WhyMonad } from "@/components/sections/why-monad";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="main" className="relative">
        <Hero />
        <Beats />
        <HowItWorks />
        <Live />
        <Playground />
        <TryIt />
        <WhyMonad />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
