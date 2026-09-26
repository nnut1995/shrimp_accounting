import { calcLot } from "../calc";
import type { LotWithChildren } from "../types";
import type { LotInput } from "./validation";
export const LOT_SELECT = "*,suppliers(name),buy_lines(*),sell_lines(*),expenses(*,expense_categories(name)),adjustments(*)";
export function summary(lot: Pick<LotWithChildren,"buy_lines"|"sell_lines"|"expenses"|"adjustments">) {
  return calcLot([],lot.buy_lines,lot.sell_lines,lot.adjustments,lot.expenses);
}
export function preview(input: LotInput) {
  const base={id:"",lot_id:"",created_at:""};
  return summary({
    buy_lines:input.buy_lines.map(x=>({...base,...x})),
    sell_lines:input.sell_lines.map(x=>({...base,...x})),
    adjustments:input.adjustments.map(x=>({...base,...x})),
    expenses:input.expenses.map(x=>({...base,...x,category_id:"",expense_categories:{name:x.category}})),
  });
}
