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

// 1. Отдельная функция для создания контекста
export async function createBrowserContext(): Promise<BrowserContext> {
  logger.info("Создаем новый контекст браузера...");

  // Загружаем или генерируем 'fingerprint' (userAgent, locale, timezoneId и т.д.)
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

  // Загружаем cookies
  await loadCookies(browserContext);

  // Настраиваем заголовки (если нужно)
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

  // Можно сделать периодическое сохранение cookies
  const intervalMs = 30_000;
  const cookiesInterval = setInterval(async () => {
    logger.info("Периодическая сохранка cookies...");
    await saveCookies(browserContext);
  }, intervalMs);

  // Чтобы при закрытии контекста остановить таймер
  browserContext.on("close", () => {
    clearInterval(cookiesInterval);
  });

  logger.info("Контекст браузера создан.");
  return browserContext;
}

// 2. Функция для открытия новой страницы и перехода на URL
export async function openPage(
  browserContext: BrowserContext,
  url: string
): Promise<Page> {
  logger.info(`Открываем новую страницу: ${url}`);
  const page = await browserContext.newPage();

  // Добавляем различные "обфускации" и подмены до загрузки страницы
  // (должно делаться до page.goto, иначе может быть поздно)
  const fingerprint = loadOrGenerateFingerprint(); // или храните его иначе, главное синхронизировать с createBrowserContext
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

  // Имитация "человеческих" задержек перед и после перехода
  await simulateHumanDelays(page);
  await page.goto(url, { timeout: 60000, waitUntil: "domcontentloaded" });
  await simulateHumanDelays(page);
  await simulateMouseMovements(page);

  // Сохраняем cookies после загрузки
  await saveCookies(browserContext);

  return page;
}

// 3. Функция, в которой вы можете парсить конкретный URL
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

// 4. Функция закрытия контекста (когда он больше не нужен)
export async function closeBrowserContext(browserContext: BrowserContext) {
  logger.info("Закрываем браузерный контекст...");
  await saveCookies(browserContext);
  await browserContext.close();
  logger.info("Контекст браузера закрыт.");
}
