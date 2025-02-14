import { chromium } from "playwright";
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import logger from "./logger";
// @ts-ignore
import * as UserAgent from "random-useragent";
import { faker } from "@faker-js/faker";
import FingerprintJS from "@fingerprintjs/fingerprintjs";

async function generateFingerprint() {
  const fp = await FingerprintJS.load();
  const fingerprint = await fp.get();

  return {
    userAgent: UserAgent.getRandom(),
    viewport: {
      width: faker.number.int({ min: 1024, max: 1920 }),
      height: faker.number.int({ min: 768, max: 1080 }),
    },
    locale: faker.location.countryCode(),
    timezoneId: faker.location.timeZone(),
    deviceScaleFactor: faker.number.int({ min: 1, max: 2 }),
    colorScheme: (Math.random() > 0.5 ? "dark" : "light") as "dark" | "light",
    hardwareConcurrency: faker.number.int({ min: 2, max: 16 }),
    deviceMemory: faker.number.int({ min: 2, max: 8 }),
    platform: Math.random() > 0.5 ? "Win32" : "Linux",
    fingerprint: fingerprint.visitorId,
  };
}

async function scrapeDynamic(url: string) {
  logger.info(`Начинаем парсинг динамического сайта: ${url}`);

  const fingerprint = await generateFingerprint();

  const browser = await chromium.launch({
    headless: false,
    args: ["--no-proxy-server"],
  });

  const context = await browser.newContext({
    userAgent: (await fingerprint).userAgent,
    viewport: (await fingerprint).viewport,
    locale: (await fingerprint).locale,
    timezoneId: (await fingerprint).timezoneId,
    deviceScaleFactor: (await fingerprint).deviceScaleFactor,
    colorScheme: (await fingerprint).colorScheme,
  });

  const page = await context.newPage();

  await page.addInitScript((fp) => {
    Object.defineProperties(navigator, {
      hardwareConcurrency: { get: () => fp.hardwareConcurrency },
      deviceMemory: { get: () => fp.deviceMemory },
      platform: { get: () => fp.platform },
    });
  }, await fingerprint);

  try {
    if (fs.existsSync("cookies.json")) {
      const cookies = JSON.parse(fs.readFileSync("cookies.json", "utf-8"));
      await context.addCookies(cookies);
      logger.info(`Загрузил куки из файла.`);
    }

    await page.goto(url, { timeout: 60000, waitUntil: "domcontentloaded" });

    const content = await page.content();
    parseWithCheerio(content);
  } catch (error) {
    logger.error(`Ошибка парсинга: ${(error as Error).message}`);
  } finally {
    try {
      const cookies = await context.cookies();
      fs.writeFileSync("cookies.json", JSON.stringify(cookies, null, 2));
      logger.info(`Обновлённые куки записаны в файл.`);
    } catch (error) {
      logger.error(`Ошибка при сохранении куков: ${(error as Error).message}`);
    }

    await browser.close();
    logger.info(`Браузер закрыт.`);
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

const url = "https://avito.ru";
scrapeDynamic(url);
