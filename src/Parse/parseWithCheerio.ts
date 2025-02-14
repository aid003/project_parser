import * as cheerio from "cheerio";
import logger from "../logger";

export function parseWithCheerio(html: string) {
  try {
    const $ = cheerio.load(html);
    const titles = $("h1, h2")
      .map((_, el) => $(el).text().trim())
      .get();
    const links = $("a[href]")
      .map((_, el) => $(el).attr("href"))
      .get();

    logger.info(`Найдено заголовков: ${titles.length}`);
    logger.info(`Найдено ссылок: ${links.length}`);

    console.log("Заголовки:", titles);
    console.log("Ссылки:", links);
  } catch (error) {
    logger.error(`Ошибка при обработке Cheerio: ${(error as Error).message}`);
  }
}
