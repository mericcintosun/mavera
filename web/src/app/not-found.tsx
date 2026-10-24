import Image from "next/image";
import Link from "next/link";
import { PillLink } from "@/components/primitives/pill";
import { MEDIA } from "@/lib/site";

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-24 text-center">
      <Image
        src={MEDIA.bearClaim.src}
        alt=""
        width={240}
        height={Math.round(
          (240 * MEDIA.bearClaim.height) / MEDIA.bearClaim.width,
        )}
        priority
        className="h-auto w-[180px] sm:w-[220px]"
      />
      <h1 className="display mt-10 text-balance text-5xl leading-[1.05] tracking-[-0.02em] text-cream sm:text-6xl">
        This jar is empty.
      </h1>
      <p className="mt-4 max-w-md text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
        The page you asked for does not exist.
      </p>
      <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row">
        <PillLink asChild variant="primary" size="lg">
          <Link href="/">Back to the home page</Link>
        </PillLink>
        <PillLink asChild variant="secondary" size="lg">
          <Link href="/live">Open the projector view</Link>
        </PillLink>
      </div>
    </main>
  );
}
