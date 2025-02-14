import { chromium, BrowserContext, Page, Cookie } from "playwright";
import * as cheerio from "cheerio";
import fs from "fs";
import logger from "./logger";
// @ts-ignore
import * as UserAgent from "random-useragent";
import { FingerprintGenerator } from "fingerprint-generator";

const USER_DATA_DIR = "./user-data";
const FINGERPRINT_FILE = "./fingerprint.json";
const COOKIES_FILE = "./cookies.json";

function loadOrGenerateFingerprint() {
  if (fs.existsSync(FINGERPRINT_FILE)) {
    logger.info("Загружаем fingerprint из fingerprint.json");
    const saved = JSON.parse(fs.readFileSync(FINGERPRINT_FILE, "utf-8"));
    return saved;
  } else {
    logger.info("fingerprint.json не найден, генерируем новый...");

    const generator = new FingerprintGenerator();
    const fingerprintData = generator.getFingerprint();

    const allUserAgents = UserAgent.getAll();
    const desktopUserAgents = allUserAgents.filter((ua: string) => {
      const isDesktopOS =
        ua.includes("Windows NT") ||
        ua.includes("Mac OS X") ||
        ua.includes("X11; Linux");
      const isNotMobile = !ua.toLowerCase().includes("mobile");

      const isModernEnough = (() => {
        const matchChrome = ua.match(/Chrome\/(\d+)/);
        if (matchChrome) {
          const version = parseInt(matchChrome[1], 10);
          return version >= 100;
        }
        const matchFirefox = ua.match(/Firefox\/(\d+)/);
        if (matchFirefox) {
          const version = parseInt(matchFirefox[1], 10);
          return version >= 100;
        }
        const matchSafari = ua.match(/Version\/(\d+)/);
        if (ua.includes("Safari") && matchSafari) {
          const version = parseInt(matchSafari[1], 10);
          return version >= 14;
        }
        return true;
      })();

      return isDesktopOS && isNotMobile && isModernEnough;
    });

    const randomUserAgent =
      desktopUserAgents.length > 0
        ? desktopUserAgents[
            Math.floor(Math.random() * desktopUserAgents.length)
          ]
        : UserAgent.getRandom();

    let platform: "Win32" | "Linux x86_64" | "MacIntel" = "Win32";
    if (randomUserAgent.includes("Mac OS X")) {
      platform = "MacIntel";
    } else if (randomUserAgent.includes("X11; Linux")) {
      platform = "Linux x86_64";
    }

    const colorSchemes: Array<"dark" | "light" | "no-preference"> = [
      "dark",
      "light",
      "no-preference",
    ];
    const randomColorScheme =
      colorSchemes[Math.floor(Math.random() * colorSchemes.length)];

    const newFingerprint = {
      userAgent: randomUserAgent,
      viewport: {
        width: 1920,
        height: 1080,
      },
      locale: "ru-RU",
      timezoneId: "Europe/Moscow",
      colorScheme: randomColorScheme,
      hardwareConcurrency: 8,
      deviceMemory: 8,
      platform,
      customFingerprint: fingerprintData.fingerprint,
    };

    fs.writeFileSync(FINGERPRINT_FILE, JSON.stringify(newFingerprint, null, 2));
    logger.info(`Новый fingerprint сохранён в ${FINGERPRINT_FILE}`);
    return newFingerprint;
  }
}

async function loadCookies(context: BrowserContext) {
  if (fs.existsSync(COOKIES_FILE)) {
    try {
      const cookies = JSON.parse(
        fs.readFileSync(COOKIES_FILE, "utf-8")
      ) as Cookie[];
      if (cookies.length) {
        await context.addCookies(cookies);
        logger.info(
          `Загружены cookies из ${COOKIES_FILE}. Кол-во: ${cookies.length}`
        );
      }
    } catch (err) {
      logger.error(`Не удалось загрузить cookies: ${(err as Error).message}`);
    }
  }
}

async function saveCookies(context: BrowserContext) {
  try {
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    logger.info(
      `Cookies сохранены в файл ${COOKIES_FILE}. Кол-во: ${cookies.length}`
    );
  } catch (err) {
    logger.error(`Ошибка при сохранении cookies: ${(err as Error).message}`);
  }
}

async function simulateHumanDelays(page: Page) {
  const delay = 500 + Math.random() * 1500;
  await page.waitForTimeout(delay);
}

async function simulateMouseMovements(page: Page) {
  const startX = 100 + Math.random() * 100;
  const startY = 200 + Math.random() * 100;
  const endX = startX + Math.random() * 200;
  const endY = startY + Math.random() * 200;
  await page.mouse.move(startX, startY);
  await page.waitForTimeout(100 + Math.random() * 200);
  await page.mouse.move(endX, endY);
}

async function scrapeDynamic(url: string) {
  logger.info(`Начинаем парсинг динамического сайта: ${url}`);

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

  // Загружаем cookies из файла
  await loadCookies(browserContext);

  // Client Hints (только если Chrome)
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

  // Каждые 60 секунд сохраняем cookies
  const intervalMs = 60_000;
  const cookiesInterval = setInterval(async () => {
    logger.info("Периодическая сохранка cookies...");
    await saveCookies(browserContext);
  }, intervalMs);

  const page = await browserContext.newPage();

  // Подделываем окружение (navigator, screen, WebGL).
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

    // screen.width/height = 1920×1080 (как в fingerprint)
    Object.defineProperties(screen, {
      width: { get: () => fp.viewport.width },
      height: { get: () => fp.viewport.height },
    });

    // devicePixelRatio не устанавливаем (оставим 1)
    (window as any).chrome = { runtime: {} };

    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      if (parameter === 37445) return "Intel OpenGL";
      if (parameter === 37446) return "Chrome GPU";
      return getParameter.call(this, parameter);
    };
  }, fingerprint);

  try {
    await simulateHumanDelays(page);

    await page.goto(url, { timeout: 60000, waitUntil: "domcontentloaded" });
    await saveCookies(browserContext);

    await simulateHumanDelays(page);
    await simulateMouseMovements(page);

    const content = await page.content();
    parseWithCheerio(content);
  } catch (error) {
    logger.error(`Ошибка парсинга: ${(error as Error).message}`);
    await saveCookies(browserContext);
  } finally {
    clearInterval(cookiesInterval);
    await saveCookies(browserContext);
    // await browserContext.close();
    logger.info("Браузер закрыт.");
  }
}

function parseWithCheerio(html: string) {
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

// Пример запуска
(async () => {
  const url = "https://avito.ru";
  await scrapeDynamic(url);
})();
