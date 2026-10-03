# Design System Skill

## Goal
Keep generated designs connected to the project's component and token system.

## Retrieval order
1. Existing exact component
2. Existing compatible variant
3. Existing related component pattern
4. Primitive construction only when no supported reusable asset exists

## Token rules
- Reuse variable bindings when possible.
- Avoid hardcoded colors, spacing and radii when equivalent variables exist.
- Never create duplicate components for an equivalent established pattern.
