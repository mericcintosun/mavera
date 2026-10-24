"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

type Line = { indent: number; path: string; node: ReactNode; key: string };

const P = ({ children }: { children: ReactNode }) => (
  <span className="text-muted-foreground">{children}</span>
);

function scalar(v: unknown): ReactNode {
  if (typeof v === "string")
    return <span className="text-mint">{JSON.stringify(v)}</span>;
  if (typeof v === "number")
    return <span className="text-honey">{String(v)}</span>;
  return <span className="text-sky">{String(v)}</span>;
}

function build(
  value: unknown,
  path: string,
  indent: number,
  keyLabel: string | null,
  trailingComma: boolean,
  out: Line[],
  highlight: Set<string>,
  annotations: Record<string, string>,
) {
  const keyNode =
    keyLabel !== null ? (
      <>
        <span className="text-cream/80">{JSON.stringify(keyLabel)}</span>
        <P>: </P>
      </>
    ) : null;
  const comma = trailingComma ? <P>,</P> : null;
  const isArr = Array.isArray(value);
  if (value !== null && typeof value === "object") {
    const entries = isArr
      ? (value as unknown[]).map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>);
    const [open, close] = isArr ? ["[", "]"] : ["{", "}"];
    if (entries.length === 0) {
      out.push({
        indent,
        path,
        key: `${path}#`,
        node: (
          <>
            {keyNode}
            <P>
              {open}
              {close}
            </P>
            {comma}
          </>
        ),
      });
      return;
    }
    out.push({
      indent,
      path,
      key: `${path}#open`,
      node: (
        <>
          {keyNode}
          <P>{open}</P>
        </>
      ),
    });
    entries.forEach(([k, v], i) => {
      build(
        v,
        path ? `${path}.${k}` : k,
        indent + 1,
        isArr ? null : k,
        i < entries.length - 1,
        out,
        highlight,
        annotations,
      );
    });
    out.push({
      indent,
      path,
      key: `${path}#close`,
      node: (
        <>
          <P>{close}</P>
          {comma}
        </>
      ),
    });
    return;
  }
  const hl = highlight.has(path);
  const note = annotations[path];
  out.push({
    indent,
    path,
    key: path,
    node: (
      <>
        {keyNode}
        <span
          className={cn(
            hl &&
              "underline decoration-honey/60 decoration-1 underline-offset-4",
          )}
        >
          {scalar(value)}
        </span>
        {comma}
        {note ? (
          <span className="text-muted-foreground">
            {"  // "}
            {note}
          </span>
        ) : null}
      </>
    ),
  });
}

/**
 * Pretty-printed JSON rendered as React nodes with syntax colours, highlighted
 * dot paths ("accepts.0.amount") and inline annotation comments.
 */
export function JsonView({
  value,
  annotations = {},
  highlight = [],
  animate = false,
  className,
}: {
  value: unknown;
  annotations?: Record<string, string>;
  highlight?: string[];
  animate?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const lines: Line[] = [];
  build(value, "", 0, null, false, lines, new Set(highlight), annotations);
  const doAnimate = animate && !reduced;
  return (
    <div className={cn("relative", className)}>
      <div className="absolute top-1 right-1 z-10">
        <CopyButton value={JSON.stringify(value, null, 2)} label="Copy JSON" />
      </div>
      <div
        data-lenis-prevent
        className="overflow-x-auto py-3 pr-14 pl-4 font-mono text-[12.5px] leading-6"
      >
        <pre className="m-0 w-max min-w-full">
          {lines.map((l, i) => (
            <motion.div
              key={l.key}
              initial={doAnimate ? { opacity: 0, x: -6 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: doAnimate ? i * 0.016 : 0 }}
              style={{ paddingLeft: `${l.indent * 2}ch` }}
            >
              {l.node}
            </motion.div>
          ))}
        </pre>
      </div>
    </div>
  );
}
