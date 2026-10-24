"use client";

import { Dialog } from "radix-ui";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type Connector,
  useConnect,
  useConnection,
  useConnectors,
} from "wagmi";
import { errorMessage, isUserRejected } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Wallet picker. Browser wallets announce themselves through EIP-6963 and wagmi
 * turns each one into a connector (id = rdns, e.g. "io.metamask", "io.rabby",
 * "com.brave.wallet"). We list those so the user chooses the extension instead
 * of being sent to whichever wallet owns window.ethereum.
 */

interface PickerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const PickerContext = createContext<PickerContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
});

export function useWalletPicker(): PickerContextValue {
  return useContext(PickerContext);
}

const RANK: Record<string, number> = {
  "io.metamask": 0,
  "io.rabby": 1,
  "com.brave.wallet": 2,
  "com.coinbase.wallet": 3,
};

function rank(connector: Connector): number {
  return RANK[connector.id] ?? 10;
}

/**
 * Installed wallets in a stable order. The generic "injected" connector (bare
 * window.ethereum) is shown only when no wallet announced itself via EIP-6963.
 */
export function useDetectedWallets(): Connector[] {
  const connectors = useConnectors();
  return useMemo(() => {
    const announced = connectors.filter((c) => c.id !== "injected");
    const list =
      announced.length > 0
        ? announced
        : connectors.filter((c) => c.id === "injected");
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [connectors]);
}

function WalletIcon({ connector }: { connector: Connector }) {
  if (connector.icon) {
    return (
      // biome-ignore lint/performance/noImgElement: wallet icons are data: URLs announced by the extension
      <img
        src={connector.icon}
        alt=""
        width={28}
        height={28}
        className="size-7 rounded-lg"
      />
    );
  }
  return (
    <span className="grid size-7 place-items-center rounded-lg bg-white/10 font-mono text-xs text-cream">
      {connector.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function WalletPickerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return (
    <PickerContext.Provider value={value}>
      {children}
      <WalletPickerDialog isOpen={isOpen} onOpenChange={setOpen} />
    </PickerContext.Provider>
  );
}

function WalletPickerDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const wallets = useDetectedWallets();
  const connect = useConnect();
  const { status } = useConnection();
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "connected" && isOpen) {
      onOpenChange(false);
      setPendingId(null);
    }
  }, [status, isOpen, onOpenChange]);

  const error = connect.error;
  const errorText = error
    ? isUserRejected(error)
      ? "Request rejected in the wallet."
      : errorMessage(error)
    : null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          aria-describedby="wallet-picker-description"
          className="fixed top-1/2 left-1/2 z-50 w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] bg-navy-2 p-6 shadow-2xl ring-1 ring-white/10 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 sm:p-7"
        >
          <Dialog.Title className="display text-2xl text-cream">
            Connect a wallet
          </Dialog.Title>
          <Dialog.Description
            id="wallet-picker-description"
            className="mt-1.5 text-sm text-muted-foreground"
          >
            {wallets.length > 0
              ? "Browser wallets installed on this device."
              : "No browser wallet was found."}
          </Dialog.Description>

          <ul className="mt-5 flex flex-col gap-1.5">
            {wallets.map((connector) => {
              const pending = pendingId === connector.id && connect.isPending;
              return (
                <li key={connector.uid}>
                  <button
                    type="button"
                    disabled={connect.isPending}
                    onClick={() => {
                      setPendingId(connector.id);
                      connect.mutate(
                        { connector },
                        { onSettled: () => setPendingId(null) },
                      );
                    }}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors",
                      "bg-white/[0.04] hover:bg-white/[0.09] focus-visible:bg-white/[0.09] disabled:opacity-60",
                      pending && "bg-white/[0.09]",
                    )}
                  >
                    <WalletIcon connector={connector} />
                    <span className="flex-1 text-sm font-medium text-cream">
                      {connector.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {pending ? "Opening…" : "Installed"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {wallets.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Install{" "}
              <a
                href="https://metamask.io/download"
                target="_blank"
                rel="noreferrer"
                className="text-cream underline underline-offset-4"
              >
                MetaMask
              </a>{" "}
              or{" "}
              <a
                href="https://rabby.io"
                target="_blank"
                rel="noreferrer"
                className="text-cream underline underline-offset-4"
              >
                Rabby
              </a>
              , then reload this page.
            </p>
          ) : null}

          {errorText ? (
            <p className="mt-4 text-sm text-destructive" aria-live="polite">
              {errorText}
            </p>
          ) : null}

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Mavera runs on Monad testnet (chain 10143). If the wallet is on
            another network you will be asked to switch after connecting.
          </p>

          <Dialog.Close
            aria-label="Close"
            className="absolute top-4 right-4 inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/8 hover:text-cream"
          >
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
