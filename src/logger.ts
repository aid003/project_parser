import log4js from 'log4js';

log4js.configure({
  appenders: {
    file: { type: 'file', filename: 'logs/parser.log' },
    console: { type: 'console' }
  },
  categories: {
    default: { appenders: ['file', 'console'], level: 'info' }
  }
});

const logger = log4js.getLogger();
export default logger;
