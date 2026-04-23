"use client";

import * as React from "react";
import { Legend, Tooltip } from "recharts";

import { cn } from "~/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label: string;
    color?: string;
  }
>;

const ChartContext = React.createContext<ChartConfig | null>(null);

function useChartConfig() {
  const value = React.useContext(ChartContext);

  if (!value) {
    throw new Error("Chart components must be used inside ChartContainer.");
  }

  return value;
}

export function ChartContainer({
  children,
  className,
  config,
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
}) {
  const style = Object.fromEntries(
    Object.entries(config)
      .filter(([, item]) => item.color)
      .map(([key, item]) => [`--color-${key}`, item.color]),
  ) as React.CSSProperties;

  return (
    <ChartContext.Provider value={config}>
      <div className={cn("w-full", className)} style={style}>
        {children}
      </div>
    </ChartContext.Provider>
  );
}

type TooltipEntry = {
  color?: string;
  dataKey?: string | number;
  value?: number | string;
};

export function ChartTooltipContent({
  active,
  indicator = "line",
  label,
  labelFormatter,
  payload,
}: {
  active?: boolean;
  indicator?: "dot" | "line";
  label?: string | number;
  labelFormatter?: (label: string | number | undefined) => React.ReactNode;
  payload?: TooltipEntry[];
}) {
  const config = useChartConfig();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="min-w-44 rounded-xl border bg-popover px-3 py-2 text-popover-foreground shadow-lg/5">
      <div className="mb-2 font-medium text-sm">
        {labelFormatter ? labelFormatter(label) : label}
      </div>
      <div className="space-y-1.5">
        {payload.map((entry) => {
          const key = String(entry.dataKey);
          const item = config[key];

          return (
            <div key={key} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex shrink-0 rounded-full",
                    indicator === "dot" ? "size-2.5" : "h-2 w-4 rounded-sm",
                  )}
                  style={{ backgroundColor: item?.color ?? entry.color }}
                />
                <span className="text-muted-foreground">{item?.label ?? key}</span>
              </div>
              <span className="font-medium tabular-nums">{entry.value ?? "-"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type LegendEntry = {
  color?: string;
  dataKey?: string | number;
  value?: string;
};

export function ChartLegendContent({ payload }: { payload?: LegendEntry[] }) {
  const config = useChartConfig();

  if (!payload?.length) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
      {payload.map((entry) => {
        const key = String(entry.dataKey ?? entry.value ?? "");
        const item = config[key];

        return (
          <div key={key} className="flex items-center gap-2">
            <span
              className="inline-flex size-2.5 rounded-full"
              style={{ backgroundColor: item?.color ?? entry.color }}
            />
            <span className="text-muted-foreground">{item?.label ?? key}</span>
          </div>
        );
      })}
    </div>
  );
}

export const ChartTooltip = Tooltip;
export const ChartLegend = Legend;
