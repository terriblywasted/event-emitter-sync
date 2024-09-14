import { EventEmitter } from "./emitter";
import { EventDelayedRepository } from "./event-repository";
import { EventStatistics } from "./event-statistics";
import { ResultsTester } from "./results-tester";
import { triggerRandomly, awaitTimeout } from "./utils";
import { logWithTimestamp } from "./logging";

const MAX_EVENTS = 1000;
const EVENT_FIRE_DELAY = 300;
const MAX_RETRIES = 10;

enum EventName {
  EventA = "A",
  EventB = "B",
}

const EVENT_NAMES = [EventName.EventA, EventName.EventB];

function init() {
  const emitter = new EventEmitter<EventName>();

  triggerRandomly(() => emitter.emit(EventName.EventA), MAX_EVENTS, EVENT_FIRE_DELAY);
  triggerRandomly(() => emitter.emit(EventName.EventB), MAX_EVENTS, EVENT_FIRE_DELAY);

  const repository = new EventRepository();
  const handler = new EventHandler(emitter, repository);

  const resultsTester = new ResultsTester({
    eventNames: EVENT_NAMES,
    emitter,
    handler,
    repository,
  });
  resultsTester.showStats(20);
}

function subscribeToEvents(
  eventNames: EventName[],
  emitter: EventEmitter<EventName>,
  handler: EventHandler
) {
  eventNames.forEach((eventName) => {
    emitter.subscribe(eventName, () => {
      logWithTimestamp(`Event ${eventName} fired.`);
      handler.handleEvent(eventName);
    });
  });
}

class EventHandler extends EventStatistics<EventName> {
  repository: EventRepository;
  private eventQueue: Map<EventName, number> = new Map();
  private lock = false;

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.repository = repository;
    subscribeToEvents(EVENT_NAMES, emitter, this);
  }

  handleEvent(eventName: EventName) {
    this.setStats(eventName, this.getStats(eventName) + 1);
    this.eventQueue.set(eventName, (this.eventQueue.get(eventName) || 0) + 1);

    if (this.eventQueue.get(eventName)! >= 3) { 
      this.syncWithRepository(eventName);
    }
  }

  async syncWithRepository(eventName: EventName) {
    if (this.lock) return;
    this.lock = true;

    const eventsToSync = this.eventQueue.get(eventName) || 0;
    this.eventQueue.set(eventName, 0);

    try {
      await this.repository.saveBatchEventData(eventName, eventsToSync);
      logWithTimestamp(`Event ${eventName} synchronized with repository.`);
    } catch (error) {
      logWithTimestamp(`Error syncing event ${eventName}: ${error.message}`);
    } finally {
      this.lock = false;
    }
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  async saveBatchEventData(eventName: EventName, batchCount: number, retryCount = 0) {
    try {
      await this.updateEventStatsBy(eventName, batchCount);
      logWithTimestamp(`Batch of ${batchCount} events for ${eventName} saved.`);
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        const backoffDelay = Math.pow(2, retryCount) * 100; 
        logWithTimestamp(`Retrying event ${eventName} (attempt ${retryCount + 1}) after ${backoffDelay}ms`);
        await awaitTimeout(backoffDelay);
        await this.saveBatchEventData(eventName, batchCount, retryCount + 1);
      } else {
        logWithTimestamp(`Failed to save event ${eventName} after ${MAX_RETRIES} retries.`);
      }
    }
  }
}

init();