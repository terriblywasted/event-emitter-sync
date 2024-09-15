/* Check the comments first */

import { EventEmitter } from "./emitter";
import { EventDelayedRepository, EventRepositoryError } from "./event-repository";
import { EventStatistics } from "./event-statistics";
import { ResultsTester } from "./results-tester";
import { triggerRandomly } from "./utils";

const MAX_EVENTS = 1000;

enum EventName {
  EventA = "A",
  EventB = "B",
}

const EVENT_NAMES = [EventName.EventA, EventName.EventB];

/*

  An initial configuration for this case

*/

function init() {
  const emitter = new EventEmitter<EventName>();

  triggerRandomly(() => emitter.emit(EventName.EventA), MAX_EVENTS);
  triggerRandomly(() => emitter.emit(EventName.EventB), MAX_EVENTS);

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

class EventHandler extends EventStatistics<EventName> {
  repository: EventRepository;

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.repository = repository;

    EVENT_NAMES.forEach((eventName) => {
      emitter.subscribe(eventName, () => {
        const currentLocalValue = this.getStats(eventName) + 1;
    
        this.setStats(eventName, currentLocalValue)
    
        this.repository.saveEventData(eventName, currentLocalValue)
      });
    })
  }
}

class Throttler {
  private func: (...args: unknown[]) => void;
  private limit: number;
  private lastFunc: ReturnType<typeof setTimeout> | null = null;
  private lastRan: number | null = null;

  constructor(func: (...args: unknown[]) => void, limit: number) {
    this.func = func;
    this.limit = limit;
  }

  public throttle(...args: unknown[]): void {
    const context = this;

    if (this.lastRan === null) {
      this.func.apply(context, args);
      this.lastRan = Date.now();
    } else {
      if (this.lastFunc !== null) {
        clearTimeout(this.lastFunc);
      }

      this.lastFunc = setTimeout(() => {
        if ((Date.now() - (context.lastRan as number)) >= context.limit) {
          context.func.apply(context, args);
          context.lastRan = Date.now();
        }
      }, this.limit - (Date.now() - (this.lastRan as number)));
    }
  }
}

type EventThread = {
  previousSyncedValue: number;
  isUpdating: boolean;
};

const thredNotFoundError = new Error('Thread not found');
const REQUEST_REMOTE_UPDATE_THROTTLE = 150;

class EventRepository extends EventDelayedRepository<EventName> {
  eventUpdatingThrteads = new Map<EventName, EventThread>();
  requestRemoteUpdateTrhrottled: Throttler

  constructor() {
    super();

    this.requestRemoteUpdateTrhrottled = new Throttler(this.requestRemoteUpdate, REQUEST_REMOTE_UPDATE_THROTTLE);
  }

  public saveEventData = async (eventName: EventName, currentLocalValue: number) => {
    this.requestRemoteUpdateTrhrottled.throttle(eventName, currentLocalValue);  
  }

  private lockThread = (eventName: EventName) => {
    const thread = this.eventUpdatingThrteads.get(eventName)

    if(!thread) {
      throw thredNotFoundError
    }

    this.eventUpdatingThrteads.set(eventName, {
      ...thread,
      isUpdating: true
    })
  }

  private unlockThread = (eventName: EventName) => {
    const thread = this.eventUpdatingThrteads.get(eventName)

    if(!thread) {
      throw thredNotFoundError
    }

    this.eventUpdatingThrteads.set(eventName, {
      ...thread,
      isUpdating: false
    })
  }

  private unlockAndUpdateThread = (eventName: EventName, currentSyncedValue: number) => {
    this.eventUpdatingThrteads.set(eventName, {
      previousSyncedValue: currentSyncedValue,
      isUpdating: false
    })
  }

  private requestRemoteUpdate = async (eventName: EventName, currentLocalValue: number) => {
    if(!this.eventUpdatingThrteads.has(eventName)) {
      this.eventUpdatingThrteads.set(eventName, {
        previousSyncedValue: 0,
        isUpdating: false
      })
    } 
    
    const { isUpdating, previousSyncedValue } = this.eventUpdatingThrteads.get(eventName) as EventThread

    if (isUpdating) {
      return;
    }

    try {     
      this.lockThread(eventName);

      await this.updateEventStatsBy(eventName, currentLocalValue - previousSyncedValue)

      
      this.unlockAndUpdateThread(eventName, currentLocalValue)
    } catch (error) {
      if(error.message === thredNotFoundError.message){
        throw error
      }

      if (error === EventRepositoryError.RESPONSE_FAIL) {
        this.unlockAndUpdateThread(eventName, currentLocalValue)
      } else {
        this.unlockThread(eventName)
      }
    }
  }
}

init();
