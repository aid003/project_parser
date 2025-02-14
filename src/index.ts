import logger from "./logger";
import {
  createBrowserContext,
  openPage,
  parseDynamicPage,
  closeBrowserContext,
} from "./Scrape/scrapeDynamic";

async function main() {
  const browserContext = await createBrowserContext();

  try {
    const page1 = await openPage(browserContext, "https://avito.ru");

    const page2 = await openPage(browserContext, "https://google.com");
    await parseDynamicPage(page2);
  } catch (err) {
    logger.error("Ошибка в основном процессе:", err);
  } finally {
    // await closeBrowserContext(browserContext);
  }
}

main().catch(logger.error);
