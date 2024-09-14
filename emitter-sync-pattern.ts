/* Check the comments first */

const MAX_EVENTS = 1000;
const EVENT_SAVE_DELAY_MS = 3 * 100;

enum EventRepositoryError {
  TOO_MANY = "Too many requests",
  RESPONSE_FAIL = "Response delivery fail",
  REQUEST_FAIL = "Request fail",
}

enum EventName {
  EventA = "A",
  EventB = "B",
}

const EVENT_NAMES = [EventName.EventA, EventName.EventB];

/*

  Some utils

*/

function randomTo(ms: number) {
  return Math.floor(Math.random() * ms);
}

async function triggerRandomly(
  clb: VoidFunction,
  maxFires: number,
  diff: number = 50
) {
  if (maxFires <= 0) return;
  await awaitTimeout(randomTo(diff));
  clb();
  triggerRandomly(clb, maxFires - 1, diff);
}

async function awaitTimeout(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/*

  Just a simple even emitter with subscribe and unsubscribe methods

*/

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

/*

  An initial configuration for this case

*/

function init() {
  const emitter = new EventEmitter<EventName>();

  triggerRandomly(() => emitter.emit(EventName.EventA), MAX_EVENTS);
  triggerRandomly(() => emitter.emit(EventName.EventB), MAX_EVENTS);

  const repository = new EventRepository();
  const handler = new EventHandler(emitter, repository);

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
        `In repo ${handler.repository.getStats(eventName)},`
      );
    }

    EVENT_NAMES.map(subscribeAndCountEvent);
    let syncTimelineSeconds = 100;

    while (syncTimelineSeconds > 0) {
      await awaitTimeout(1000);
      console.log("\n----");
      EVENT_NAMES.map(compareEventWithHandlerAndRepository);
      syncTimelineSeconds--;
    }
  }

  showStats();
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

/* 
  class EventDelayedRepository

  Simulates basic repository behavior, capable of asynchronously
  saving data. It can also return errors or both save and return
  errors, mimicking real-world scenarios.

  It also resolves with error for "too many requests"

*/

class EventDelayedRepository<T extends string> extends EventStatistics<T> {
  private lastRequestDate: Date = new Date();

  async updateEventStatsBy(eventName: T, by: number) {
    const now = new Date();

    // a little bug: when sending first request we will always get TO_MANY error, so we need to await delay first
    if (now.getTime() < this.lastRequestDate.getTime() + EVENT_SAVE_DELAY_MS) {
      throw EventRepositoryError.TOO_MANY;
    }

    this.lastRequestDate = now;
    await awaitTimeout(randomTo(1000));

    const chance = randomTo(1500);
    if (chance < 300) throw EventRepositoryError.REQUEST_FAIL;
    this.setStats(eventName, this.getStats(eventName) + by);

    if (chance > 1000) throw EventRepositoryError.RESPONSE_FAIL;
  }
}

/* Please do not change the code above this line */
/* ----–––––––––––––––––––––––––––––––––––––---- */

/*

  The implementation of EventHandler and EventRepository is up to you.
  Main idea is to subscribe to EventEmitter, save it in local stats
  along with syncing with EventRepository.

  The implementation of EventHandler and EventRepository is flexible and left to your discretion.
  The primary objective is to subscribe to EventEmitter, record the events in `.eventStats`,
  and ensure synchronization with EventRepository.

  The ultimate aim is to have the `.eventStats` of EventHandler and EventRepository
  have the same values (and equal to the actual events fired by the emitter) by the
  time MAX_EVENTS have been fired.

*/

function isError<ErorType extends EventRepositoryError>(
  e: unknown,
  errorType: ErorType,
): e is ErorType {
  return typeof e === "string" && e === errorType;
}

class Queue<QueueEl> {
  queue: Record<number, QueueEl> = {};
  start = 0;
  end = 0;

  constructor() {
    this.queue = {};
  }

  pushBack(el: QueueEl) {
    this.queue[this.end] = el;
    this.end++;
  }

