const MAX_EVENTS = 10000;
const EVENT_SAVE_DELAY_MS = 3 * 100;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 500;
let BATCH_SIZE = 5;
const RETRY_SCALING_FACTOR = 2;
const DEAD_LETTER_QUEUE_RETRY_INTERVAL = 5000;
const DEAD_LETTER_QUEUE_MAX_RETRIES = 5;
const DEAD_LETTER_QUEUE_EXPIRY_MS = 30000;
let IMMEDIATE_PROCESS_THRESHOLD = 10;
const LOGGING_INTERVAL = 1000;

enum EventRepositoryError {
  TOO_MANY = "Too many requests",
  RESPONSE_FAIL = "Response delivery fail",
  REQUEST_FAIL = "Request fail",
}

enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

enum EventName {
  EventA = "A",
  EventB = "B",
}

const EVENT_NAMES = [EventName.EventA, EventName.EventB];

function randomTo(ms: number) {
  return Math.floor(Math.random() * ms);
}

async function triggerRandomly(clb: VoidFunction, maxFires: number, diff: number = 50) {
  if (maxFires <= 0) return;
  await awaitTimeout(randomTo(diff));
  clb();
  triggerRandomly(clb, maxFires - 1, diff);
}

async function awaitTimeout(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

class EventEmitter<T extends string> {
  events: Map<T, VoidFunction[]>;

  constructor() {
    this.events = new Map();
  }

  subscribe(eventName: T, callback: VoidFunction) {
    const eventSubscribers = this.events.get(eventName);
    this.events.set(eventName, [...(eventSubscribers || []), callback]);
  }

  unsubscribe(eventName: T, callback: VoidFunction) {
    const eventSubscribers = this.events.get(eventName);
    if (!eventSubscribers) return;

    this.events.set(
      eventName,
      eventSubscribers.filter((s) => s !== callback)
    );
  }

  emit(eventName: T) {
    const eventSubscribers = this.events.get(eventName);
    if (!eventSubscribers) return;

    for (const callback of eventSubscribers) {
      callback();
    }
  }
}

class Logger {
  private lastLogTime: number = 0;

  log(level: LogLevel, message: string) {
    const currentTime = Date.now();
    if (currentTime - this.lastLogTime > LOGGING_INTERVAL) {
      console.log(`[${level}] - ${message}`);
      this.lastLogTime = currentTime;
    }
  }
}

const logger = new Logger();

enum ErrorType {
  TEMPORARY = "Temporary",
  PERMANENT = "Permanent",
}

class RetryService<T extends string> {
  private retryCounter: Map<T, number> = new Map();
  private deadLetterQueue: { eventName: T; value: number; addedAt: Date; retries: number }[] = [];

  async retrySavingEvent(
    eventName: T,
    saveFunction: (eventName: T, value: number) => Promise<void>,
    value: number,
    onError?: (eventName: T) => void
  ) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const backoff = RETRY_BACKOFF_MS * Math.pow(RETRY_SCALING_FACTOR, attempt) + randomTo(100);
        await awaitTimeout(backoff);
        await saveFunction(eventName, value);
        logger.log(LogLevel.INFO, `Successfully retried saving ${eventName} after ${attempt} attempt(s)`);
        this.resetRetryCount(eventName);
        return;
      } catch (error) {
        logger.log(LogLevel.WARN, `EVENT_FAILURE: Failed to save event ${eventName} on attempt ${attempt}: ${error}`);
      }
    }

    this.addToDeadLetterQueue(eventName, value, onError);
  }

  private resetRetryCount(eventName: T) {
    this.retryCounter.set(eventName, 0);
  }

  private addToDeadLetterQueue(eventName: T, value: number, onError?: (eventName: T) => void) {
    this.deadLetterQueue.push({ eventName, value, addedAt: new Date(), retries: 0 });
    logger.log(LogLevel.ERROR, `EVENT_FAILURE: Event ${eventName} added to dead-letter queue after ${MAX_RETRIES} retries.`);

    if (onError) onError(eventName);
  }

  async retryDeadLetterQueue(
    saveFunction: (eventName: T, value: number) => Promise<void>,
    onError?: (eventName: T) => void
  ) {
    for (const event of this.deadLetterQueue) {
      const currentTime = Date.now();
      if (currentTime - event.addedAt.getTime() > DEAD_LETTER_QUEUE_EXPIRY_MS) {
        logger.log(LogLevel.ERROR, `EVENT_FAILURE: Event ${event.eventName} expired in dead-letter queue`);
        this.removeFromDeadLetterQueue(event);
        continue;
      }

      if (event.retries >= DEAD_LETTER_QUEUE_MAX_RETRIES) {
        logger.log(LogLevel.ERROR, `EVENT_FAILURE: Event ${event.eventName} exceeded max retry attempts in dead-letter queue`);
        this.removeFromDeadLetterQueue(event);

        if (onError) onError(event.eventName);
        continue;
      }

      try {
        await saveFunction(event.eventName, event.value);
        logger.log(LogLevel.INFO, `Successfully retried event from dead-letter queue: ${event.eventName}`);
        this.removeFromDeadLetterQueue(event);
      } catch (error) {
        logger.log(LogLevel.WARN, `Failed to retry event from dead-letter queue: ${event.eventName}`);
        event.retries++;
      }
    }
  }

  private removeFromDeadLetterQueue(event: { eventName: T; value: number }) {
    this.deadLetterQueue = this.deadLetterQueue.filter(e => e !== event);
  }
}

