import { EventStatistics } from "./event-statistics";
import { awaitTimeout, randomTo } from "./utils";
import { logWithTimestamp } from "./logging";

export enum EventRepositoryError {
  TOO_MANY = "Too many requests",
  RESPONSE_FAIL = "Response delivery fail",
  REQUEST_FAIL = "Request fail",
}

export class TooManyRequestsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TooManyRequestsError";
  }
}

export class RequestFailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestFailError";
  }
}

export class EventDelayedRepository<T extends string> extends EventStatistics<T> {
  private lastRequestDate: Date = new Date();
  private eventSaveDelayMs: number;

  constructor(eventSaveDelayMs: number = 150) {
    super();
    this.eventSaveDelayMs = eventSaveDelayMs;
  }

  async updateEventStatsBy(eventName: T, by: number) {
    const now = new Date();

    if (now.getTime() < this.lastRequestDate.getTime() + this.eventSaveDelayMs) {
      throw new TooManyRequestsError(EventRepositoryError.TOO_MANY);
    }

    this.lastRequestDate = now;

    logWithTimestamp(`Simulating delay for event ${eventName}`);
    await awaitTimeout(randomTo(100)); 

    const chance = randomTo(1000);
    if (chance < 50) throw new RequestFailError(EventRepositoryError.REQUEST_FAIL);
    this.setStats(eventName, this.getStats(eventName) + by);

    if (chance > 950) throw new Error(EventRepositoryError.RESPONSE_FAIL);
  }
}
