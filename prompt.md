Fix the following issues in the Newton's Cradle simulation to align it with the physics report (v5.pdf):

In energy.js, correct the header comment P_friction = μk·m·|v_tangential|² to P_friction = μk·N_pivot·|v_tangential| to match the actual (correct) implementation in physics.js.
In main.js, change the default mass from 0.5 to 0.065 (kg) to match report Table 1's typical steel-ball mass, and widen the mass slider range in ui.js (currently 0.1–1.0) to something like 0.01–1.0 so the report's typical value is reachable.
In main.js, change the default radius from 0.0125 to 0.02 (m) to match report Table 1.
(Optional, scope decision) Either implement P_internal (Kelvin–Voigt) and P_sound (acoustic radiation) dissipation terms from report §5.1.4–5.1.5 in physics.js/energy.js, or add a code comment noting they are intentionally omitted as second-order effects per the report's own characterization.
(Optional, scope decision) Either add a Hertzian contact mode (§4.2–4.3, using stiffness H_k from Table 1) as an alternative to the instantaneous-impulse model, or add a comment/README note that the simulation deliberately implements only the instantaneous-impulse approximation.
Remove or wire up the unused CollisionSystem.energyLost() static method — it currently duplicates logic in resolvePair but is dead code.