function init() {
  const emitter = new EventEmitter<EventName>();

  triggerRandomly(() => emitter.emit(EventName.EventA), MAX_EVENTS);
  triggerRandomly(() => emitter.emit(EventName.EventB), MAX_EVENTS);

  const repository = new EventRepository();
  const handler = new EventHandler(emitter, repository, handleCriticalError);

  const eventsCount: { [k in EventName]: number } = {
    [EventName.EventA]: 0,
    [EventName.EventB]: 0,
  };

  async function showStats() {
    function subscribeAndCountEvent(eventName: EventName) {
      emitter.subscribe(
        eventName,
        () => (eventsCount[eventName] = eventsCount[eventName] + 1)
      );
    }

    function compareEventWithHandlerAndRepository(eventName: EventName) {
      console.log(
        `Event ${eventName}:`,
        `Fired ${eventsCount[eventName]} times,`,
        `In handler ${handler.getStats(eventName)},`,
        `In repo ${handler.repository.getStats(eventName)}`
      );
    }

    EVENT_NAMES.map(subscribeAndCountEvent);

    const syncInterval = setInterval(() => {
      logger.log(LogLevel.INFO, "\n---- Syncing Stats ----");
      EVENT_NAMES.map(compareEventWithHandlerAndRepository);
      EVENT_NAMES.forEach(async (eventName) => {
        await handler.syncWithRepository(eventName);
      });
      repository.retryService.retryDeadLetterQueue(repository.saveEventData.bind(repository), handleCriticalError);
    }, 3000);

    setTimeout(() => {
      clearInterval(syncInterval);
      logger.log(LogLevel.INFO, "Final sync completed.");
      verifyFinalState(eventsCount, handler, repository);
    }, calculateFinalSyncTimeout(MAX_EVENTS, 50));
  }

  showStats();
}

function calculateFinalSyncTimeout(maxEvents: number, eventDuration: number): number {
  return Math.ceil(maxEvents * (eventDuration / 2)); 
}

function verifyFinalState(
  eventsCount: { [k in EventName]: number },
  handler: EventHandler,
  repository: EventRepository
) {
  let success = true;
  EVENT_NAMES.forEach((eventName) => {
    const handlerStats = handler.getStats(eventName);
    const repoStats = repository.getStats(eventName);

    if (handlerStats !== eventsCount[eventName] || repoStats !== eventsCount[eventName]) {
      success = false;
      logger.log(LogLevel.ERROR, `Final state mismatch for ${eventName}: Fired ${eventsCount[eventName]}, In handler ${handlerStats}, In repo ${repoStats}`);
      handler.syncWithRepository(eventName);
    }
  });

  if (success) {
    logger.log(LogLevel.INFO, "All events synchronized successfully.");
  } else {
    logger.log(LogLevel.ERROR, "Some events failed to sync properly. Reconciliation attempted.");
  }
}

function handleCriticalError(eventName: EventName) {
  logger.log(LogLevel.ERROR, `Critical failure in syncing event: ${eventName}`);
}

class EventStatistics<T extends string> {
  private eventStats: Map<T, number> = new Map();

  getStats(eventName: T): number {
    return this.eventStats.get(eventName) || 0;
  }

  setStats(eventName: T, value: number) {
    this.eventStats.set(eventName, value);
  }
}

