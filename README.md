# Sync events with emitter to local and remote repo

The implementation of EventHandler (local repo representation) and EventRepository (remote repo representation) is up to you. Main idea is to subscribe to EventEmitter, save it in local stats along with syncing with EventRepository.

The implementation of EventHandler and EventRepository is flexible and left to your discretion. The primary objective is to subscribe to EventEmitter, record the events in `.eventStats`, and ensure synchronization with EventRepository.

The ultimate aim is to have the `.eventStats` of EventHandler and EventRepository have the same values (and equal to the amount of actual events fired by the emitter) by the time MAX_EVENTS have been fired.

## Run

Check the code first, install deps and the `dev` command could help you with running the code,
another `test` command can give you some context as well.

## Providing results

The best way is to fork this github repo, create pull request with changes and provide a link

## Task completion

### We're expecting

- having equal amount of fired events and handled events
- equal amount of fired, saved and synced to fake remote repo events every 2 seconds
- OVERALL RESULTS passed

```ts

// second 1
----
Event A: Fired 73 times, In handler 73, In repo 73,
Event B: Fired 86 times, In handler 86, In repo 86,

// second 2
----
Event A: Fired 115 times, In handler 115, In repo // any amount close to or equal to 115,
Event B: Fired 128 times, In handler 128, In repo // any amount close to or equal to 128,

// results

-–––––- OVERALL RESULTS -–––––-
Success results passed with 100.00
Fail results failed with 0.00 (required 0.85)


```
