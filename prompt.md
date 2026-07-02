# Newton's Cradle — Three.js Implementation Prompt

You are building an interactive **Newton's Cradle** simulation using **Three.js**. The existing codebase already has a basic implementation of a Newton's Cradle with balls, strings, physics, collision detection, energy tracking, scenarios, and UI. Your task is to extend and fix the project according to the requirements below.

## Environment Navigation (WASD)

- The user must be able to navigate (move) the camera in the 3D environment using the **W**, **A**, **S**, and **D** keys.
- Use keyboard event listeners to map these keys to camera movement in the XZ plane (or appropriate 3D space).
- The camera should move relative to its current viewing direction (i.e., forward/backward/left/right from the camera's perspective).

## Ball Dragging (Mouse Interaction)

- Each ball must be **draggable** with the mouse.
- The user must be able to move a ball along **all three axes** (X, Y, Z), not just a single axis.
- Use raycasting to detect which ball the user clicks on, and implement a drag mechanism that translates mouse movement into 3D movement of the ball.
- Consider using a drag plane or transforming screen coordinates into 3D movement to achieve natural multi-axis dragging.

## Fix Case 5 — Equilibrium Tilt Bug

- **Case 5** currently has a bug: some of the balls are **tilted** (not hanging straight down) when they should be at **equilibrium**.
- This is physically incorrect — at equilibrium, all balls must hang vertically straight with no tilt.
- Diagnose and fix the root cause of this tilt. This may involve:
  - Incorrect initial positions/angles.
  - Forces or constraints not being properly zeroed at rest.
  - Physics integration issues that prevent the system from settling correctly.

## String Simulation and Interactions

### String as a Physical Object

- The **string** must be treated as a full physical object, not just a visual line.
- Simulate:
  - **String-to-ball collisions** — strings must collide and interact with balls.
  - **String-to-string collisions** — strings must collide and interact with each other.

### String Types

- There are **three types of strings**, selectable from the user interface:
  1. **Regular string** — normal physical behavior.
  2. **Steel string** — stiffer, higher tension, less elasticity.
  3. **Elastic string** — stretchy, lower tension, more flexibility.
- Provide a UI control (e.g., dropdown, radio buttons, or segmented control) to switch between string types.
- The string type selection must affect the physical properties of the strings in the simulation (tension, stiffness, elasticity, etc.).

## String Tangling

- Handle cases where strings become **twisted or tangled**.
- The simulation should detect and respond to tangled configurations gracefully.
- Decide on a strategy:
  - Untangling logic that resolves overlaps.
  - Visual feedback when tangling occurs.
  - Or a reset mechanism for tangled strings.
- Ensure the simulation remains stable and does not break or produce invalid states when strings tangle.
