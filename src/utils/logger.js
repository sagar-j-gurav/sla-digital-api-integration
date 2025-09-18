/**
 * Logger Utility
 * Centralized logging for the SLA Digital API integration
 */

const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'white',
  silly: 'gray'
};

// Add colors to winston
winston.addColors(colors);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} ${level}: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  const logDir = process.env.LOG_FILE_PATH || 'logs';
  
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
  
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
}

// Create specialized loggers for different components
class ComponentLogger {
  constructor(component) {
    this.component = component;
  }

  log(level, message, meta = {}) {
    logger.log(level, message, { component: this.component, ...meta });
  }

  error(message, meta) {
    this.log('error', message, meta);
  }

  warn(message, meta) {
    this.log('warn', message, meta);
  }

  info(message, meta) {
    this.log('info', message, meta);
  }

  http(message, meta) {
    this.log('http', message, meta);
  }

  verbose(message, meta) {
    this.log('verbose', message, meta);
  }

  debug(message, meta) {
    this.log('debug', message, meta);
  }
}

// Logger for API requests/responses
class APILogger extends ComponentLogger {
  constructor() {
    super('API');
  }

  logRequest(method, url, params) {
    this.http(`${method} ${url}`, { params });
  }

  logResponse(status, data) {
    this.http(`Response: ${status}`, { data });
  }

  logError(error) {
    this.error('API Error', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
  }
}

// Logger for operator operations
class OperatorLogger extends ComponentLogger {
  constructor() {
    super('Operator');
  }

  logOperation(operator, operation, params) {
    this.info(`[${operator}] ${operation}`, { params });
  }

  logSuccess(operator, operation, result) {
    this.info(`[${operator}] ${operation} successful`, { result });
  }

  logFailure(operator, operation, error) {
    this.error(`[${operator}] ${operation} failed`, {
      error: error.message,
      code: error.code
    });
  }
}

// Logger for webhook events
class WebhookLogger extends ComponentLogger {
  constructor() {
    super('Webhook');
  }

  logReceived(operator, type, data) {
    this.info(`Webhook received: ${operator} - ${type}`, { data });
  }

  logProcessed(operator, type, result) {
    this.info(`Webhook processed: ${operator} - ${type}`, { result });
  }

  logError(operator, error) {
    this.error(`Webhook error: ${operator}`, {
      error: error.message,
      stack: error.stack
    });
  }
}

// Logger for system events
class SystemLogger extends ComponentLogger {
  constructor() {
    super('System');
  }

  logStartup(config) {
    this.info('System starting', { config });
  }

  logShutdown() {
    this.info('System shutting down');
  }

  logHealthCheck(status) {
    this.verbose('Health check', { status });
  }
}

// Export logger instances
module.exports = {
  logger,
  apiLogger: new APILogger(),
  operatorLogger: new OperatorLogger(),
  webhookLogger: new WebhookLogger(),
  systemLogger: new SystemLogger(),
  ComponentLogger
};