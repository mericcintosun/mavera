// The single page: header, the fountain, Buy, Claim, Call the API, footer.
// Every component is a client component; all reads come from GET /api/state.
import { BuyCard } from "@/components/BuyCard";
import { CallApiCard } from "@/components/CallApiCard";
import { ClaimCard } from "@/components/ClaimCard";
import { Footer } from "@/components/Footer";
import { Fountain } from "@/components/Fountain";
import { Header } from "@/components/Header";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 pb-16">
      <Header />
      <Fountain />
      <div className="grid gap-4 md:grid-cols-2">
        <BuyCard />
        <ClaimCard />
      </div>
      <CallApiCard />
      <Footer />
    </main>
  );
}
