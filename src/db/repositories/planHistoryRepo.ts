import { getDb } from "../client.js";

export interface ServedDish {
  dishName: string;
  servedOn: string;
}

export const planHistoryRepo = {
  recordServed(dishName: string, servedOn: string): void {
    getDb()
      .prepare("INSERT INTO plan_history (dish_name, served_on) VALUES (?, ?)")
      .run(dishName, servedOn);
  },

  getServedSince(sinceDate: string): ServedDish[] {
    const rows: any[] = getDb()
      .prepare("SELECT dish_name, served_on FROM plan_history WHERE served_on >= ?")
      .all(sinceDate);
    return rows.map((r) => ({ dishName: r.dish_name, servedOn: r.served_on }));
  },
};
