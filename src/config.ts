import { chromium, BrowserContext, Page, Cookie } from "playwright";
import * as cheerio from "cheerio";
import fs from "fs";
import logger from "./logger";
// @ts-ignore
import * as UserAgent from "random-useragent";
import { FingerprintGenerator } from "fingerprint-generator";


const FINGERPRINT_FILE = "./fingerprint.json";
const COOKIES_FILE = "./cookies.json";

export function loadOrGenerateFingerprint() {
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

export async function loadCookies(context: BrowserContext) {
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

export async function saveCookies(context: BrowserContext) {
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

export async function simulateHumanDelays(page: Page) {
  const delay = 500 + Math.random() * 1500;
  await page.waitForTimeout(delay);
}

export async function simulateMouseMovements(page: Page) {
  const startX = 100 + Math.random() * 100;
  const startY = 200 + Math.random() * 100;
  const endX = startX + Math.random() * 200;
  const endY = startY + Math.random() * 200;
  await page.mouse.move(startX, startY);
  await page.waitForTimeout(100 + Math.random() * 200);
  await page.mouse.move(endX, endY);
}
