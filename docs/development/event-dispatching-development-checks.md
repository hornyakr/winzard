# Event-dispatching development checks

Event tests exit: 1
Typecheck exit: 2

## Event tests
```text

[1m[30m[46m RUN [49m[39m[22m [36mv4.1.10 [39m[90m/home/runner/work/winzard/winzard[39m

 [31m❯[39m packages/forge/tests/events.test.ts [2m([22m[2m4 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[32m 51[2mms[22m[39m
[31m     [31m×[31m deterministic inventoryt épít[39m[32m 24[2mms[22m[39m
     [32m✓[39m publikálja a teljes event és messaging command felületet[32m 1[2mms[22m[39m
     [32m✓[39m ciklust és durable policy hibát jelez[32m 13[2mms[22m[39m
     [32m✓[39m generated artifact driftet észlel[32m 11[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m packages/forge/tests/events.test.ts[2m > [22mForge event platform[2m > [22mdeterministic inventoryt épít
[31m[1mAssertionError[22m: expected [ { severity: 'error', …(5) } ] to deeply equal [][39m

[32m- Expected[39m
[31m+ Received[39m

[32m- [][39m
[31m+ [[39m
[31m+   {[39m
[31m+     "area": "registry",[39m
[31m+     "code": "EVENT_DUPLICATE_ID",[39m
[31m+     "eventType": "orders.order.placed",[39m
[31m+     "file": "src/composition/order.event.definition.ts",[39m
[31m+     "message": "Duplikált event azonosító vagy type: orders.order.placed.",[39m
[31m+     "severity": "error",[39m
[31m+   },[39m
[31m+ ][39m

[36m [2m❯[22m packages/forge/tests/events.test.ts:[2m10:285[22m[39m


[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m3 passed[39m[22m[90m (4)[39m
[2m   Start at [22m 13:48:25
[2m   Duration [22m 698ms[2m (transform 202ms, setup 0ms, import 515ms, tests 51ms, environment 0ms)[22m


::error file=/home/runner/work/winzard/winzard/packages/forge/tests/events.test.ts,title=packages/forge/tests/events.test.ts > Forge event platform > deterministic inventoryt épít,line=10,column=285::AssertionError: expected [ { severity: 'error', …(5) } ] to deeply equal []%0A%0A- Expected%0A+ Received%0A%0A- []%0A+ [%0A+   {%0A+     "area": "registry",%0A+     "code": "EVENT_DUPLICATE_ID",%0A+     "eventType": "orders.order.placed",%0A+     "file": "src/composition/order.event.definition.ts",%0A+     "message": "Duplikált event azonosító vagy type: orders.order.placed.",%0A+     "severity": "error",%0A+   },%0A+ ]%0A%0A ❯ packages/forge/tests/events.test.ts:10:285%0A%0A
```

## Typecheck
```text
$ tsc -p tsconfig.json --noEmit && tsc -p apps/reference/tsconfig.json --noEmit && tsc -p packages/config/tsconfig.json --noEmit && tsc -p packages/forge/tsconfig.json --noEmit
apps/reference/src/modules/demo/lucky-number/presentation/lucky-number-view.tsx(4,30): error TS2307: Cannot find module './assets/lucky-number-orbit.svg' or its corresponding type declarations.
[ELIFECYCLE] Command failed with exit code 2.
```
