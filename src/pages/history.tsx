import { useState } from "react";
import { useListItems, useDeleteItem } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";
import type { RawInputs } from "@/lib/types";

function fmt(val: number) {
  return val.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function aed(val: number) {
  return `AED ${fmt(Math.abs(val))}`;
}

export default function History({ onEdit }: { onEdit: (raw: RawInputs, id: number) => void }) {
  const { data: items = [], isLoading, refetch } = useListItems();
  const deleteItem = useDeleteItem();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const totalProfit = items.reduce((sum, i) => sum + i.profit, 0);
  const avgMargin = items.length > 0
    ? items.reduce((sum, i) => sum + i.profitMargin, 0) / items.length
    : 0;
  const totalItems = items.length;

  async function handleDelete(id: number) {
    setDeletingId(id);
    await deleteItem.mutateAsync({ id });
    await refetch();
    setDeletingId(null);
    if (expandedId === id) setExpandedId(null);
    toast({ title: "Item removed" });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-md mx-auto pb-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Saved</h1>
        <p className="text-sm text-muted-foreground">Your tracked items</p>
      </div>

      {totalItems > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card border border-card-border rounded-xl p-3 text-center shadow-sm">
            <p className="text-xl font-bold text-foreground">{totalItems}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">Items</p>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-3 text-center shadow-sm">
            <p className={`text-base font-bold ${totalProfit >= 0 ? "text-primary" : "text-destructive"}`}>
              {aed(totalProfit)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">Total Profit</p>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-3 text-center shadow-sm">
            <p className={`text-xl font-bold ${avgMargin >= 0 ? "text-primary" : "text-destructive"}`}>
              {fmt(avgMargin)}%
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">Avg Margin</p>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <p className="text-muted-foreground text-sm">No items saved yet.<br />Use the Calculator tab to add items.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[...items].reverse().map((item) => {
            const isExpanded = expandedId === item.id;
            const profitPct = item.totalCost !== 0
              ? (item.profit / item.totalCost) * 100
              : 0;
            const positive = item.profit >= 0;

            return (
              <div
                key={item.id}
                className={`bg-card border rounded-2xl shadow-sm overflow-hidden transition-all ${positive ? "border-card-border" : "border-destructive/30"}`}
              >
                <button
                  className="w-full text-left px-4 pt-4 pb-3 flex items-start gap-3 active:bg-muted/50 transition"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <div className={`shrink-0 rounded-xl px-3 py-2 text-center min-w-[80px] ${positive ? "bg-primary/10" : "bg-destructive/10"}`}>
                    <p className={`text-base font-bold leading-tight ${positive ? "text-primary" : "text-destructive"}`}>
                      {positive ? "" : "−"}{aed(item.profit)}
                    </p>
                    <p className={`text-[10px] font-semibold mt-0.5 ${positive ? "text-primary/70" : "text-destructive/70"}`}>
                      {fmt(profitPct)}%
                    </p>
                    <p className="text-[9px] text-muted-foreground/60 mt-1 leading-tight">
                      {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    <p className="text-[9px] text-muted-foreground/60 leading-tight">
                      {new Date(item.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-base leading-tight truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.renovationCost > 0
                        ? `Cost ${aed(item.totalCost)} (incl. reno) → Sale ${aed(item.salePrice)}`
                        : `Cost ${aed(item.acquisitionCost)} → Sale ${aed(item.salePrice)}`}
                    </p>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 truncate italic">{item.notes}</p>
                    )}
                  </div>

                  <svg
                    className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform mt-1 ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border/60">
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div className={`rounded-xl p-3 text-center ${positive ? "bg-primary/8" : "bg-destructive/8"}`}>
                        <p className={`text-base font-bold ${positive ? "text-primary" : "text-destructive"}`}>
                          {positive ? "" : "−"}{aed(item.profit)}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Profit</p>
                      </div>
                      <div className={`rounded-xl p-3 text-center ${positive ? "bg-primary/8" : "bg-destructive/8"}`}>
                        <p className={`text-xl font-bold ${positive ? "text-primary" : "text-destructive"}`}>
                          {fmt(profitPct)}%
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Profit %</p>
                      </div>
                      <div className={`rounded-xl p-3 text-center ${positive ? "bg-primary/8" : "bg-destructive/8"}`}>
                        <p className={`text-xl font-bold ${positive ? "text-primary" : "text-destructive"}`}>
                          {fmt(item.profitMargin)}%
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Margin</p>
                      </div>
                      <div className={`rounded-xl p-3 text-center ${positive ? "bg-primary/8" : "bg-destructive/8"}`}>
                        <p className={`text-xl font-bold ${positive ? "text-primary" : "text-destructive"}`}>
                          {fmt(item.roi)}%
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">ROI</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Acquisition</span>
                        <span className="font-medium text-foreground">{aed(item.acquisitionCost)}</span>
                      </div>
                      {item.renovationCost > 0 && (
                        <div className="flex justify-between">
                          <span>Renovation</span>
                          <span className="font-medium text-foreground">{aed(item.renovationCost)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-border pt-1.5">
                        <span className="font-semibold text-foreground">Total Cost</span>
                        <span className="font-semibold text-foreground">{aed(item.totalCost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sale Price</span>
                        <span className="font-medium text-foreground">{aed(item.salePrice)}</span>
                      </div>
                    </div>

                    <div className="mt-2">
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${positive ? "bg-primary" : "bg-destructive"}`}
                          style={{ width: `${Math.min(100, (item.totalCost / item.salePrice) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 text-center">
                        Total cost is {fmt((item.totalCost / item.salePrice) * 100)}% of sale price
                      </p>
                    </div>

                    <div className="flex items-center justify-end mt-4 gap-2">
                      <div className="flex items-center gap-2">
                        {item.rawInputs && (
                          <button
                            onClick={() => onEdit(item.rawInputs!, item.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 transition disabled:opacity-40"
                        >
                          {deletingId === item.id ? (
                            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