class EventDelayedRepository<T extends string> extends EventStatistics<T> {
  private lastRequestDate: Date = new Date();
  private eventQueue: { eventName: T; value: number }[] = [];
  private isProcessingQueue = false;
  retryService: RetryService<T>;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.retryService = new RetryService<T>();
  }

  async debouncedBatchUpdateEventStats() {
    if (this.eventQueue.length === 0) {
      this.stopQueueProcessing();
      return;
    }
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    if (!this.intervalId) {
      this.intervalId = setInterval(async () => {
        if (this.eventQueue.length === 0) {
          this.stopQueueProcessing();
          return;
        }

        const eventsToProcess = this.eventQueue.splice(0, BATCH_SIZE);
        for (const event of eventsToProcess) {
          try {
            await this.updateEventStatsBy(event.eventName, event.value);
          } catch (e) {
            logger.log(LogLevel.ERROR, `EVENT_FAILURE: Failed to process event ${event.eventName}, ${e}`);
            this.retryService.retrySavingEvent(event.eventName, this.updateEventStatsBy.bind(this), event.value);
          }
        }
      }, 500);
    }

    this.isProcessingQueue = false;
  }

  private stopQueueProcessing() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async updateEventStatsBy(eventName: T, by: number) {
    const now = new Date();
    if (now.getTime() < this.lastRequestDate.getTime() + EVENT_SAVE_DELAY_MS) {
      throw EventRepositoryError.TOO_MANY;
    }
    this.lastRequestDate = now;

    this.setStats(eventName, this.getStats(eventName) + by);
  }

  addEventToQueue(eventName: T, value: number) {
    this.eventQueue.push({ eventName, value });
    this.processQueueImmediatelyIfNeeded();
    this.debouncedBatchUpdateEventStats();
  }

  private processQueueImmediatelyIfNeeded() {
    if (this.eventQueue.length >= IMMEDIATE_PROCESS_THRESHOLD) {
      logger.log(LogLevel.INFO, "Immediate processing triggered due to high event rate");
      this.debouncedBatchUpdateEventStats();
      this.adjustImmediateProcessingThreshold();
    }
  }

  private adjustImmediateProcessingThreshold() {
    if (this.eventQueue.length > IMMEDIATE_PROCESS_THRESHOLD) {
      IMMEDIATE_PROCESS_THRESHOLD = Math.min(IMMEDIATE_PROCESS_THRESHOLD + 5, 50); 
    } else if (IMMEDIATE_PROCESS_THRESHOLD > 10) {
      IMMEDIATE_PROCESS_THRESHOLD = Math.max(IMMEDIATE_PROCESS_THRESHOLD - 5, 10);
    }
  }
}

class EventHandler extends EventStatistics<EventName> {
  repository: EventRepository;
  private errorCallback: (eventName: EventName) => void;

  constructor(
    emitter: EventEmitter<EventName>,
    repository: EventRepository,
    errorCallback: (eventName: EventName) => void
  ) {
    super();
    this.repository = repository;
    this.errorCallback = errorCallback;

    emitter.subscribe(EventName.EventA, () => this.handleEvent(EventName.EventA));
    emitter.subscribe(EventName.EventB, () => this.handleEvent(EventName.EventB));
  }

  private async handleEvent(eventName: EventName) {
    this.setStats(eventName, this.getStats(eventName) + 1);

    try {
      await this.repository.saveEventData(eventName, 1);
    } catch (e) {
      logger.log(LogLevel.ERROR, `EVENT_FAILURE: Error in repository sync for ${eventName}: ${e}`);
      this.repository.retryService.retrySavingEvent(eventName, this.repository.saveEventData.bind(this.repository), 1, this.errorCallback);
    }
  }

  async syncWithRepository(eventName: EventName) {
    const localStats = this.getStats(eventName);
    const repoStats = this.repository.getStats(eventName);
    const difference = localStats - repoStats;

    if (difference > 0) {
      try {
        await this.repository.saveEventData(eventName, difference);
      } catch (e) {
        logger.log(LogLevel.ERROR, `EVENT_FAILURE: Failed to sync with repository for event ${eventName}: ${e}`);
        this.repository.retryService.retrySavingEvent(eventName, this.repository.saveEventData.bind(this.repository), difference, this.errorCallback);
      }
    }
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  async saveEventData(eventName: EventName, value: number) {
    this.addEventToQueue(eventName, value);
  }
}

init();