  popFront(): QueueEl | null {
    const out = this.queue[this.start];
    if (!out) {
      return null;
    }
    delete this.queue[this.start];
    this.start++;
    return out;
  }

  len(): number {
    return this.end - this.start;
  }

  peekBack(): QueueEl | null {
    return this.queue[this.end - 1] || null;
  }
}

class EventTranport {
  paylaod: number;
  type: EventName;
  retryAmount = 0;

  constructor(payload: number, type: EventName) {
    this.paylaod = payload;
    this.type = type;
  }

  batch(rhs: EventTranport): EventTranport {
    this.paylaod += rhs.paylaod;
    return this;
  }

  send(to: EventRepository) {
    return to.saveEventData(this.type, this.paylaod);
  }

  shouldRetry(): boolean {
    //shuld always retry cause of random nature of errors, TODO: replace with actual retry cliff
    return true;
  }
}

class EventHandler extends EventStatistics<EventName> {
  // Feel free to edit this class

  repository: EventRepository;

  eventTypeToQueue = {} as {
    [key in EventName]: Queue<EventTranport>;
  };

  queuesSendLock = false;

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.repository = repository;

    const processEventNames = (name: EventName) => {
      this.eventTypeToQueue[name] = new Queue();
      emitter.subscribe(name, () => this.processEvent(name));
    };

    EVENT_NAMES.map(processEventNames);
  }

  processEvent(name: EventName) {
    this.pushEventToQueue(name);
    this.updateSingleEventStats(name);
    this.sendQueuesEvents();
  }

  pushEventToQueue(name: EventName): EventTranport {
    const newEvent = new EventTranport(1, name);
    const selectedQueue = this.eventTypeToQueue[name];
    const lastEvent = selectedQueue.peekBack();
    if (lastEvent) {
      return lastEvent.batch(newEvent);
    }
    selectedQueue.pushBack(newEvent);
    return newEvent;
  }

  updateSingleEventStats(name: EventName) {
    this.setStats(name, this.getStats(name) + 1);
  }

  async sendQueuesEvents() {
    if (this.queuesSendLock) {
      return;
    }
    this.queuesSendLock = true;
    let hasSomeEvents = true;
    while (hasSomeEvents) {
      let hasSomeEventsInCurIteration = false;
      for (const eventName of EVENT_NAMES) {
        const hasSomeEventsLeftInQueue = await this.processQueue(
          this.eventTypeToQueue[eventName],
        );
        if (hasSomeEventsLeftInQueue) {
          hasSomeEventsInCurIteration = true;
        }
      }
      hasSomeEvents = hasSomeEventsInCurIteration;
    }

    this.queuesSendLock = false;
  }

  async processQueue(queue: Queue<EventTranport>): Promise<boolean> {
    const evenToSend = queue.popFront();
    if (!evenToSend) {
      return false;
    }

    await awaitTimeout(EVENT_SAVE_DELAY_MS);
    try {
      await evenToSend.send(this.repository);
    } catch (e) {
      console.error(
        `Error sending event EventName: ${evenToSend.type} error: ${e}`,
      );
      if (evenToSend.shouldRetry()) {
        queue.pushBack(evenToSend);
      }

      if (isError(e, EventRepositoryError.TOO_MANY)) {
        await awaitTimeout(EVENT_SAVE_DELAY_MS);
      }
    }
    return queue.len() > 0;
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  // Feel free to edit this class

  async saveEventData(eventName: EventName, payload: number) {
    try {
      await this.updateEventStatsBy(eventName, payload);
    } catch (e) {
      console.error(
        `Error updating delayedRepository EventName: ${eventName} error: ${e} `,
      );
      if (isError(e, EventRepositoryError.REQUEST_FAIL)) {
        throw e;
      }

      if (isError(e, EventRepositoryError.TOO_MANY)) {
        throw e;
      }

      if (isError(e, EventRepositoryError.RESPONSE_FAIL)) {
        return;
      }
    }
  }
}

init();
