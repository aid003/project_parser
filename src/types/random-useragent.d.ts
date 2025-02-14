declare module "random-useragent" {
  export function getRandom(filter?: Record<string, any>): string;
  export function getRandomData(
    filter?: Record<string, any>
  ): Record<string, any>;
  export function getAll(filter?: Record<string, any>): string[];
  export function getAllData(
    filter?: Record<string, any>
  ): Record<string, any>[];
}
