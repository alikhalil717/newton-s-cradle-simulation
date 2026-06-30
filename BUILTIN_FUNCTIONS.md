# Built-in JavaScript Functions Used in the Physics Simulation

This document catalogs every **built-in JavaScript / Web API** function used across the physics-related source files in this Newton's Cradle project. It excludes Three.js library calls, lil-gui, and the project's own modules — only native language features.

---

## Table of Contents

1. [Constructor / Class](#1-constructor--class)
2. [Math &amp; Number](#2-math--number)
3. [Object](#3-object)
4. [Array](#4-array)
5. [Set](#5-set)
6. [Number / Number Constants](#6-number--number-constants)
7. [Map &amp; Iterable Patterns](#7-map--iterable-patterns)

---

## 1. Constructor / Class

| Function               | File(s)                                                               | Usage                                                                                                  |
| ---------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `constructor()`        | `physics.js`, `collisions.js`, `energy.js`, `ball.js`, `scenarios.js` | Class constructor — initialises instance properties (gravity, drag, restitution, history arrays, etc.) |
| `super()` _(not used)_ | —                                                                     | Not needed; none of these classes extend a parent class                                                |

---

## 2. Math & Number

| Function         | File(s)                     | Usage                                                                                                                                                                              |
| ---------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Math.sin(x)`    | `ball.js`, `scenarios.js`   | Compute sine of an angle. Used in `setAngularState()` to convert spherical coordinates `(θ, φ)` to Cartesian position, and in `stringHalfSpread` / `effectiveLength` calculations. |
| `Math.cos(x)`    | `ball.js`, `scenarios.js`   | Compute cosine of an angle. Same locations as `Math.sin` — spherical → Cartesian conversion and effective length computation.                                                      |
| `Math.min(a, b)` | `physics.js`, `energy.js`   | Return the smaller of two values. Used to clamp delta-time (`clampedDt`), cap the substep size, and limit energy history array length.                                             |
| `Math.max(a, b)` | `energy.js`, `scenarios.js` | Return the larger of two values. Used to ensure cumulative dissipation is non-negative, and to compute maximum radius for spacing calculations.                                    |
| `Math.abs(x)`    | `energy.js`                 | Return absolute value. Used to ensure air drag work and friction work contributions are non-negative for cumulative tracking.                                                      |
| `Math.floor(x)`  | `scenarios.js`              | Round down to nearest integer. Used to find the middle index of a ball chain (`Math.floor(N / 2)`).                                                                                |

---

## 3. Object

| Function                           | File(s)        | Usage                                                                                                                                                    |
| ---------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Object.keys(obj)`                 | `scenarios.js` | Return an array of a given object's own enumerable property names. Used to get the list of scenario names from the `scenarios` dictionary.               |
| `Array.from({ length: N }, mapFn)` | `scenarios.js` | Create a new array from an array-like or iterable object. Used to generate mass arrays with a mapping function in the unequal-masses scenario (`case7`). |

---

## 4. Array

| Function               | File(s)                                                    | Usage                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `array.push(item)`     | `energy.js`, `scenarios.js`                                | Append an element to the end of an array. Used to push energy history entries and balls into the chain array.                           |
| `array.shift()`        | `energy.js`                                                | Remove the first element from an array. Used to trim the energy history when it exceeds `maxHistoryLength`.                             |
| `array.length`         | `physics.js`, `collisions.js`, `energy.js`, `scenarios.js` | Get the number of elements in an array. Used in loops (`for`), bounds checking, and conditional tests throughout.                       |
| `Array.isArray(value)` | `scenarios.js`                                             | Determine whether a value is an array. Used to check if `mass`, `radius`, or `length` parameters are per-ball arrays vs. single values. |
| `array.fill(value)`    | `scenarios.js`                                             | Fill all elements of an array with a static value. Used to create uniform-length or uniform-mass arrays.                                |

---

## 5. Set

| Function                       | File(s)                       | Usage                                                                                                                         |
| ------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `set.add(value)`               | `physics.js`, `collisions.js` | Add a new element to a `Set`. Used to mark which ball indices are currently in contact after a collision.                     |
| `set.clear()`                  | `physics.js`                  | Remove all elements from a `Set`. Called each physics step to reset the contact set before the next substep.                  |
| `set.has(value)` _(not found)_ | —                             | Not directly used in the scanned files (but `inContact` is a `Set` instance, so `has()` is available for external consumers). |

---

## 6. Number / Number Constants

| Function / Constant           | File(s)                   | Usage                                                                                                 |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Number.prototype.toFixed(n)` | _(via `main.js`)_         | Format a number with `n` decimal places. Used in the energy HUD display (`energyHud.innerHTML`).      |
| `Math.PI`                     | `ball.js`, `scenarios.js` | The mathematical constant π. Used extensively for angle conversions and default angular displacement. |

---

## 7. Map & Iterable Patterns

| Function             | File(s)                         | Usage                                                                                                                                   |
| -------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `for...of` loop      | `physics.js`                    | Iterate over the `balls` array. Used for force computation, integration, constraint projection, and force-clearing loops.               |
| `for` loop (classic) | `collisions.js`, `scenarios.js` | Indexed iteration — used for pair-wise collision checks (`i`, `j` loops) and chain creation.                                            |
| `array.map(fn)`      | `scenarios.js`                  | Transform each element of an array via a callback. Used in `createChain` to generate mass arrays with `Array.from` + map-like patterns. |

---

## Summary by File

### `src/physics.js`

| Built-in          | Context                                                           |
| ----------------- | ----------------------------------------------------------------- |
| `constructor()`   | Initialises gravity, drag, friction, substep config, accumulators |
| `Math.min()`      | Clamp delta-time and substep size                                 |
| `for...of`        | Iterate balls for forces, integration, constraint projection      |
| `Set.add()`       | Mark in-contact balls                                             |
| `Set.clear()`     | Reset contact sets each substep                                   |
| `.length` (Array) | Check ball count                                                  |

### `src/collisions.js`

| Built-in                | Context                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `constructor()`         | Initialises restitution coefficient and energy accumulator |
| `for` (classic, nested) | Pair-wise collision detection (`i`, `j` loops)             |
| `.length` (Array)       | Number of balls for loop bounds                            |
| `Set.add()`             | Mark colliding pairs                                       |

### `src/energy.js`

| Built-in        | Context                                               |
| --------------- | ----------------------------------------------------- |
| `constructor()` | Initialises history array and cumulative accumulators |
| `Math.max()`    | Clamp collision loss to ≥ 0                           |
| `Math.abs()`    | Ensure drag/friction work is non-negative             |
| `array.push()`  | Append energy snapshot to history                     |
| `array.shift()` | Trim history when it exceeds max length               |
| `array.length`  | Check history size, get latest entry index            |

### `src/ball.js`

| Built-in        | Context                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| `constructor()` | Initialises position, velocity, acceleration, force vectors, contact set |
| `Math.sin()`    | Spherical → Cartesian coordinate conversion, effective length            |
| `Math.cos()`    | Same — spherical coordinate conversion                                   |
| `Math.PI`       | Angle constants                                                          |

### `src/scenarios.js`

| Built-in                                | Context                                    |
| --------------------------------------- | ------------------------------------------ |
| `constructor()`                         | Registers scenario presets in a dictionary |
| `Object.keys()`                         | Get list of scenario names                 |
| `Math.sin()` / `Math.cos()` / `Math.PI` | Angle calculations in scenario setups      |
| `Array.isArray()`                       | Check for per-ball parameter arrays        |
| `Array.from()`                          | Generate mass arrays                       |
| `array.fill()`                          | Create uniform-length arrays               |
| `Math.floor()`                          | Find middle index of chain                 |
| `for` (classic)                         | Chain creation loop                        |

---

_Generated from `src/physics.js`, `src/collisions.js`, `src/energy.js`, `src/ball.js`, and `src/scenarios.js`._
