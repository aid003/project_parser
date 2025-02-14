import { chromium, BrowserContext, Page } from "playwright";
import {
  loadCookies,
  loadOrGenerateFingerprint,
  saveCookies,
  simulateHumanDelays,
  simulateMouseMovements,
} from "../config";
import logger from "../logger";
import { parseWithCheerio } from "../Parse/parseWithCheerio";

const USER_DATA_DIR = "./user-data";

export async function createBrowserContext(): Promise<BrowserContext> {
  logger.info("Создаем новый контекст браузера...");

  const fingerprint = loadOrGenerateFingerprint();

  const args: string[] = ["--window-size=1920,1080"];
  const browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args,
    viewport: null,
    userAgent: fingerprint.userAgent,
    locale: fingerprint.locale,
    timezoneId: fingerprint.timezoneId,
    colorScheme: fingerprint.colorScheme,
  });

  await loadCookies(browserContext);

  let extraHeaders: Record<string, string> = {
    "Accept-Language": "ru-RU,ru;q=0.9",
  };
  if (fingerprint.userAgent.includes("Chrome/")) {
    extraHeaders = {
      ...extraHeaders,
      "sec-ch-ua": `"Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114"`,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": `"Windows"`,
    };
  }
  await browserContext.setExtraHTTPHeaders(extraHeaders);

  const intervalMs = 30_000;
  const cookiesInterval = setInterval(async () => {
    logger.info("Периодическая сохранка cookies...");
    await saveCookies(browserContext);
  }, intervalMs);

  browserContext.on("close", () => {
    clearInterval(cookiesInterval);
  });

  logger.info("Контекст браузера создан.");
  return browserContext;
}

export async function openPage(
  browserContext: BrowserContext,
  url: string
): Promise<Page> {
  logger.info(`Открываем новую страницу: ${url}`);
  const page = await browserContext.newPage();

  const fingerprint = loadOrGenerateFingerprint(); 
  await page.addInitScript((fp) => {
    Object.defineProperties(navigator, {
      hardwareConcurrency: { get: () => fp.hardwareConcurrency },
      deviceMemory: { get: () => fp.deviceMemory },
      platform: { get: () => fp.platform },
      webdriver: { get: () => false },
      maxTouchPoints: { get: () => 0 },
      languages: { get: () => ["ru-RU", "ru"] },
    });

    Object.defineProperty(navigator, "plugins", {
      get: () => [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
      ],
    });

    Object.defineProperties(screen, {
      width: { get: () => fp.viewport.width },
      height: { get: () => fp.viewport.height },
    });

    (window as any).chrome = { runtime: {} };

    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      if (parameter === 37445) return "Intel OpenGL";
      if (parameter === 37446) return "Chrome GPU";
      return getParameter.call(this, parameter);
    };
  }, fingerprint);

  await simulateHumanDelays(page);
  await page.goto(url, { timeout: 60000, waitUntil: "domcontentloaded" });
  await simulateHumanDelays(page);
  await simulateMouseMovements(page);

  await saveCookies(browserContext);

  return page;
}

export async function parseDynamicPage(page: Page) {
  try {
    logger.info(`Парсим контент: ${page.url()}`);
    const content = await page.content();
    // Сам парсинг
    parseWithCheerio(content);
    logger.info("Парсинг завершен.");
  } catch (error) {
    logger.error(`Ошибка парсинга: ${(error as Error).message}`);
  }
}


export async function closeBrowserContext(browserContext: BrowserContext) {
  logger.info("Закрываем браузерный контекст...");
  await saveCookies(browserContext);
  await browserContext.close();
  logger.info("Контекст браузера закрыт.");
}
