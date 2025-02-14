import { chromium } from "playwright";
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import logger from "./logger";
import UserAgent from "user-agents";
import { faker } from "@faker-js/faker";
import randomUserAgent from "random-useragent";
import UAParser from "ua-parser-js";

function generateBrowserParams() {
  // Генерируем случайный User-Agent
  const userAgentInstance = new UserAgent();
  const randomUA = randomUserAgent.getRandom();
  const selectedUserAgent =
    Math.random() > 0.5 ? userAgentInstance.toString() : randomUA;

  // Разбираем User-Agent для определения параметров
  const parser = new UAParser(selectedUserAgent);
  const browserData = parser.getResult();

  return {
    userAgent: selectedUserAgent,
    viewport: {
      width: faker.number.int({ min: 1280, max: 1920 }),
      height: faker.number.int({ min: 720, max: 1080 }),
    },
    locale: faker.location.countryCode(),
    timezoneId: faker.location.timeZone(),
    deviceScaleFactor: Math.random() > 0.5 ? 1 : 2,
  };
}

async function scrapeDynamic(url: string) {
  logger.info(`Начинаем парсинг динамического сайта: ${url}`);

  const browserParams = generateBrowserParams();
  logger.info(`Используем User-Agent: ${browserParams.userAgent}`);

  const browser = await chromium.launch({
    headless: false,
    args: ["--no-proxy-server"],
  });

  const context = await browser.newContext({
    userAgent: browserParams.userAgent,
    viewport: browserParams.viewport,
    locale: browserParams.locale,
    timezoneId: browserParams.timezoneId,
    deviceScaleFactor: browserParams.deviceScaleFactor,
  });

  const page = await context.newPage();

  try {
    // Загрузка куков перед входом на сайт
    if (fs.existsSync("cookies.json")) {
      const cookies = JSON.parse(fs.readFileSync("cookies.json", "utf-8"));
      await context.addCookies(cookies);
      logger.info(`Загрузил куки из файла.`);
    }

    // Переход по URL
    await page.goto(url, { timeout: 60000, waitUntil: "domcontentloaded" });

    // Получение контента страницы
    const content = await page.content();

    // Парсинг с Cheerio
    parseWithCheerio(content);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Ошибка парсинга: ${error.message}`);
    } else {
      logger.error(`Ошибка парсинга: ${error}`);
    }
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

    // Пример: Извлекаем заголовки h1, h2 и ссылки
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
