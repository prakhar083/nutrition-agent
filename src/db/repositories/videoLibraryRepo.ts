import { getDb } from "../client.js";

export const videoLibraryRepo = {
  getForDish(dishName: string): string | null {
    const row: any = getDb()
      .prepare("SELECT youtube_url FROM video_library WHERE dish_name = ?")
      .get(dishName);
    return row ? row.youtube_url : null;
  },

  set(dishName: string, youtubeUrl: string): void {
    getDb()
      .prepare(
        `INSERT INTO video_library (dish_name, youtube_url)
         VALUES (?, ?)
         ON CONFLICT(dish_name) DO UPDATE SET youtube_url = excluded.youtube_url`
      )
      .run(dishName, youtubeUrl);
  },
};
